import { useMemo, useState } from 'react'

export interface MemoryEntry {
  id: string
  raw_text: string
  memory_types: string[]
  topics: string[]
  entities: Array<{ type?: string; name?: string }>
  importance: number
  event_date: string | null
  created_at: string
  updated_at: string
}

interface Props {
  entries: MemoryEntry[]
  loading: boolean
  query: string
  error: string | null
  onClose: () => void
  onDelete: (id: string) => Promise<void>
  onUpdate: (id: string, text: string) => Promise<void>
}

function importanceClass(importance: number): string {
  if (importance >= 0.75) return 'memory-card--high'
  if (importance >= 0.4) return 'memory-card--medium'
  return 'memory-card--low'
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toLocaleDateString()
}

export function MemoryViewer({ entries, loading, query, error, onClose, onDelete, onUpdate }: Props) {
  const [search, setSearch] = useState(query)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const visibleEntries = useMemo(() => {
    const normalized = search.trim().toLowerCase()
    if (!normalized) return entries
    return entries.filter(entry => [
      entry.raw_text,
      ...entry.memory_types,
      ...entry.topics,
      ...entry.entities.map(entity => entity.name ?? ''),
    ].join(' ').toLowerCase().includes(normalized))
  }, [entries, search])

  const beginEdit = (entry: MemoryEntry) => {
    setEditingId(entry.id)
    setEditingText(entry.raw_text)
  }

  const saveEdit = async () => {
    if (!editingId || !editingText.trim()) return
    setBusyId(editingId)
    try {
      await onUpdate(editingId, editingText.trim())
      setEditingId(null)
      setEditingText('')
    } finally {
      setBusyId(null)
    }
  }

  const deleteEntry = async (entry: MemoryEntry) => {
    if (!window.confirm('Delete this memory permanently?')) return
    setBusyId(entry.id)
    try {
      await onDelete(entry.id)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="memory-viewer-overlay" onClick={onClose}>
      <section className="memory-viewer" onClick={event => event.stopPropagation()} aria-label="Memory viewer">
        <header className="memory-viewer__header">
          <div>
            <span className="memory-viewer__eyebrow">LONG-TERM MEMORY</span>
            <h1>Memories</h1>
            <p>{visibleEntries.length} {visibleEntries.length === 1 ? 'entry' : 'entries'}</p>
          </div>
          <button className="memory-viewer__close" onClick={onClose} aria-label="Close memories">×</button>
        </header>

        <input
          className="memory-viewer__search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search memories"
          aria-label="Search memories"
        />

        {error && <p className="memory-viewer__error">{error}</p>}
        {loading && <p className="memory-viewer__empty">Loading memories…</p>}
        {!loading && !error && visibleEntries.length === 0 && (
          <p className="memory-viewer__empty">No memories found.</p>
        )}

        <div className="memory-list">
          {visibleEntries.map(entry => (
            <article className={`memory-card ${importanceClass(entry.importance)}`} key={entry.id}>
              <div className="memory-card__meta">
                <time dateTime={entry.created_at}>{formatDate(entry.created_at)}</time>
                <span>{Math.round(entry.importance * 100)}% importance</span>
              </div>
              {editingId === entry.id ? (
                <textarea
                  className="memory-card__editor"
                  value={editingText}
                  onChange={event => setEditingText(event.target.value)}
                  autoFocus
                  rows={4}
                />
              ) : (
                <p className="memory-card__text">{entry.raw_text}</p>
              )}
              <div className="memory-card__tags">
                {entry.memory_types.map(type => <span key={type}>{type}</span>)}
                {entry.entities.map(entity => entity.name ? <span key={`${entry.id}-${entity.name}`}>{entity.name}</span> : null)}
              </div>
              <div className="memory-card__actions">
                {editingId === entry.id ? (
                  <>
                    <button className="memory-action memory-action--quiet" onClick={() => setEditingId(null)} disabled={busyId === entry.id}>Cancel</button>
                    <button className="memory-action" onClick={() => void saveEdit()} disabled={!editingText.trim() || busyId === entry.id}>Save</button>
                  </>
                ) : (
                  <>
                    <button className="memory-action memory-action--quiet" onClick={() => beginEdit(entry)} disabled={busyId === entry.id}>Edit</button>
                    <button className="memory-action memory-action--danger" onClick={() => void deleteEntry(entry)} disabled={busyId === entry.id}>Delete</button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
