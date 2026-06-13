import React, { useRef, useMemo, useState, useEffect } from 'react'
import type { CalendarEvent } from '../types'

interface Props {
  events: CalendarEvent[]
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function getOsloToday(): string {
  try {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' })
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

function getOsloTomorrow(): string {
  try {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' })
  } catch {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  }
}

function effectiveDate(ev: CalendarEvent, currentYear: number): string {
  if (!ev.recurring) return ev.date
  return `${currentYear}-${ev.date.slice(5)}`
}

function formatDate(dateStr: string): string {
  const parts = dateStr.split('-')
  const month = parseInt(parts[1], 10)
  const day = parseInt(parts[2], 10)
  return `${MONTH_SHORT[month - 1]} ${day}`
}

function EventItem({ ev, effDate, isPast, isToday }: {
  ev: CalendarEvent
  effDate: string
  isPast: boolean
  isToday: boolean
}) {
  return (
    <div
      className={[
        'mob-cal-list-item',
        isPast ? 'mob-cal-list-item--past' : '',
        isToday ? 'mob-cal-list-item--today' : '',
      ].filter(Boolean).join(' ')}
    >
      <span className="mob-cal-list-item__emoji">{ev.emoji}</span>
      <span className="mob-cal-list-item__title">{ev.title}</span>
      {ev.recurring && ev.type !== 'Birthday' && (
        <span className="mob-cal-list-item__badge">yearly</span>
      )}
      {isToday ? (
        ev.time && <span className="mob-cal-list-item__time">{ev.time}</span>
      ) : ev.time ? (
        <span className="mob-cal-list-item__date">
          {formatDate(effDate)} · <span className="mob-cal-list-item__time">{ev.time}</span>
        </span>
      ) : (
        <span className="mob-cal-list-item__date">{formatDate(effDate)}</span>
      )}
    </div>
  )
}

function DropUpSection({ label, count, open, onToggle, children }: {
  label: string
  count: number
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="mob-cal-dropup">
      {open ? (
        <div className="mob-cal-dropup__content">
          <div className="mob-cal-list-divider mob-cal-list-divider--toggle" onClick={onToggle}>
            <span>{label}</span>
            <span className="mob-cal-dropup__count">{count}</span>
            <span className="mob-cal-dropup__arrow">▼</span>
          </div>
          {children}
        </div>
      ) : (
        <button className="mob-cal-dropup__toggle" onClick={onToggle}>
          <span>{label}</span>
          <span className="mob-cal-dropup__count">{count}</span>
          <span className="mob-cal-dropup__arrow">▲</span>
        </button>
      )}
    </div>
  )
}

export function CalendarListPanel({ events }: Props) {
  const today = useMemo(() => getOsloToday(), [])
  const tomorrow = useMemo(() => getOsloTomorrow(), [])
  const currentYear = new Date().getFullYear()
  const todayRef = useRef<HTMLDivElement>(null)
  const hasScrolled = useRef(false)
  const [birthdaysOpen, setBirthdaysOpen] = useState(false)
  const [upcomingOpen, setUpcomingOpen] = useState(false)

  useEffect(() => {
    if (!hasScrolled.current && events.length > 0) {
      hasScrolled.current = true
      setTimeout(() => {
        todayRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' })
      }, 50)
    }
  }, [events.length])

  const sorted = useMemo(() => {
    return [...events].sort((a, b) => {
      const da = effectiveDate(a, currentYear)
      const db = effectiveDate(b, currentYear)
      return da.localeCompare(db)
    })
  }, [events, currentYear])

  const mainEvents = useMemo(() => sorted.filter(ev => {
    const effDate = effectiveDate(ev, currentYear)
    if (effDate > tomorrow) return false
    if (ev.type !== 'Birthday') return true
    return effDate === today || effDate === tomorrow
  }), [sorted, today, tomorrow, currentYear])

  const birthdays = useMemo(() => sorted.filter(ev => ev.type === 'Birthday'), [sorted])
  const upcoming = useMemo(() => sorted.filter(ev =>
    ev.type !== 'Birthday' && effectiveDate(ev, currentYear) > tomorrow
  ), [sorted, tomorrow, currentYear])

  const items: React.ReactNode[] = []
  let todayMarkerInserted = false
  let tomorrowMarkerInserted = false

  for (const ev of mainEvents) {
    const effDate = effectiveDate(ev, currentYear)
    const isPast = effDate < today
    const isToday = effDate === today
    const isTomorrow = effDate === tomorrow

    if (!todayMarkerInserted && !isPast) {
      todayMarkerInserted = true
      items.push(
        <div key="today-marker" ref={todayRef} className="mob-cal-list-divider">Today</div>
      )
    }

    if (!tomorrowMarkerInserted && isTomorrow) {
      tomorrowMarkerInserted = true
      items.push(
        <div key="tomorrow-marker" className="mob-cal-list-divider">Tomorrow</div>
      )
    }

    items.push(
      <EventItem key={ev.id} ev={ev} effDate={effDate} isPast={isPast} isToday={isToday} />
    )
  }

  if (!todayMarkerInserted) {
    items.push(
      <div key="today-marker" ref={todayRef} className="mob-cal-list-divider">Today</div>
    )
  }

  const renderFlat = (list: CalendarEvent[]): React.ReactNode[] => list.map(ev => {
    const effDate = effectiveDate(ev, currentYear)
    return (
      <EventItem
        key={ev.id} ev={ev} effDate={effDate}
        isPast={effDate < today} isToday={effDate === today}
      />
    )
  })

  if (sorted.length === 0) {
    return <div className="mob-cal-list-empty">No events</div>
  }

  return (
    <>
      <div className="mob-cal-list">{items}</div>
      {upcoming.length > 0 && (
        <DropUpSection
          label="Upcoming" count={upcoming.length}
          open={upcomingOpen} onToggle={() => setUpcomingOpen(o => !o)}
        >
          {renderFlat(upcoming)}
        </DropUpSection>
      )}
      {birthdays.length > 0 && (
        <DropUpSection
          label="🎂 Birthdays" count={birthdays.length}
          open={birthdaysOpen} onToggle={() => setBirthdaysOpen(o => !o)}
        >
          {renderFlat(birthdays)}
        </DropUpSection>
      )}
    </>
  )
}
