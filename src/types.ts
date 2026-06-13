export interface CalendarEvent {
  id: number
  title: string
  date: string
  time: string | null
  type: string
  emoji: string
  notes: string | null
  recurring: boolean
  created_at: string
}
