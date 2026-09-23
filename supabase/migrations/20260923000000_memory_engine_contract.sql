CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS memory_entries (
    id             TEXT PRIMARY KEY,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    raw_text       TEXT NOT NULL,
    memory_types   TEXT NOT NULL DEFAULT '[]',
    topics         TEXT NOT NULL DEFAULT '[]',
    entities       TEXT NOT NULL DEFAULT '[]',
    importance     DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    event_date     TEXT,
    source         TEXT NOT NULL DEFAULT 'voice',
    metadata_json  TEXT NOT NULL DEFAULT '{}',
    search_vector  tsvector GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(raw_text, ''))
    ) STORED
);

CREATE INDEX IF NOT EXISTS idx_memory_entries_created_at
    ON memory_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_entries_importance
    ON memory_entries(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memory_entries_fts
    ON memory_entries USING GIN(search_vector);

CREATE TABLE IF NOT EXISTS person_profiles (
    id            TEXT PRIMARY KEY,
    name          CITEXT NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    memory_ids    TEXT NOT NULL DEFAULT '[]',
    metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_person_profiles_name
    ON person_profiles(name);