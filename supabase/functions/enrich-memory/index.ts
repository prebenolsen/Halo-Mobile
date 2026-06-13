import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const METADATA_SYSTEM =
  'Analyze a user statement and extract memory metadata. ' +
  'Respond ONLY with valid JSON (no markdown, no explanation):\n' +
  '{"memorable":bool,"memory_types":[],"topics":[],"entities":[],"importance":float,"event_date":null_or_YYYY-MM-DD,"calendar_event":null_or_object}\n' +
  'memory_types choices: idea observation fact preference concern decision future_decision event person_update goal reflection\n' +
  'person_update: use when a named person\'s health, feelings, activities, relationships, or status are described\n' +
  'entities format: [{"type":"person|place|company|product|project","name":"..."}]\n' +
  'importance: 0.1=passing thought, 0.5=useful context, 0.8=significant personal info, 1.0=critical\n' +
  'event_date: set when the statement references a specific event on a specific date or day (past or future). Resolve relative references using the provided Date (e.g. \'yesterday\' → Date minus 1, \'last Friday\' → compute from Date, \'tomorrow\' → Date plus 1, \'June 20\' → that date in the current or next year). Leave null when no specific date or day is mentioned\n' +
  'calendar_event: null for general observations and past events. When the statement describes a future or recurring event on a specific date, set to ' +
  '{"title":"concise event title","time":null_or_"HH:MM","type":"Birthday|Anniversary|Holiday|Meeting|Reminder|Work|Travel|Health","emoji":"single emoji","recurring":true_if_annual}. ' +
  'Set recurring=true for birthdays and anniversaries. Use null for past events (yesterday, last week, etc.)\n' +
  'memorable=false for: pure commands, simple factual questions, trivial system interactions\n' +
  'memorable=false for: garbled, nonsensical, fragmentary, or incomplete statements (transcription noise, half sentences, word salad)\n' +
  'memorable=true for: personal observations, updates about named people (health, feelings, activities), preferences, plans, life events, ideas\n' +
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

function extractTime(text: string): string | null {
  // "at 18:00" or "at 10:00"
  let m = text.match(/\bat\s+(\d{1,2}):(\d{2})\b/i)
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`
  // "at 1800" (military without colon)
  m = text.match(/\bat\s+(\d{4})\b/i)
  if (m) return `${m[1].slice(0, 2)}:${m[1].slice(2)}`
  // "at 10" (bare hour)
  m = text.match(/\bat\s+(\d{1,2})\b/i)
  if (m) return `${m[1].padStart(2, '0')}:00`
  return null
}

const EMOJI_DEFAULTS: Record<string, string> = {
  Birthday: '🎂', Anniversary: '💒', Holiday: '🎉',
  Meeting: '📅', Reminder: '🔔', Work: '💼', Travel: '✈️', Health: '🏥',
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
        max_tokens: 512,
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
    // Explicit user writes are always intentional — skip the memorable gate
    // (memorable gate is only meaningful for voice transcription noise in Halo desktop)

    const now = nowOslo()
    const db = createClient(supabaseUrl, serviceKey)

    const { data, error } = await db.from('memory_entries').insert({
      raw_text,
      source,
      memory_types: JSON.stringify(meta.memory_types ?? []),
      topics: JSON.stringify(meta.topics ?? []),
      entities: JSON.stringify(
        Array.isArray(meta.entities)
          ? meta.entities.filter((e: unknown) => typeof e === 'object' && e !== null && 'name' in e)
          : []
      ),
      importance: typeof meta.importance === 'number' ? meta.importance : 0.5,
      event_date: typeof meta.event_date === 'string' ? meta.event_date : null,
      created_at: now,
      updated_at: now,
    }).select().single()

    if (error) throw error

    // Write to calendar_events when the LLM returns a calendar_event object AND resolved a date.
    // We use calendar_event presence (not memory_types) as the trigger because the LLM reliably
    // populates calendar_event for future/recurring events even when it omits 'event' from memory_types.
    const cal = meta.calendar_event as Record<string, unknown> | null | undefined
    const hasCal = cal !== null && cal !== undefined && typeof cal === 'object'
    const eventDate = typeof meta.event_date === 'string' ? meta.event_date : null
    let calendarInserted = false

    if (hasCal && eventDate) {
      try {
        const calType = (cal?.type && typeof cal.type === 'string') ? cal.type : 'Meeting'
        const { error: calErr } = await db.from('calendar_events').insert({
          title: (cal?.title && typeof cal.title === 'string' ? cal.title : raw_text).slice(0, 200),
          date: eventDate,
          time: (cal?.time && typeof cal.time === 'string') ? cal.time : extractTime(raw_text),
          type: calType,
          emoji: (cal?.emoji && typeof cal.emoji === 'string') ? cal.emoji : (EMOJI_DEFAULTS[calType] ?? '📅'),
          notes: null,
          source: 'pwa',
          recurring: cal?.recurring === true,
        })
        if (!calErr) calendarInserted = true
      } catch { /* calendar insert failure is non-fatal */ }
    }

    return new Response(JSON.stringify({ entry: data, calendar_inserted: calendarInserted }), {
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
})
