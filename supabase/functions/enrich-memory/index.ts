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
  'event_date: set when the statement references a specific event on a specific date or day (past or future). Resolve relative references using the provided Date (e.g. \'yesterday\' → Date minus 1, \'last Friday\' → compute from Date, \'tomorrow\' → Date plus 1, \'June 20\' → that date in the current or next year). For bare day-of-week references without explicit past context (\'last\', \'past\', \'previous\') — e.g. \'Friday\', \'Monday\' — resolve to the NEXT upcoming occurrence of that day (if today is Saturday and the user says \'Friday\', that means next Friday). Leave null when no specific date or day is mentioned\n' +
  'calendar_event: null only for general observations with no specific event. When the statement describes ANY event (party, gathering, meeting, dinner, appointment, etc.) on a specific date — past OR future — set to ' +
  '{"title":"concise event title","time":null_or_"HH:MM","type":"Birthday|Anniversary|Holiday|Meeting|Reminder|Work|Travel|Health","emoji":"single emoji","recurring":true_if_annual}. ' +
  'Set recurring=true for birthdays and anniversaries.\n' +
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

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function normalizeEntities(value: unknown): Array<{ type: string; name: string }> {
  if (!Array.isArray(value)) return []
  return value.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) return []
    const entity = item as Record<string, unknown>
    if (typeof entity.name !== 'string' || !entity.name.trim()) return []
    return [{
      type: typeof entity.type === 'string' && entity.type.trim() ? entity.type : 'person',
      name: entity.name.trim(),
    }]
  })
}

function clampImportance(value: unknown): number {
  const importance = typeof value === 'number' && Number.isFinite(value) ? value : 0.5
  return Math.max(0.1, Math.min(importance, 1.0))
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function memoryEntry(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    memory_types: parseJsonArray(row.memory_types),
    topics: parseJsonArray(row.topics),
    entities: parseJsonArray(row.entities),
    metadata_json: parseJsonObject(row.metadata_json),
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function to24h(h: number, meridiem: string): number {
  const pm = meridiem.toLowerCase() === 'pm'
  if (pm && h !== 12) return h + 12
  if (!pm && h === 12) return 0
  return h
}

function extractTime(text: string): string | null {
  // "at HH:MM am/pm"
  let m = text.match(/\bat\s+(\d{1,2}):(\d{2})\s*(am|pm)\b/i)
  if (m) {
    const h = to24h(parseInt(m[1]), m[3])
    return `${String(h).padStart(2, '0')}:${m[2]}`
  }
  // "at HH:MM" (24-hour)
  m = text.match(/\bat\s+(\d{1,2}):(\d{2})\b/i)
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`
  // "at H am/pm" — e.g. "at 8 pm" → "20:00"
  m = text.match(/\bat\s+(\d{1,2})\s*(am|pm)\b/i)
  if (m) {
    const h = to24h(parseInt(m[1]), m[2])
    return `${String(h).padStart(2, '0')}:00`
  }
  // "at 1800" (military without colon)
  m = text.match(/\bat\s+(\d{4})\b/i)
  if (m) return `${m[1].slice(0, 2)}:${m[1].slice(2)}`
  // "at 10" (bare hour, 24-hour assumed)
  m = text.match(/\bat\s+(\d{1,2})\b/i)
  if (m) return `${m[1].padStart(2, '0')}:00`
  // "H:MM am/pm" without "at" — e.g. "16:00" or "8:00 pm"
  m = text.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)\b/i)
  if (m) {
    const h = to24h(parseInt(m[1]), m[3])
    return `${String(h).padStart(2, '0')}:${m[2]}`
  }
  // "H:MM" without "at" (24-hour) — e.g. "16:00"
  m = text.match(/\b(\d{1,2}):(\d{2})\b/)
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`
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

async function answerFromMemories(query: string, db: ReturnType<typeof createClient>, openaiKey: string): Promise<string> {
  const { data: rows, error } = await db
    .from('memory_entries')
    .select('raw_text, memory_types, topics, entities, importance, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const scored = (rows ?? []).map(row => {
    const searchable = [
      row.raw_text,
      ...parseJsonArray(row.topics),
      ...parseJsonArray(row.entities).flatMap(entity =>
        typeof entity === 'object' && entity !== null && 'name' in entity
          ? [String((entity as Record<string, unknown>).name)]
          : []),
    ].join(' ').toLowerCase()
    const score = terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0)
    return { row, score }
  }).filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.row.importance) - Number(a.row.importance))
    .slice(0, 8)

  const context = scored.length
    ? scored.map(({ row }) => `- [${String(row.created_at).slice(0, 10)}] ${row.raw_text}`).join('\n')
    : '(No matching stored memories.)'
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'authorization': `Bearer ${openaiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 512,
      messages: [
        { role: 'system', content: 'Answer using only the supplied stored memories. If they do not answer the question, say so clearly. Do not invent memories.' },
        { role: 'user', content: `Question: ${query}\n\nStored memories:\n${context}` },
      ],
    }),
  })
  if (!response.ok) throw new Error('Answer model request failed')
  const data = await response.json()
  return data?.choices?.[0]?.message?.content?.trim() || 'I could not find an answer.'
}

async function listMemories(query: string, db: ReturnType<typeof createClient>): Promise<Record<string, unknown>[]> {
  const { data: rows, error } = await db
    .from('memory_entries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error

  const normalizedQuery = query.trim().toLowerCase()
  return (rows ?? []).map(row => memoryEntry(row as Record<string, unknown>)).filter(row => {
    if (!normalizedQuery) return true
    const searchable = [
      row.raw_text,
      ...parseJsonArray(row.topics),
      ...parseJsonArray(row.entities).flatMap(entity =>
        typeof entity === 'object' && entity !== null && 'name' in entity
          ? [String((entity as Record<string, unknown>).name)]
          : []),
    ].join(' ').toLowerCase()
    return searchable.includes(normalizedQuery)
  })
}

async function removeProfileMemoryLinks(entryId: string, db: ReturnType<typeof createClient>): Promise<void> {
  const { data: profiles, error } = await db.from('person_profiles').select('id, memory_ids')
  if (error) throw error
  for (const profile of profiles ?? []) {
    const memoryIds = parseJsonArray(profile.memory_ids).filter((id): id is string => typeof id === 'string' && id !== entryId)
    if (memoryIds.length !== parseJsonArray(profile.memory_ids).length) {
      const { error: updateError } = await db
        .from('person_profiles')
        .update({ memory_ids: JSON.stringify(memoryIds), updated_at: nowOslo() })
        .eq('id', profile.id)
      if (updateError) throw updateError
    }
  }
}

async function linkPersonProfiles(
  entryId: string,
  entities: Array<{ type: string; name: string }>,
  db: ReturnType<typeof createClient>,
  now: string,
): Promise<void> {
  for (const entity of entities.filter(item => item.type === 'person')) {
    const { data: profile, error: profileError } = await db
      .from('person_profiles')
      .select('id, memory_ids')
      .eq('name', entity.name)
      .maybeSingle()
    if (profileError) throw profileError

    const memoryIds = parseJsonArray(profile?.memory_ids).filter((id): id is string => typeof id === 'string')
    if (!memoryIds.includes(entryId)) memoryIds.push(entryId)
    if (profile) {
      const { error: updateError } = await db
        .from('person_profiles')
        .update({ memory_ids: JSON.stringify(memoryIds), updated_at: now })
        .eq('id', profile.id)
      if (updateError) throw updateError
    } else {
      const { error: insertError } = await db.from('person_profiles').insert({
        id: crypto.randomUUID(),
        name: entity.name,
        created_at: now,
        updated_at: now,
        memory_ids: JSON.stringify([entryId]),
        metadata_json: JSON.stringify({}),
      })
      if (insertError) throw insertError
    }
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
    const payload = await req.json()
    const { raw_text, source = 'pwa', mode = 'note', id = '', query = '' } = payload
    const textRequired = mode === 'note' || mode === 'ask' || mode === 'update_memory'
    if (textRequired && (!raw_text || typeof raw_text !== 'string')) {
      return new Response(JSON.stringify({ error: 'raw_text required' }), {
        status: 400, headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
    // SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected by Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const db = createClient(supabaseUrl, serviceKey)

    if (mode === 'memories') {
      const entries = await listMemories(typeof query === 'string' ? query : '', db)
      return new Response(JSON.stringify({ entries }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (mode === 'update_memory') {
      const entryId = typeof id === 'string' ? id : ''
      if (!entryId || !raw_text.trim()) throw new Error('id and raw_text are required')
      const meta = await extractMetadata(raw_text.trim(), openaiKey)
      const now = nowOslo()
      const memoryTypes = stringArray(meta.memory_types)
      const topics = stringArray(meta.topics)
      const entities = normalizeEntities(meta.entities)
      const { data, error } = await db.from('memory_entries').update({
        raw_text: raw_text.trim(),
        memory_types: JSON.stringify(memoryTypes),
        topics: JSON.stringify(topics),
        entities: JSON.stringify(entities),
        importance: clampImportance(meta.importance),
        event_date: typeof meta.event_date === 'string' ? meta.event_date : null,
        updated_at: now,
      }).eq('id', entryId).select().single()
      if (error) throw error
      await removeProfileMemoryLinks(entryId, db)
      await linkPersonProfiles(entryId, entities, db, now)
      return new Response(JSON.stringify({ entry: memoryEntry(data as Record<string, unknown>) }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (mode === 'delete_memory') {
      const entryId = typeof id === 'string' ? id : ''
      if (!entryId) throw new Error('id is required')
      const { error } = await db.from('memory_entries').delete().eq('id', entryId)
      if (error) throw error
      await removeProfileMemoryLinks(entryId, db)
      return new Response(JSON.stringify({ deleted: true, id: entryId }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    if (mode === 'ask') {
      const answer = await answerFromMemories(raw_text.trim(), db, openaiKey)
      return new Response(JSON.stringify({ answer }), {
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    const meta = await extractMetadata(raw_text, openaiKey)
    // Explicit user writes are always intentional — skip the memorable gate
    // (memorable gate is only meaningful for voice transcription noise in Halo desktop)

    const now = nowOslo()
    const memoryTypes = stringArray(meta.memory_types)
    const topics = stringArray(meta.topics)
    const entities = normalizeEntities(meta.entities)
    const importance = clampImportance(meta.importance)
    const eventDate = typeof meta.event_date === 'string' ? meta.event_date : null
    const entryId = crypto.randomUUID()

    const { data, error } = await db.from('memory_entries').insert({
      id: entryId,
      raw_text,
      source,
      memory_types: JSON.stringify(memoryTypes),
      topics: JSON.stringify(topics),
      entities: JSON.stringify(entities),
      importance,
      event_date: eventDate,
      metadata_json: JSON.stringify({}),
      created_at: now,
      updated_at: now,
    }).select().single()

    if (error) throw error

    // Keep person profile links compatible with Halo's PostgreSQL writer.
    try {
      await linkPersonProfiles(entryId, entities, db, now)
    } catch {
      // The memory row remains authoritative if profile enrichment fails.
    }

    const cal = meta.calendar_event as Record<string, unknown> | null | undefined
    const hasCal = cal !== null && cal !== undefined && typeof cal === 'object'
    const isEvent = memoryTypes.includes('event')
    let calendarInserted = false

    // Insert into calendar_events when the LLM returns a calendar_event object, OR when
    // memory_types includes 'event' and we have a date (fallback for when LLM skips calendar_event).
    let calendarError: string | null = null
    if (eventDate && (hasCal || isEvent)) {
      try {
        const calType = (cal?.type && typeof cal.type === 'string') ? cal.type : 'Meeting'
        const { error: calErr } = await db.from('calendar_events').insert({
          title: (cal?.title && typeof cal.title === 'string' ? cal.title : raw_text).slice(0, 200),
          date: eventDate,
          time: (cal?.time && typeof cal.time === 'string') ? cal.time : extractTime(raw_text),
          type: calType,
          emoji: (cal?.emoji && typeof cal.emoji === 'string') ? cal.emoji : (EMOJI_DEFAULTS[calType] ?? '📅'),
          notes: null,
          recurring: (cal?.recurring === true) ? 1 : 0,
        })
        if (calErr) calendarError = calErr.message
        else calendarInserted = true
      } catch (e) { calendarError = String(e) }
    }

    return new Response(JSON.stringify({ entry: data, calendar_inserted: calendarInserted, calendar_error: calendarError }), {
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
})
