interface Props {
  visible: boolean
}

export function MemoryFlash({ visible }: Props) {
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
    </div>
  )
}
