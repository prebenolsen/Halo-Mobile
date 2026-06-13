import { useState, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { LoginScreen } from './components/LoginScreen'
import { Sun } from './components/Sun'
import { NoteInput } from './components/NoteInput'
import { MemoryFlash } from './components/MemoryFlash'
import './styles/globals.css'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [noteOpen, setNoteOpen] = useState(false)
  const [flash, setFlash] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  const openNote = () => {
    if (!noteOpen) setNoteOpen(true)
  }

  const saveNote = async (text: string) => {
    setNoteOpen(false)
    setSaveError(null)
    const { error } = await supabase.from('memory_entries').insert({
      raw_text: text,
      source: 'pwa',
    })
    if (error) {
      setSaveError('Failed to save note.')
    } else {
      setFlash(true)
      setTimeout(() => setFlash(false), 2500)
    }
  }

  if (loading) return <div className="splash" />
  if (!session) return <LoginScreen />

  return (
    <div className="app" onClick={openNote}>
      <Sun />
      {noteOpen && (
        <NoteInput onSave={saveNote} onDismiss={() => setNoteOpen(false)} />
      )}
      <MemoryFlash visible={flash} />
      {saveError && (
        <div className="save-error" onClick={e => { e.stopPropagation(); setSaveError(null) }}>
          {saveError}
        </div>
      )}
      <button
        className="sign-out"
        onClick={e => { e.stopPropagation(); supabase.auth.signOut() }}
      >
        Sign out
      </button>
    </div>
  )
}
