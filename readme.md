# Halo-Mobile

Halo-Mobile stores free-form notes through the Supabase `enrich-memory` Edge
Function. Its persistence contract is shared with Halo's Memory Engine.

## Memory storage

The Edge Function writes to the shared `memory_entries` table using the same
columns and JSON-string encoding as Halo's PostgreSQL backend:

- `id`, `created_at`, and `updated_at`
- Original `raw_text`
- `memory_types`, `topics`, and `entities`
- Numeric `importance`
- Optional `event_date` and `source` (`pwa` for mobile notes)
- `metadata_json`

Person entities are also linked in `person_profiles` using the same JSON array
of memory IDs as Halo. The schema is defined in
`supabase/migrations/20260923000000_memory_engine_contract.sql` and must be
applied to the Supabase project used by both applications.

Mobile note entry is intentionally explicit: the note is stored even when the
LLM metadata classifier would otherwise mark it non-memorable. This differs
from Halo's voice-transcription fallback, which filters likely transcription
noise before storage, but the resulting database row shape is identical.

## Input zones

- Clicking the bottom 80% opens the note input with `Write a note…`. Submitting
	it stores the text in `memory_entries`.
- Clicking the top 20% opens the ask input with `Ask away`. Submitting it
	searches stored memories and returns an LLM-grounded answer without storing
	the question as a memory.
- Entering `/memories` in an input overlay opens the memory browser. You can
	search the loaded memories, edit their original text, or delete them
	permanently. Editing re-runs metadata enrichment and refreshes person links.