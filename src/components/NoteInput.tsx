import { useState, useRef, useEffect } from 'react'

interface Props {
  onSave: (text: string) => void
  onDismiss: () => void
}

export function NoteInput({ onSave, onDismiss }: Props) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    // Slight delay so the overlay renders before focus (iOS keyboard timing)
    const t = setTimeout(() => ref.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [])

  const submit = () => {
    const trimmed = text.trim()
    if (trimmed) onSave(trimmed)
    else onDismiss()
  }

  return (
    <div className="note-overlay" onClick={onDismiss}>
      <div className="note-box" onClick={e => e.stopPropagation()}>
        <textarea
          ref={ref}
          className="note-textarea"
          placeholder="Write a note…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
            if (e.key === 'Escape') onDismiss()
          }}
          rows={4}
        />
        <div className="note-actions">
          <button className="note-btn note-btn--cancel" onClick={onDismiss}>Cancel</button>
          <button className="note-btn note-btn--save" onClick={submit} disabled={!text.trim()}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
