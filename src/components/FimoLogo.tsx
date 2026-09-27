/**
 * FimoLogo — brand logo component
 *
 * FILE NẰM TẠI: /public/brand/logo-full.png  (logo ngang có icon + chữ fimoPAY)
 * Máy local: H:\Airdrop\ARC\FiMo_dApp\Fimo-pay\public\brand\logo-full.png
 *
 * - Khi có file: hiện ảnh thật bên trái (tự đổi size theo height)
 * - Khi chưa có file: SVG fallback đúng brand (icon tròn xanh + chữ fimoPAY)
 * - Chữ "fimo" và "PAY" được render độc lập bằng code — không đổi dù thay icon
 * - Dark mode: chữ "fimo" trắng, "PAY" xanh sáng hơn
 */

import { useState } from 'react'

// Trỏ sang logo-full.png (logo ngang — icon + chữ fimoPAY trên nền trong suốt)
const SRC_FULL = '/brand/logo-full.png'
// Fallback: chỉ dùng icon vuông nếu logo-full không khả dụng
const SRC_ICON = '/brand/Website_fimopay.png'

interface FimoLogoProps {
  variant?: 'full' | 'icon'
  height?: number
  className?: string
  darkMode?: boolean
}

/* ── SVG Fallback ─────────────────────────────────────────────── */
function FimoSVGFallback({ height, variant, darkMode }: {
  height: number; variant: 'full' | 'icon'; darkMode: boolean
}) {
  const inkColor   = darkMode ? '#e8f4ff' : '#0b1e38'
  const accentColor = darkMode ? '#4da3ff' : '#1a6fff'

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height }}>
      {/* Icon: rounded square gradient + interlocked S rings */}
      <svg
        width={height} height={height}
        viewBox="0 0 40 40" fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <rect width="40" height="40" rx="10" fill="url(#fimo-grad)" />
        {/* Left ring */}
        <circle cx="15" cy="20" r="8" stroke="white" strokeWidth="3.5" fill="none" />
        {/* Right ring — slightly offset for S-link look */}
        <circle cx="25" cy="20" r="8" stroke="white" strokeWidth="3.5" fill="none" strokeOpacity="0.65" />
        <defs>
          <linearGradient id="fimo-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#5fbeff" />
            <stop offset="50%"  stopColor="#2a82ff" />
            <stop offset="100%" stopColor="#1a6fff" />
          </linearGradient>
        </defs>
      </svg>

      {/* Wordmark — only for full variant */}
      {variant === 'full' && (
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1.5 }}>
          <span style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: Math.round(height * 0.58),
            letterSpacing: '-0.03em',
            color: inkColor,
            lineHeight: 1,
            transition: 'color 0.3s',
          }}>
            fimo
          </span>
          <span style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: Math.round(height * 0.30),
            letterSpacing: '0.06em',
            color: accentColor,
            lineHeight: 1,
            textTransform: 'uppercase' as const,
            alignSelf: 'flex-start',
            marginTop: Math.round(height * 0.04),
            transition: 'color 0.3s',
          }}>
            PAY
          </span>
        </span>
      )}
    </span>
  )
}

/* ── Main component ──────────────────────────────────────────── */
export default function FimoLogo({
  variant = 'full',
  height = 34,
  className = '',
  darkMode = false,
}: FimoLogoProps) {
  const [fullFailed, setFullFailed] = useState(false)
  const [iconFailed, setIconFailed] = useState(false)

  const inkColor    = darkMode ? '#e8f4ff' : '#0b1e38'
  const accentColor = darkMode ? '#4da3ff' : '#1a6fff'

  // Both image sources failed → SVG fallback
  if (fullFailed && iconFailed) {
    return <FimoSVGFallback height={height} variant={variant} darkMode={darkMode} />
  }

  // logo-full.png — dùng làm ICON (hình vuông bên trái), chữ fimoPAY luôn render bằng code
  const iconSrc = !fullFailed ? SRC_FULL : (!iconFailed ? SRC_ICON : null)

  // Icon + chữ fimoPAY hardcoded — chữ KHÔNG BAO GIỜ thay đổi dù thay icon
  return (
    <span
      className={`inline-flex items-center ${className}`}
      style={{ gap: 8, height }}
      aria-label="fimoPAY"
    >
      {/* Icon — ảnh thật hoặc SVG fallback, chỉ dùng làm icon */}
      {iconSrc ? (
        <img
          src={iconSrc}
          alt=""
          aria-hidden="true"
          style={{ height, width: height, objectFit: 'contain', display: 'block', flexShrink: 0,
            filter: darkMode ? 'brightness(1.12)' : 'none', transition: 'filter 0.3s' }}
          onError={() => { if (fullFailed) { setIconFailed(true) } else { setFullFailed(true) } }}
        />
      ) : (
        <svg width={height} height={height} viewBox="0 0 40 40" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
          <rect width="40" height="40" rx="10" fill="url(#fimo-g2)" />
          <circle cx="15" cy="20" r="8" stroke="white" strokeWidth="3.5" fill="none" />
          <circle cx="25" cy="20" r="8" stroke="white" strokeWidth="3.5" fill="none" strokeOpacity="0.65" />
          <defs>
            <linearGradient id="fimo-g2" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#5fbeff" /><stop offset="100%" stopColor="#1a6fff" />
            </linearGradient>
          </defs>
        </svg>
      )}

      {/* ── Chữ fimoPAY — HARDCODED, không bao giờ thay đổi dù logo thay ── */}
      {variant === 'full' && (
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 1.5, userSelect: 'none' }}>
          <span style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: Math.round(height * 0.58),
            letterSpacing: '-0.03em',
            color: inkColor,
            lineHeight: 1,
            transition: 'color 0.3s',
          }}>
            fimo
          </span>
          <span style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: Math.round(height * 0.30),
            letterSpacing: '0.06em',
            color: accentColor,
            lineHeight: 1,
            textTransform: 'uppercase' as const,
            alignSelf: 'flex-start',
            marginTop: Math.round(height * 0.04),
            transition: 'color 0.3s',
          }}>
            PAY
          </span>
        </span>
      )}
    </span>
  )
}

/* ── Named export ────────────────────────────────────────────── */
export function LogoWithFallback(props: FimoLogoProps) {
  return <FimoLogo {...props} />
}
