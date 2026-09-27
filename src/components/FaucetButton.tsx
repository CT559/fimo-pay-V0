/**
 * FaucetButton — Nút lấy test USDC cho người mới trải nghiệm
 *
 * Tự động hiện khi:
 *   1. Đã kết nối ví
 *   2. Balance USDC < ngưỡng MIN_BALANCE (mặc định $5)
 *
 * Nhấn → mở https://faucet.arc.io trong tab mới (Arc Testnet faucet chính thức)
 * Luôn có thể hiện bằng prop `alwaysShow` (dùng trong Demo/onboarding)
 */
import { useAccount, useBalance } from 'wagmi'
import { Droplets } from 'lucide-react'
import { ARC_USDC, CHAIN_ID } from '../contracts'
import type { LangCode } from '../i18n'
import { t } from '../i18n'

interface FaucetButtonProps {
  /** Compact: chỉ icon + text ngắn (dùng trong card nhỏ) */
  compact?: boolean
  /** Ngôn ngữ hiển thị */
  lang?: LangCode
  /** @deprecated dùng để backward-compat */
  alwaysShow?: boolean
  threshold?: number
}

const FAUCET_URL = 'https://faucet.circle.com/'

export default function FaucetButton({
  compact = false,
  lang = 'vi',
}: FaucetButtonProps) {
  const { address, isConnected } = useAccount()

  const { data: _balanceData } = useBalance({
    address,
    token: ARC_USDC.address,
    chainId: CHAIN_ID,
    query: { enabled: isConnected && !!address, refetchInterval: 10_000 },
  })

  const handleClick = () => {
    window.open(FAUCET_URL, '_blank', 'noopener,noreferrer')
  }

  if (compact) {
    return (
      <button
        onClick={handleClick}
        title={t(lang, 'faucet_title')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 10px',
          borderRadius: 10,
          border: '1px solid rgba(26,111,255,0.25)',
          background: 'var(--accent-soft)',
          color: 'var(--accent)',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'transform 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
      >
        <Droplets size={12} strokeWidth={2} />
        {t(lang, 'faucet_btn')}
      </button>
    )
  }

  return (
    <div style={{
      borderRadius: 16,
      border: '1px solid rgba(26,111,255,0.18)',
      background: 'var(--accent-soft)',
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      {/* Icon */}
      <div style={{
        width: 38, height: 38,
        borderRadius: 12,
        background: 'var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Droplets size={18} color="white" strokeWidth={2} />
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
          {t(lang, 'faucet_title')}
        </p>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
          {t(lang, 'faucet_desc')}
        </p>
      </div>

      {/* CTA */}
      <button
        onClick={handleClick}
        style={{
          padding: '8px 14px',
          borderRadius: 10,
          background: 'var(--accent)',
          color: 'white',
          fontSize: 12,
          fontWeight: 700,
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
          boxShadow: '0 2px 8px rgba(26,111,255,0.28)',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'scale(1.05)'
          e.currentTarget.style.boxShadow = '0 4px 14px rgba(26,111,255,0.40)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(26,111,255,0.28)'
        }}
      >
        {t(lang, 'faucet_cta')}
      </button>
    </div>
  )
}
