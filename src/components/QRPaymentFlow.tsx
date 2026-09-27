/**
 * QRPaymentFlow v2 — Thanh toán QR cho siêu thị / vending / mini mart
 *
 * UX: người dùng chỉ thấy 3 bước
 *  1. Mở camera → quét QR thiết bị
 *  2. AI agent tính tỷ giá tốt nhất (Demo: giả lập)
 *  3. Bấm 1 nút xác nhận → xong
 *
 * Camera: hỗ trợ mọi browser qua jsQR + canvas fallback
 * Fallback: nếu không có camera → nhập mã thủ công
 */

import { useState, useCallback, useRef } from 'react'
import { useQRScanner } from './useQRScanner.tsx'
import { useAccount, useWriteContract } from 'wagmi'
import { erc20Abi, parseUnits } from 'viem'
import { toast } from 'sonner'
import {
  Camera, CheckCircle, Loader2, X, ShoppingCart, Zap,
  ChevronRight, KeyboardIcon,
} from 'lucide-react'
import type { LangCode, I18nKey } from '../i18n'
import { t } from '../i18n'
import { ARC_USDC, CHAIN_ID } from '../contracts'
import { buildTxUrl } from '../contracts'

// ── Types ────────────────────────────────────────────────────────────────────
type Phase = 'idle' | 'scanning' | 'quoting' | 'confirmed' | 'paying' | 'done' | 'error'

interface QRMerchant {
  address: `0x${string}`
  name:     string
  currency: string
  country:  I18nKey
  flag:     string
}

interface CartItem { label: string; amount: number }

interface Quote {
  usdAmount:   number
  tokenSymbol: string
  tokenAmount: number
  rate:        number
  provider:    string
}

// ── Demo data ────────────────────────────────────────────────────────────────
const DEMO_MERCHANTS: QRMerchant[] = [
  { address: '0xaaaa000000000000000000000000000000000001', name: 'FamilyMart Shibuya', currency: 'JPY', country: 'country_jp', flag: '🇯🇵' },
  { address: '0xaaaa000000000000000000000000000000000002', name: 'GS25 Gangnam',       currency: 'KRW', country: 'country_kr', flag: '🇰🇷' },
  { address: '0xaaaa000000000000000000000000000000000003', name: '7-Eleven Manila',    currency: 'PHP', country: 'country_ph', flag: '🇵🇭' },
  { address: '0xaaaa000000000000000000000000000000000004', name: 'Big C TPHCM',        currency: 'VND', country: 'country_vn', flag: '🇻🇳' },
]

const DEMO_CARTS: CartItem[][] = [
  [{ label: 'Onigiri × 2', amount: 2.40 }, { label: 'Matcha latte', amount: 3.80 }],
  [{ label: 'Kimbap × 1', amount: 4.50 }, { label: 'Banana milk', amount: 1.20 }],
  [{ label: 'Pandesal × 3', amount: 1.80 }, { label: 'Sky Flakes', amount: 2.10 }],
  [{ label: 'Bánh mì × 1', amount: 1.50 }, { label: 'Sữa tươi',   amount: 2.00 }],
]

// ── Agent: chọn tỷ giá tốt nhất (Demo giả lập) ───────────────────────────────
async function agentGetBestQuote(merchant: QRMerchant, usdAmount: number): Promise<Quote> {
  await new Promise(r => setTimeout(r, 900))
  const rates: Record<string, { rate: number; provider: string }> = {
    JPY: { rate: 151.2, provider: 'StableFX/JPYC'  },
    KRW: { rate: 1345,  provider: 'StableFX/KRW1'  },
    PHP: { rate: 57.3,  provider: 'StableFX/PHPC'  },
    VND: { rate: 25200, provider: 'USDC direct'    },
  }
  const r     = rates[merchant.currency] ?? { rate: 1, provider: 'USDC direct' }
  return {
    usdAmount,
    tokenSymbol: merchant.currency === 'VND' ? 'USDC' : merchant.currency === 'JPY' ? 'JPYC' : merchant.currency === 'KRW' ? 'KRW1' : 'PHPC',
    tokenAmount: Math.round(usdAmount * r.rate),
    rate:        r.rate,
    provider:    r.provider,
  }
}

// ── Parse QR raw string ────────────────────────────────────────────────────
function parseMerchantFromQR(raw: string): { merchant: QRMerchant; cart: CartItem[] } {
  const idx = raw.startsWith('fimopay://demo/merchant/')
    ? parseInt(raw.split('/').pop() ?? '0') % DEMO_MERCHANTS.length
    : Math.floor(Math.random() * DEMO_MERCHANTS.length)
  return { merchant: DEMO_MERCHANTS[idx], cart: DEMO_CARTS[idx] }
}

// ── Component ────────────────────────────────────────────────────────────────
interface QRPaymentFlowProps {
  lang:   LangCode
  mode?:  'checkout' | 'vending'
}

export default function QRPaymentFlow({ lang, mode = 'checkout' }: QRPaymentFlowProps) {
  'use no memo'
  const { address, isConnected } = useAccount()
  const { writeContract }        = useWriteContract()

  const [phase,    setPhase]    = useState<Phase>('idle')
  const [merchant, setMerchant] = useState<QRMerchant | null>(null)
  const [cart,     setCart]     = useState<CartItem[]>([])
  const [quote,    setQuote]    = useState<Quote | null>(null)
  const [txHash,   setTxHash]   = useState<string>('')
  const [errMsg,   setErrMsg]   = useState<string>('')
  const [camErr,   setCamErr]   = useState<string>('')
  const [noCam,    setNoCam]    = useState(false)
  const [manInput, setManInput] = useState('')

  // ── QR Scanner hook — dùng ref để tránh circular dependency ──────────────────
  const scannerRef = useRef<ReturnType<typeof useQRScanner> | null>(null)
  const qrScanner = useQRScanner((raw: string) => {
    scannerRef.current?.closeCamera()
    const { merchant: m, cart: c } = parseMerchantFromQR(raw)
    const tot = Math.round(c.reduce((s, i) => s + i.amount, 0) * 100) / 100
    setMerchant(m); setCart(c); setPhase('quoting')
    void agentGetBestQuote(m, tot).then(q => { setQuote(q); setPhase('confirmed') })
  })

  // Gán ref sau khi qrScanner được tạo — không dùng trong render
  if (scannerRef.current !== qrScanner) scannerRef.current = qrScanner

  // ── Mở camera ──────────────────────────────────────────────────────────────
  const handleOpenCamera = useCallback(() => {
    setCamErr(''); setNoCam(false); setPhase('scanning')
    void qrScanner.openCamera().then(result => {
      if (!result.ok) {
        setCamErr(result.error)
        setNoCam(result.noCam ?? false)
        setPhase('idle')
      }
    })
  }, [qrScanner])

  // ── Nhập thủ công (fallback khi không có camera) ────────────────────────────
  const handleManualSubmit = useCallback(() => {
    const raw = manInput.trim()
    if (!raw) return
    setManInput('')
    const { merchant: m, cart: c } = parseMerchantFromQR(raw || 'fimopay://demo/merchant/0')
    const tot = Math.round(c.reduce((s, i) => s + i.amount, 0) * 100) / 100
    setMerchant(m); setCart(c); setPhase('quoting')
    void agentGetBestQuote(m, tot).then(q => { setQuote(q); setPhase('confirmed') })
  }, [manInput])

  // ── Demo quét nhanh (không cần camera) ─────────────────────────────────────
  const handleDemoScan = useCallback(() => {
    const raw = 'fimopay://demo/merchant/' + Math.floor(Math.random() * DEMO_MERCHANTS.length)
    const { merchant: m, cart: c } = parseMerchantFromQR(raw)
    const tot = Math.round(c.reduce((s, i) => s + i.amount, 0) * 100) / 100
    setMerchant(m); setCart(c); setPhase('quoting')
    void agentGetBestQuote(m, tot).then(q => { setQuote(q); setPhase('confirmed') })
  }, [])

  // ── Thanh toán ─────────────────────────────────────────────────────────────
  const handlePay = useCallback(() => {
    if (!isConnected || !address || !merchant || !quote) {
      toast.error(t(lang, 'error_connect_wallet')); return
    }
    setPhase('paying')
    const amount6 = parseUnits(quote.usdAmount.toFixed(6), 6)
    writeContract({
      address:      ARC_USDC.address,
      abi:          erc20Abi,
      functionName: 'approve',
      args:         [merchant.address, amount6],
      chainId:      CHAIN_ID,
    }, {
      onSuccess: (hash) => {
        setTxHash(hash)
        toast.success(t(lang, 'pay_success'))
        setPhase('done')
      },
      onError: (err) => {
        setErrMsg(err.message.slice(0, 120))
        setPhase('error')
      },
    })
  }, [isConnected, address, merchant, quote, lang, writeContract])

  const handleReset = () => {
    qrScanner.closeCamera()
    setPhase('idle'); setMerchant(null); setCart([]); setQuote(null)
    setTxHash(''); setErrMsg(''); setCamErr('')
  }

  // ── Card container ─────────────────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    borderRadius: 20, border: '1px solid var(--stroke)',
    background: 'var(--surface)', padding: 20, display: 'flex',
    flexDirection: 'column', gap: 16,
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div>
        <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>
          {mode === 'vending' ? t(lang, 'ev_title').replace('EV', 'Vending') : t(lang, 'checkout_title')}
        </h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
          {mode === 'vending' ? t(lang, 'qr_vending_sub') : t(lang, 'qr_checkout_sub')}
        </p>
      </div>

      {/* ── IDLE: invite to scan ─────────────────────────────────── */}
      {phase === 'idle' && (
        <div style={cardStyle}>

          {/* Icon */}
          <div style={{ textAlign: 'center', paddingTop: 8 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 20, margin: '0 auto 12px',
              background: 'var(--accent-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Camera size={28} style={{ color: 'var(--accent)' }} />
            </div>
            <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
              {t(lang, 'qr_idle_title')}
            </p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--muted)' }}>
              {t(lang, 'qr_idle_sub')}
            </p>
          </div>

          {/* Steps */}
          <ol style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 0, listStyle: 'none' }}>
            {([t(lang, 'qr_step1'), t(lang, 'qr_step2'), t(lang, 'qr_step3')] as string[]).map((s, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--accent-soft)', color: 'var(--accent)',
                  fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{i + 1}</span>
                <span style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>{s}</span>
              </li>
            ))}
          </ol>

          {/* Camera error */}
          {camErr && (
            <div style={{
              borderRadius: 12, padding: '10px 14px',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            }}>
              <p style={{ fontSize: 12, color: '#dc2626', lineHeight: 1.5 }}>{camErr}</p>
            </div>
          )}

          {/* Primary button: open camera */}
          {!noCam && (
            <button
              onClick={handleOpenCamera}
              disabled={!isConnected}
              className="w-full py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.98] disabled:opacity-40"
              style={{ background: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(26,111,255,0.28)' }}>
              <Camera size={18} />
              {t(lang, 'qr_open_camera')}
            </button>
          )}

          {/* Fallback: manual input */}
          {noCam && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <KeyboardIcon size={13} />
                {t(lang, 'qr_no_cam_hint')}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={manInput}
                  onChange={e => setManInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleManualSubmit() }}
                  placeholder={t(lang, 'qr_manual_placeholder')}
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: 12, fontSize: 12,
                    border: '1px solid var(--stroke)', background: 'var(--surface)',
                    color: 'var(--ink)', outline: 'none',
                  }}
                />
                <button
                  onClick={handleManualSubmit}
                  style={{
                    padding: '10px 16px', borderRadius: 12, background: 'var(--accent)',
                    color: 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}>
                  {t(lang, 'qr_manual_submit')}
                </button>
              </div>
            </div>
          )}

          {/* Demo button: test without real QR */}
          <button
            onClick={handleDemoScan}
            style={{
              background: 'transparent', border: '1px dashed var(--stroke)',
              borderRadius: 12, padding: '10px 14px', fontSize: 12,
              color: 'var(--muted)', cursor: 'pointer', textAlign: 'center',
            }}>
            {t(lang, 'qr_demo_btn')}
          </button>
        </div>
      )}

      {/* ── SCANNING: show video feed ────────────────────────────── */}
      {phase === 'scanning' && (
        <div style={cardStyle}>
          <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
            <video
              ref={qrScanner.videoRef}
              autoPlay playsInline muted
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {/* Hidden canvas for jsQR */}
            {qrScanner.canvasElement}

            {/* Scan frame overlay */}
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              {/* Corner brackets */}
              {[
                { top: '20%', left: '20%', borderTop: '3px solid #1a6fff', borderLeft: '3px solid #1a6fff' },
                { top: '20%', right: '20%', borderTop: '3px solid #1a6fff', borderRight: '3px solid #1a6fff' },
                { bottom: '20%', left: '20%', borderBottom: '3px solid #1a6fff', borderLeft: '3px solid #1a6fff' },
                { bottom: '20%', right: '20%', borderBottom: '3px solid #1a6fff', borderRight: '3px solid #1a6fff' },
              ].map((s, i) => (
                <div key={i} style={{ position: 'absolute', width: 28, height: 28, borderRadius: 4, ...s }} />
              ))}
            </div>
          </div>

          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
            {t(lang, 'qr_scanning_hint')}
          </p>

          <button
            onClick={() => { qrScanner.closeCamera(); setPhase('idle') }}
            style={{
              background: 'transparent', border: '1px solid var(--stroke)',
              borderRadius: 12, padding: '10px 14px', fontSize: 13,
              color: 'var(--muted)', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <X size={14} />
            {t(lang, 'qr_cancel')}
          </button>
        </div>
      )}

      {/* ── QUOTING: AI agent calculating ─────────────────────────── */}
      {phase === 'quoting' && (
        <div style={{ ...cardStyle, alignItems: 'center', textAlign: 'center', padding: 32 }}>
          <Loader2 size={32} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
            {t(lang, 'qr_quoting')}
          </p>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>
            {merchant?.flag} {merchant?.name}
          </p>
        </div>
      )}

      {/* ── CONFIRMED: show bill ─────────────────────────────────── */}
      {phase === 'confirmed' && merchant && quote && (
        <div style={cardStyle}>
          {/* Merchant info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>{merchant.flag}</span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{merchant.name}</p>
              <p style={{ fontSize: 11, color: 'var(--muted)' }}>{t(lang, merchant.country)}</p>
            </div>
          </div>

          {/* Cart items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cart.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShoppingCart size={13} style={{ color: 'var(--muted)' }} />
                  {item.label}
                </span>
                <span style={{ fontWeight: 600 }}>${item.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--stroke)' }} />

          {/* Quote */}
          <div style={{
            borderRadius: 14, padding: '14px 16px',
            background: 'var(--accent-soft)', border: '1px solid rgba(26,111,255,0.18)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{t(lang, 'qr_pay_label')}</p>
                <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', fontFamily: 'Space Grotesk, sans-serif' }}>
                  ${quote.usdAmount.toFixed(2)} <span style={{ fontSize: 14, fontWeight: 600 }}>USDC</span>
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{t(lang, 'qr_receives')}</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>
                  {quote.tokenAmount.toLocaleString()} {quote.tokenSymbol}
                </p>
                <p style={{ fontSize: 10, color: 'var(--muted)' }}>{t(lang, 'qr_via')} {quote.provider}</p>
              </div>
            </div>

            {/* Stable fee */}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(26,111,255,0.15)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={12} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 11, color: 'var(--accent)' }}>~$0.001 · {t(lang, 'pay_fee_stable')}</span>
            </div>
          </div>

          {/* Confirm button */}
          <button
            onClick={handlePay}
            disabled={!isConnected}
            className="w-full py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.98] disabled:opacity-40"
            style={{ background: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(26,111,255,0.28)' }}>
            <ChevronRight size={16} />
            {t(lang, 'qr_pay_btn').replace('{amount}', quote.usdAmount.toFixed(2))}
          </button>

          <button onClick={handleReset} style={{ background: 'transparent', border: 'none', fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
            {t(lang, 'qr_cancel')}
          </button>
        </div>
      )}

      {/* ── PAYING ─────────────────────────────────────────────────── */}
      {phase === 'paying' && (
        <div style={{ ...cardStyle, alignItems: 'center', textAlign: 'center', padding: 32 }}>
          <Loader2 size={32} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{t(lang, 'pay_processing')}</p>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>Arc Testnet · USDC</p>
        </div>
      )}

      {/* ── DONE ───────────────────────────────────────────────────── */}
      {phase === 'done' && (
        <div style={{ ...cardStyle, alignItems: 'center', textAlign: 'center', padding: 32 }}>
          <CheckCircle size={48} style={{ color: '#22c55e' }} />
          <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{t(lang, 'pay_success')}</p>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>Demo Mode · Arc Testnet</p>

          {txHash && (
            <a href={buildTxUrl(txHash)} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
              {t(lang, 'qr_view_receipt')} ↗
            </a>
          )}

          <button
            onClick={handleReset}
            className="w-full py-3 rounded-2xl text-sm font-bold transition-all hover:scale-[1.01]"
            style={{ background: 'transparent', border: '1px solid var(--stroke)', color: 'var(--ink)', cursor: 'pointer' }}>
            {t(lang, 'qr_new_session')}
          </button>
        </div>
      )}

      {/* ── ERROR ──────────────────────────────────────────────────── */}
      {phase === 'error' && (
        <div style={{ ...cardStyle, alignItems: 'center', textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#dc2626' }}>{t(lang, 'qr_error_title')}</p>
          <p style={{ fontSize: 12, color: 'var(--muted)', wordBreak: 'break-word' }}>{errMsg}</p>
          <button onClick={handleReset} style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 12, padding: '10px 24px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {t(lang, 'qr_retry')}
          </button>
        </div>
      )}

      {/* Stable fee badge */}
      <div style={{
        borderRadius: 12, padding: '9px 14px',
        background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
        display: 'flex', alignItems: 'center', gap: 7,
      }}>
        <Zap size={13} style={{ color: '#16a34a', flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 500 }}>
          {t(lang, 'pay_fee_stable_full')}
        </span>
      </div>

    </div>
  )
}
