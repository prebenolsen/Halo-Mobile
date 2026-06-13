import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Exact same prompt as Halo's memory_engine/pipeline.py _METADATA_SYSTEM
const METADATA_SYSTEM =
  'Analyze a user statement and extract memory metadata. ' +
  'Respond ONLY with valid JSON (no markdown, no explanation):\n' +
  '{"memorable":bool,"memory_types":[],"topics":[],"entities":[],"importance":float,"event_date":null_or_YYYY-MM-DD}\n' +
  'memory_types choices: idea observation fact preference concern decision future_decision event person_update goal reflection\n' +
  'entities format: [{"type":"person|place|company|product|project","name":"..."}]\n' +
  'importance: 0.1=passing thought, 0.5=useful context, 0.8=significant personal info, 1.0=critical\n' +
  'event_date: only when statement references a specific future event with a clear date\n' +
  'memorable=false for: pure commands, simple factual questions, trivial system interactions\n' +
  'memorable=false for: garbled, nonsensical, fragmentary, or incomplete statements (transcription noise, half sentences, word salad)\n' +
  'memorable=true for: personal observations, thoughts about people, preferences, plans, life events, ideas\n' +
  'If there is ANY doubt that the statement is a coherent, complete thought, set memorable=false'

function nowOslo(): string {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Oslo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(now).filter(p => p.type !== 'literal').map(p => [p.type, p.value])
  )
  const local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
  const localAsUTC = new Date(`${local}Z`).getTime()
  const offsetMins = Math.round((localAsUTC - now.getTime()) / 60000)
  const sign = offsetMins >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMins)
  const h = String(Math.floor(abs / 60)).padStart(2, '0')
  const m = String(abs % 60).padStart(2, '0')
  return `${local}${sign}${h}:${m}`
}

function today(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' })
}

async function extractMetadata(rawText: string, openaiKey: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${openaiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 256,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: METADATA_SYSTEM },
          { role: 'user', content: `Date: ${today()}\nStatement: "${rawText}"` },
        ],
      }),
    })
    if (!res.ok) return {}
    const data = await res.json()
    const content: string = data?.choices?.[0]?.message?.content ?? ''
    return JSON.parse(content)
  } catch {
    return {}
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  try {
    const { raw_text, source = 'pwa' } = await req.json()
    if (!raw_text || typeof raw_text !== 'string') {
      return new Response(JSON.stringify({ error: 'raw_text required' }), {
        status: 400, headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
    // SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected by Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const meta = await extractMetadata(raw_text, openaiKey)
    const memorable = meta.memorable !== false  // default to true for explicit writes

    const now = nowOslo()
    const db = createClient(supabaseUrl, serviceKey)

    const { data, error } = await db.from('memory_entries').insert({
      raw_text,
      source,
      memory_types: JSON.stringify(memorable ? (meta.memory_types ?? []) : []),
      topics: JSON.stringify(memorable ? (meta.topics ?? []) : []),
      entities: JSON.stringify(
        memorable
          ? (Array.isArray(meta.entities) ? meta.entities.filter((e: unknown) =>
              typeof e === 'object' && e !== null && 'name' in e) : [])
          : []
      ),
      importance: typeof meta.importance === 'number' ? meta.importance : 0.5,
      event_date: memorable && typeof meta.event_date === 'string' ? meta.event_date : null,
      created_at: now,
      updated_at: now,
    }).select().single()

    if (error) throw error

    return new Response(JSON.stringify(data), {
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
})
