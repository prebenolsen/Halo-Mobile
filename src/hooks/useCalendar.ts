import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { CalendarEvent } from '../types'

export function useCalendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [view, setView] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  })

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .order('date', { ascending: true })
      if (error) {
        setFetchError(error.message)
      } else if (data) {
        setEvents(
          data.map(r => ({
            id: r.id as number,
            title: r.title as string,
            date: (r.date as string).slice(0, 10),
            time: (r.time as string | null) ?? null,
            type: r.type as string,
            emoji: r.emoji as string,
            notes: (r.notes as string | null) ?? null,
            recurring: Boolean(r.recurring),
            created_at: r.created_at as string,
          }))
        )
      }
    } catch (e) {
      setFetchError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchEvents()
  }, [fetchEvents])

  const navigate = useCallback((delta: -1 | 1) => {
    setView(({ year, month }) => {
      const m = month + delta
      if (m < 1) return { year: year - 1, month: 12 }
      if (m > 12) return { year: year + 1, month: 1 }
      return { year, month: m }
    })
  }, [])

  const eventsForMonth = events.filter(ev => {
    if (ev.recurring) {
      return String(view.month).padStart(2, '0') === ev.date.slice(5, 7)
    }
    return ev.date.startsWith(`${view.year}-${String(view.month).padStart(2, '0')}`)
  })

  return {
    events,
    eventsForMonth,
    loading,
    fetchError,
    viewYear: view.year,
    viewMonth: view.month,
    navigate,
    refetch: fetchEvents,
  }
}
