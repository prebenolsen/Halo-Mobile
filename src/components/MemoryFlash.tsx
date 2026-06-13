interface Props {
  visible: boolean
  withCalendar?: boolean
}

export function MemoryFlash({ visible, withCalendar }: Props) {
  if (!visible) return null
  return (
    <div className="memory-flash">
      <svg className="memory-flash__icon" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="2" width="13" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4 6h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M8 10h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M8 13.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M8 17h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="18" cy="18" r="4" fill="#28c8ff" />
        <path d="M18 16v2.5" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="18" cy="20" r="0.6" fill="#fff" />
      </svg>
      {withCalendar && (
        <svg className="memory-flash__icon" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="19" cy="19" r="4" fill="#28c8ff" />
          <path d="M17.5 19l1 1 2-2" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  )
}
