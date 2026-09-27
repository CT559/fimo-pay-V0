/**
 * EVChargerLive — Màn hình live session trạm sạc EV
 *
 * Flow UI:
 *  idle → [Bắt đầu sạc] → connecting → charging (live kWh) → [Dừng sạc]
 *       → confirming → done (hiện biên lai + txHash)
 *
 * Agent backend: POST /api/session/start + /api/session/stop
 * Live data:     SSE /api/session/:id/stream
 */

import { useState, useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import { Zap, Square, CheckCircle, Loader2, ChevronRight, ExternalLink } from 'lucide-react'
import type { LangCode } from '../i18n'
import { t } from '../i18n'
import { buildTxUrl } from '../contracts'

// ── Types ─────────────────────────────────────────────────────────────────────
type Phase = 'idle' | 'connecting' | 'charging' | 'confirming' | 'done' | 'error'

type LiveData = {
  kWh:          number
  totalUSD:     number
  timestamp?:   number
  powerKW?:     number
  pricePerKWh?: number
}

type Receipt = {
  finalKWh:  number
  finalUSD:  number
  settleTx:  string
}

// ── Demo state — module level để tránh React Compiler immutability rule ───────
const _demo = { intervalId: 0, kWh: 0 }

// ── Component ─────────────────────────────────────────────────────────────────
export default function EVChargerLive({ lang }: { lang: LangCode }) {
  const { address, isConnected } = useAccount()
  const [phase,     setPhase]     = useState<Phase>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [liveData,  setLiveData]  = useState<LiveData | null>(null)
  const [receipt,   setReceipt]   = useState<Receipt | null>(null)
  const [errorMsg,  setErrorMsg]  = useState<string>('')
  const [elapsed,   setElapsed]   = useState(0)  // giây đang sạc
  const eventSourceRef = useRef<EventSource | null>(null)
  const startTimeRef   = useRef<number>(0)
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null)

  // Timer đếm giây — đọc từ startTimeRef tránh setState-in-effect lint
  useEffect(() => {
    if (phase !== 'charging') {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      return
    }
    startTimeRef.current = Date.now()
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [phase])

  // Cleanup SSE + demo interval khi unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close()
      if (_demo.intervalId) clearInterval(_demo.intervalId)
    }
  }, [])

  // ── Demo simulation (browser-only, không cần backend) ──────────────────────
  const startDemoMode = (sid: string) => {
    _demo.kWh = 0
    setLiveData({ kWh: 0, powerKW: 7.4, totalUSD: 0, pricePerKWh: 0.26 })
    _demo.intervalId = window.setInterval(() => {
      _demo.kWh = Math.round((_demo.kWh + 7.4 / 3600) * 10000) / 10000
      const totalUSD = Math.round(_demo.kWh * 0.26 * 100) / 100
      setLiveData({ kWh: _demo.kWh, powerKW: 7.4, totalUSD, pricePerKWh: 0.26 })
    }, 1000)
    setSessionId(sid)
    setPhase('charging')
    toast.success(t(lang, 'ev_toast_start'))
  }

  const stopDemoMode = () => {
    if (_demo.intervalId) { clearInterval(_demo.intervalId); _demo.intervalId = 0 }
    const finalKWh = Math.round(_demo.kWh * 10000) / 10000
    const finalUSD = Math.round(finalKWh * 0.26 * 100) / 100
    // Sinh txHash giả cho demo
    const fakeTx = '0xdemo' + Math.random().toString(16).slice(2, 14).padEnd(64, '0')
    setReceipt({ finalKWh, finalUSD, settleTx: fakeTx })
    setPhase('done')
    toast.success(t(lang, 'ev_toast_done'))
  }

  // ── Bắt đầu phiên sạc ──────────────────────────────────────────────────────
  const handleStart = async () => {
    if (!isConnected || !address) {
      toast.error(t(lang, 'error_connect_wallet')); return
    }
    setPhase('connecting')
    setLiveData(null)
    setReceipt(null)
    setErrorMsg('')

    // Thử gọi backend thật trước; nếu không có thì dùng Demo Mode
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000) // 3s timeout
      const res = await fetch('/api/session/start', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ user: address }),
        signal:  controller.signal,
      })
      clearTimeout(timeout)

      const text = await res.text()
      if (!text || !text.startsWith('{')) throw new Error('backend_unavailable')
      const data = JSON.parse(text) as { ok: boolean; sessionId: string; txHash: string; error?: string }
      if (!data.ok) throw new Error(data.error || 'Không mở được phiên')

      setSessionId(data.sessionId)
      setPhase('charging')
      toast.success('Phiên sạc đã bắt đầu ✓')

      const es = new EventSource(`/api/session/${data.sessionId}/stream`)
      eventSourceRef.current = es
      es.onmessage = (e: MessageEvent<string>) => {
        try {
          const msg = JSON.parse(e.data) as { type: string; data?: LiveData }
          if (msg.type === 'usage_update' && msg.data) setLiveData(msg.data)
        } catch { /* ignore */ }
      }

    } catch {
      // Backend không có hoặc timeout → Demo Mode tự động
      const demoSid = 'demo-' + Date.now().toString(16)
      startDemoMode(demoSid)
    }
  }

  // ── Dừng và thanh toán ─────────────────────────────────────────────────────
  const handleStop = async () => {
    if (!sessionId) return
    setPhase('confirming')
    eventSourceRef.current?.close()

    // Demo Mode
    if (sessionId.startsWith('demo-')) {
      await new Promise(r => setTimeout(r, 1200)) // giả lập delay settle
      stopDemoMode(); return
    }

    // Backend thật
    try {
      const res = await fetch('/api/session/stop', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sessionId }),
      })
      const data = await res.json() as {
        ok: boolean; finalKWh: number; finalUSD: number; settleTx: string; error?: string
      }
      if (!data.ok) throw new Error(data.error || 'Settle thất bại')
      setReceipt({ finalKWh: data.finalKWh, finalUSD: data.finalUSD, settleTx: data.settleTx })
      setPhase('done')
      toast.success('Thanh toán thành công ✓')
    } catch (err) {
      setPhase('error')
      setErrorMsg(String(err))
      toast.error('Thanh toán thất bại')
    }
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setPhase('idle'); setSessionId(null); setLiveData(null)
    setReceipt(null); setErrorMsg(''); setElapsed(0)
  }

  // ── Format helpers ─────────────────────────────────────────────────────────
  const fmtTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const kWh     = liveData?.kWh     ?? 0
  const totalUSD = liveData?.totalUSD ?? 0

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '20px 16px', maxWidth: 480, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
          {t(lang, 'ev_title')}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>
          {t(lang, 'ev_subtitle')}
        </p>
      </div>

      {/* === IDLE === */}
      {phase === 'idle' && (
        <div>
          {/* Device info card */}
          <div style={{
            background: 'var(--color-surface)',
            borderRadius: 16,
            padding: '20px',
            marginBottom: 20,
            border: '1px solid var(--color-border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'linear-gradient(135deg, #1a6fff22, #1a6fff44)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Zap size={24} color="#1a6fff" />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-text-primary)' }}>
                  {t(lang, 'ev_charger_name')}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {t(lang, 'ev_charger_desc')}
                </div>
              </div>
            </div>

            {/* Specs */}
            {[
              [t(lang, 'ev_charge_type_label'), t(lang, 'ev_charge_type_val')],
              [t(lang, 'ev_price_label'),        '$0.20 / kWh'],
              [t(lang, 'ev_fee_label'),           t(lang, 'ev_fee_fixed')],
            ].map(([label, value]) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between',
                paddingBottom: 8, marginBottom: 8,
                borderBottom: '1px solid var(--color-border)',
              }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{value}</span>
              </div>
            ))}
          </div>

          {!isConnected && (
            <div style={{
              background: 'var(--accent-soft)', borderRadius: 10, padding: '12px 16px',
              fontSize: 13, color: 'var(--accent)', marginBottom: 16,
              border: '1px solid rgba(26,111,255,0.18)',
            }}>
              {t(lang, 'error_connect_wallet')}
            </div>
          )}

          <button
            onClick={() => void handleStart()}
            disabled={!isConnected}
            style={{
              width: '100%', padding: '16px',
              background: isConnected ? '#1a6fff' : '#e0e8ff',
              color: isConnected ? '#fff' : '#a0b4f0',
              border: 'none', borderRadius: 14,
              fontSize: 16, fontWeight: 600, cursor: isConnected ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Zap size={18} />
            {t(lang, 'ev_start')}
          </button>
        </div>
      )}

      {/* === CONNECTING === */}
      {phase === 'connecting' && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Loader2 size={48} color="#1a6fff" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {t(lang, 'ev_connecting')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 8 }}>
            Ghi nhận lên Arc Testnet
          </div>
        </div>
      )}

      {/* === CHARGING (live) === */}
      {phase === 'charging' && (
        <div>
          {/* Live meter */}
          <div style={{
            background: 'linear-gradient(135deg, #0f2340, #1a3a6b)',
            borderRadius: 20, padding: '28px 24px',
            marginBottom: 20, color: '#fff',
            boxShadow: '0 8px 32px #1a6fff33',
          }}>
            {/* Status dot */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: '#22c55e', boxShadow: '0 0 8px #22c55e',
                animation: 'pulse 2s ease-in-out infinite',
              }} />
              <span style={{ fontSize: 12, color: '#a0c4ff', fontWeight: 500 }}>{t(lang, 'ev_charging').toUpperCase()}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: '#a0c4ff', fontFamily: 'monospace' }}>
                {fmtTime(elapsed)}
              </span>
            </div>

            {/* kWh số lớn */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1, fontFamily: "'Space Grotesk', monospace" }}>
                {kWh.toFixed(2)}
              </div>
              <div style={{ fontSize: 16, color: '#a0c4ff', marginTop: 4 }}>kWh</div>
            </div>

            {/* USD equivalent */}
            <div style={{
              background: '#ffffff18', borderRadius: 10, padding: '12px 16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 13, color: '#a0c4ff' }}>{t(lang, 'ev_amount')}</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>
                ${totalUSD.toFixed(4)}
              </span>
            </div>
          </div>

          {/* Phí cố định note */}
          <div style={{
            background: '#e8f4ff', borderRadius: 10, padding: '10px 14px',
            fontSize: 12, color: '#1a6fff', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Zap size={12} />
            Phí giao dịch ~$0.001 · Cố định, không dao động · Arc EWMA
          </div>

          {/* Stop button */}
          <button
            onClick={() => void handleStop()}
            style={{
              width: '100%', padding: '16px',
              background: '#dc2626',
              color: '#fff',
              border: 'none', borderRadius: 14,
              fontSize: 16, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Square size={18} />
            {t(lang, 'ev_stop')}
          </button>
        </div>
      )}

      {/* === CONFIRMING === */}
      {phase === 'confirming' && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Loader2 size={48} color="#1a6fff" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {t(lang, 'ev_confirming')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 8 }}>
            {kWh.toFixed(3)} kWh — ${totalUSD.toFixed(4)}
          </div>
        </div>
      )}

      {/* === DONE (biên lai) === */}
      {phase === 'done' && receipt && (
        <div>
          {/* Success header */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <CheckCircle size={56} color="#22c55e" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {t(lang, 'ev_success')}
            </div>
            <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginTop: 4 }}>
              {t(lang, 'ev_demo_mode')}
            </div>
          </div>

          {/* Biên lai */}
          <div style={{
            background: 'var(--color-surface)',
            borderRadius: 16, padding: 20,
            border: '1px solid var(--color-border)', marginBottom: 20,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 12, letterSpacing: '0.08em' }}>
              {t(lang, 'ev_receipt').toUpperCase()}
            </div>
            {[
              [t(lang, 'ev_kwh'),    `${receipt.finalKWh.toFixed(3)} kWh`],
              [t(lang, 'ev_amount'), `$${receipt.finalUSD.toFixed(4)} USDC`],
              [t(lang, 'ev_fee'),    '~$0.001'],
            ].map(([label, value]) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '8px 0', borderBottom: '1px solid var(--color-border)',
              }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{value}</span>
              </div>
            ))}

            {/* TX link */}
            <a
              href={buildTxUrl(receipt.settleTx)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, marginTop: 14,
                fontSize: 12, color: '#1a6fff', textDecoration: 'none',
              }}
            >
              <ExternalLink size={12} />
              {t(lang, 'ev_view_receipt')}
            </a>
          </div>

          {/* Sạc tiếp button */}
          <button
            onClick={handleReset}
            style={{
              width: '100%', padding: '14px',
              background: '#f0f5ff', color: '#1a6fff',
              border: '1.5px solid #1a6fff', borderRadius: 14,
              fontSize: 15, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <ChevronRight size={16} />
            {t(lang, 'ev_new_session')}
          </button>
        </div>
      )}

      {/* === ERROR === */}
      {phase === 'error' && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#dc2626', marginBottom: 8 }}>
            {t(lang, 'ev_error')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 20, wordBreak: 'break-all' }}>
            {errorMsg}
          </div>
          <button
            onClick={handleReset}
            style={{
              padding: '12px 24px', background: '#1a6fff', color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 14, cursor: 'pointer',
            }}
          >
            Thử lại
          </button>
        </div>
      )}
    </div>
  )
}
