import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { LANGUAGES, type LangCode } from '../i18n'

interface LangPickerProps {
  lang: LangCode
  onChangeLang: (lang: LangCode) => void
}

export default function LangPicker({ lang, onChangeLang }: LangPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const current = LANGUAGES.find(l => l.code === lang) ?? LANGUAGES[0]

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold
          transition-colors hover:opacity-80"
        style={{
          background: 'var(--surface-muted)',
          color: 'var(--ink-2)',
          border: '1px solid var(--border)',
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span style={{ fontSize: 14 }}>{current.flag}</span>
        <span className="hidden sm:inline">{current.code.toUpperCase()}</span>
        <ChevronDown size={12} style={{ color: 'var(--subtle)' }} />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1.5 z-50 rounded-2xl"
          style={{
            width: 192,
            background: 'var(--surface-strong)',
            backdropFilter: 'blur(32px)',
            WebkitBackdropFilter: 'blur(32px)',
            border: '1px solid var(--border-strong)',
            boxShadow: '0 8px 32px rgba(15,35,64,0.14)',
            overflow: 'hidden',
          }}
          role="listbox"
        >
          {/* Spectral strip */}
          <div style={{ height: 3, background: 'var(--spectral)', flexShrink: 0 }} />

          {/* Language list — scroll nếu overflow */}
          <div style={{ overflowY: 'auto', maxHeight: 320 }}>
            {LANGUAGES.map(l => {
              const active = l.code === lang
              return (
                <button
                  key={l.code}
                  role="option"
                  aria-selected={active}
                  onClick={() => { onChangeLang(l.code); setOpen(false) }}
                  className="w-full flex items-center gap-2.5 text-left transition-colors"
                  style={{
                    padding: '10px 14px',
                    fontSize: 13,
                    color: active ? 'var(--accent)' : 'var(--ink)',
                    background: active ? 'var(--accent-soft)' : 'transparent',
                    fontWeight: active ? 600 : 400,
                    borderBottom: '1px solid var(--border)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{l.flag}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {l.label}
                  </span>
                  {active && (
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                      <path d="M2.5 7l3 3 6-6" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
