import { useState, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { useCalendar } from './hooks/useCalendar'
import { LoginScreen } from './components/LoginScreen'
import { Sun } from './components/Sun'
import { NoteInput } from './components/NoteInput'
import { MemoryFlash } from './components/MemoryFlash'
import { CalendarPanel } from './components/CalendarPanel'
import { CalendarListPanel } from './components/CalendarListPanel'
import './styles/globals.css'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [noteOpen, setNoteOpen] = useState(false)
  const [flash, setFlash] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)

  const { events, eventsForMonth, loading: calLoading, viewYear, viewMonth, navigate, refetch: refetchCalendar } = useCalendar()

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
    if (!noteOpen && !calendarOpen) setNoteOpen(true)
  }

  const saveNote = async (text: string) => {
    setNoteOpen(false)
    setSaveError(null)

    const { data, error } = await supabase.functions.invoke('enrich-memory', {
      body: { raw_text: text, source: 'pwa' },
    })

    if (error) {
      setSaveError('Failed to save note.')
    } else {
      setFlash(true)
      setTimeout(() => setFlash(false), 2500)
      // Immediately refresh the calendar if a new event was created
      if (data?.calendar_inserted) {
        void refetchCalendar()
      }
    }
  }

  if (loading) return <div className="splash" />
  if (!session) return <LoginScreen />

  return (
    <div className="app" onClick={openNote}>
      <Sun />

      {/* Calendar toggle — top-left */}
      <button
        className="calendar-toggle"
        onClick={e => { e.stopPropagation(); setCalendarOpen(o => !o) }}
        aria-label="Toggle calendar"
        title="Calendar"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>

      {/* Calendar overlay */}
      <div
        className={`calendar-overlay${calendarOpen ? ' calendar-overlay--open' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        <CalendarPanel
          events={eventsForMonth}
          loading={calLoading}
          viewYear={viewYear}
          viewMonth={viewMonth}
          onNavigate={navigate}
        />
        <div className="calendar-overlay__divider" />
        <div className="calendar-overlay__list">
          <CalendarListPanel events={events} />
        </div>
      </div>

      {calendarOpen && (
        <div className="calendar-backdrop" onClick={() => setCalendarOpen(false)} />
      )}

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
