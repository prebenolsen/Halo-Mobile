import { useMemo, useState } from 'react'
import type { CalendarEvent } from '../types'

interface Props {
  events: CalendarEvent[]
  loading: boolean
  viewYear: number
  viewMonth: number
  onNavigate: (delta: -1 | 1) => void
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Cell {
  day: number
  inMonth: boolean
  dateStr: string | null
}

function buildMonthGrid(year: number, month: number): Cell[] {
  const firstDayOfWeek = (new Date(year, month - 1, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month, 0).getDate()
  const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7

  return Array.from({ length: totalCells }, (_, i) => {
    const day = i - firstDayOfWeek + 1
    const inMonth = day >= 1 && day <= daysInMonth
    const dateStr = inMonth
      ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      : null
    return { day, inMonth, dateStr }
  })
}

function isoWeek(d: Date): number {
  const date = new Date(d)
  date.setDate(date.getDate() + 4 - (date.getDay() || 7))
  const yearStart = new Date(date.getFullYear(), 0, 1)
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

function mondayOfRow(rowIdx: number, year: number, month: number): Date {
  const firstDayOfWeek = (new Date(year, month - 1, 1).getDay() + 6) % 7
  return new Date(year, month - 1, 1 - firstDayOfWeek + rowIdx * 7)
}

function getOsloToday(): string {
  try {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' })
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

export function CalendarPanel({ events, loading, viewYear, viewMonth, onNavigate }: Props) {
  const today = useMemo(() => getOsloToday(), [])
  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth])
  const [activeDate, setActiveDate] = useState<string | null>(null)

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const ev of events) {
      const key = ev.recurring
        ? `${viewYear}-${ev.date.slice(5)}`
        : ev.date
      const list = map.get(key) ?? []
      list.push(ev)
      map.set(key, list)
    }
    return map
  }, [events, viewYear])

  const rows = grid.length / 7

  const activeEvents = activeDate ? (eventsByDate.get(activeDate) ?? []) : []

  return (
    <div className="mob-cal-panel">
      <div className="mob-cal-nav">
        <button className="mob-cal-nav__btn" onClick={() => onNavigate(-1)}>&#8249;</button>
        <span className="mob-cal-nav__title">{MONTH_NAMES[viewMonth - 1]} {viewYear}</span>
        <button className="mob-cal-nav__btn" onClick={() => onNavigate(1)}>&#8250;</button>
      </div>

      {loading ? (
        <div className="mob-cal-loading">Loading…</div>
      ) : (
        <div className="mob-cal-grid">
          <div className="mob-cal-grid__weeknum" />
          {DAY_HEADERS.map((d) => (
            <div key={d} className="mob-cal-grid__dayheader">{d}</div>
          ))}

          {Array.from({ length: rows }, (_, rowIdx) => {
            const monday = mondayOfRow(rowIdx, viewYear, viewMonth)
            const weekNum = isoWeek(monday)

            return [
              <div key={`wk-${rowIdx}`} className="mob-cal-grid__weeknum mob-cal-grid__weeknum--row">
                {weekNum}
              </div>,
              ...grid.slice(rowIdx * 7, rowIdx * 7 + 7).map((cell, colIdx) => {
                const isToday = cell.dateStr === today
                const dayEvents = cell.dateStr ? (eventsByDate.get(cell.dateStr) ?? []) : []
                const hasEvents = dayEvents.length > 0
                const isActive = cell.dateStr === activeDate

                const classes = [
                  'mob-cal-cell',
                  !cell.inMonth ? 'mob-cal-cell--outside' : '',
                  hasEvents ? 'mob-cal-cell--has-event' : '',
                  isToday ? 'mob-cal-cell--today' : '',
                  isActive ? 'mob-cal-cell--active' : '',
                ].filter(Boolean).join(' ')

                return (
                  <div
                    key={`${rowIdx}-${colIdx}`}
                    className={classes}
                    onClick={() => {
                      if (hasEvents && cell.dateStr) {
                        setActiveDate(prev => prev === cell.dateStr ? null : cell.dateStr)
                      }
                    }}
                  >
                    <span className="mob-cal-cell__day">{cell.inMonth ? cell.day : ''}</span>
                  </div>
                )
              }),
            ]
          })}
        </div>
      )}

      {activeEvents.length > 0 && (
        <div className="mob-cal-popover">
          {activeEvents.map((ev, i) => (
            <div key={i} className="mob-cal-popover__item">
              <span>{ev.emoji}</span>
              <span className="mob-cal-popover__title">{ev.title}</span>
              {ev.time && <span className="mob-cal-popover__time">{ev.time}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
