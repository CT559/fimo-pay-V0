import { useState, useRef, useEffect, useCallback } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { erc20Abi, encodeAbiParameters, parseAbiParameters, keccak256, encodeFunctionData } from 'viem'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, CheckCircle, Loader2, ExternalLink, QrCode, X, Camera } from 'lucide-react'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { Amount } from '@/onchain-money'
import type { LangCode } from '../i18n'
import { t } from '../i18n'
import { SETTLEMENT_ROUTER, ARC_USDC, CHAIN_ID } from '../contracts'

// ── Realistic service icons ──────────────────────────────────────
// EV Charging Station
const IconEV = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {/* EV car body */}
    <path d="M1 12H2L4 7H14L16 12H17A2 2 0 0 1 19 14V16H17.5A1.5 1.5 0 0 1-3 0H6.5A1.5 1.5 0 0 1 5 1.5V3" />
    <path d="M3 12H17" />
    <circle cx="6" cy="17" r="1.5" /><circle cx="14" cy="17" r="1.5" />
    {/* Lightning bolt charging */}
    <path d="M20 4L18 9H21L19 14" strokeWidth="1.6" />
  </svg>
)

// Smart Parking
const IconParking = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {/* Parking sign P */}
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M9 17V7h4a3 3 0 0 1 0 6H9" />
  </svg>
)

// Vending Machine
const IconVending = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {/* Cabinet */}
    <rect x="4" y="2" width="16" height="20" rx="2" />
    {/* Display window */}
    <rect x="6" y="4" width="12" height="8" rx="1" />
    {/* Items in window */}
    <circle cx="9" cy="8" r="1.2" fill="currentColor" />
    <circle cx="12" cy="8" r="1.2" fill="currentColor" />
    <circle cx="15" cy="8" r="1.2" fill="currentColor" />
    {/* Coin slot + flap */}
    <path d="M8 16h8" /><path d="M10 18h4" />
    {/* Leg */}
    <path d="M8 22v-2M16 22v-2" />
  </svg>
)

// Self-Checkout / Supermarket
const IconCheckout = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {/* Scanner bed */}
    <rect x="2" y="11" width="20" height="8" rx="2" />
    {/* Laser scan line */}
    <path d="M6 11V7" /><path d="M18 11V7" />
    {/* Barcode lines on item above */}
    <path d="M8 4v5M10 5v4M12 4v5M14 5v4" strokeWidth="1.4" />
    {/* QR/card tap zone */}
    <path d="M16 14h.01" strokeWidth="2.5" />
  </svg>
)

const SERVICES = [
  { key: 'ev'       as const, Icon: IconEV,       labelKey: 'home_ev'       as const },
  { key: 'parking'  as const, Icon: IconParking,  labelKey: 'home_parking'  as const },
  { key: 'vending'  as const, Icon: IconVending,  labelKey: 'home_vending'  as const },
  { key: 'checkout' as const, Icon: IconCheckout, labelKey: 'home_checkout' as const },
]
type ServiceKey = typeof SERVICES[number]['key']

interface PaymentScreenProps { lang: LangCode }

// ── QR Scanner modal ─────────────────────────────────────────────
interface QRScannerProps {
  onResult: (data: string) => void
  onClose: () => void
}

function QRScanner({ onResult, onClose }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(true)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => undefined)
        }
        setError(null)
      })
      .catch(() => {
        if (!cancelled) setError('Không thể mở camera. Hãy cho phép quyền truy cập camera.')
      })
    return () => {
      cancelled = true
      stopStream()
    }
  }, [stopStream])

  // Poll for QR using BarcodeDetector (Chrome/Android) or mock fallback
  useEffect(() => {
    if (!scanning) return
    const BDClass = (window as unknown as { BarcodeDetector?: { new(opts: object): { detect(img: HTMLVideoElement): Promise<{ rawValue: string }[]> } } }).BarcodeDetector
    if (!BDClass) return
    const detector = new BDClass({ formats: ['qr_code'] })
    const interval = setInterval(() => {
      if (!videoRef.current || !scanning) return
      detector.detect(videoRef.current)
        .then((results: { rawValue: string }[]) => {
          if (results.length > 0 && results[0].rawValue) {
            setScanning(false)
            stopStream()
            onResult(results[0].rawValue)
          }
        })
        .catch(() => undefined)
    }, 500)
    return () => clearInterval(interval)
  }, [scanning, stopStream, onResult])

  return (
    <div className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'rgba(10,20,40,0.96)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <Camera size={18} style={{ color: 'rgba(255,255,255,0.7)' }} />
          <span className="text-sm font-semibold" style={{ color: 'white' }}>
            Quét mã QR thanh toán
          </span>
        </div>
        <button onClick={() => { stopStream(); onClose() }}
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.12)' }}>
          <X size={16} style={{ color: 'white' }} />
        </button>
      </div>

      {/* Viewfinder */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
        <div className="relative rounded-2xl overflow-hidden"
          style={{ width: '100%', maxWidth: 320, aspectRatio: '1' }}>
          {error ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center"
              style={{ background: 'rgba(255,255,255,0.06)' }}>
              <Camera size={40} style={{ color: 'rgba(255,255,255,0.3)' }} />
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>{error}</p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              {/* Corner marks */}
              {(['tl','tr','bl','br'] as const).map(corner => (
                <div key={corner} className="absolute w-8 h-8 pointer-events-none"
                  style={{
                    top:    corner.startsWith('t') ? 12 : undefined,
                    bottom: corner.startsWith('b') ? 12 : undefined,
                    left:   corner.endsWith('l')   ? 12 : undefined,
                    right:  corner.endsWith('r')   ? 12 : undefined,
                    borderTop:    corner.startsWith('t') ? '3px solid #1a6fff' : undefined,
                    borderBottom: corner.startsWith('b') ? '3px solid #1a6fff' : undefined,
                    borderLeft:   corner.endsWith('l')   ? '3px solid #1a6fff' : undefined,
                    borderRight:  corner.endsWith('r')   ? '3px solid #1a6fff' : undefined,
                    borderTopLeftRadius:     corner === 'tl' ? 6 : 0,
                    borderTopRightRadius:    corner === 'tr' ? 6 : 0,
                    borderBottomLeftRadius:  corner === 'bl' ? 6 : 0,
                    borderBottomRightRadius: corner === 'br' ? 6 : 0,
                  }} />
              ))}
              {/* Scan line animation */}
              <div className="absolute left-4 right-4 h-0.5 animate-scan-line"
                style={{ background: 'rgba(26,111,255,0.8)', top: '50%' }} />
            </>
          )}
        </div>

        <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {error
            ? 'Nhập địa chỉ ví thủ công bên dưới'
            : 'Đưa mã QR vào khung · Tự động nhận dạng'}
        </p>

        {/* Manual paste fallback */}
        <div className="w-full max-w-xs">
          <p className="text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Hoặc dán địa chỉ thủ công:
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="0x..."
              className="flex-1 mono text-xs px-3 py-2.5 rounded-xl outline-none"
              style={{
                background: 'rgba(255,255,255,0.10)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.18)',
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const v = (e.currentTarget.value || '').trim()
                  if (v) { stopStream(); onResult(v) }
                }
              }}
            />
            <button
              onClick={e => {
                const input = (e.currentTarget.previousElementSibling as HTMLInputElement)
                const v = input?.value?.trim()
                if (v) { stopStream(); onResult(v) }
              }}
              className="px-3 py-2 rounded-xl text-xs font-semibold"
              style={{ background: '#1a6fff', color: 'white' }}>
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Payment Screen ──────────────────────────────────────────
export default function PaymentScreen({ lang }: PaymentScreenProps) {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()

  const [selected, setSelected] = useState<ServiceKey>('ev')
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [merchantAddr, setMerchantAddr] = useState<`0x${string}`>(
    '0x1111111111111111111111111111111111111111'
  )

  const AMOUNT_USD = '2.50'
  // MockUSDC has 6 decimals — $2.50 = 2_500_000
  const AMOUNT_RAW = 2_500_000n
  const breakdown = [
    { label: t(lang, 'pay_service_fee'),    value: '$2.30' },
    { label: t(lang, 'pay_processing_fee'), value: '$0.20' },
  ]

  // Payment step: 'idle' | 'approving' | 'settling' | 'done'
  const [payStep, setPayStep] = useState<'idle' | 'approving' | 'settling' | 'done'>('idle')

  const { data: balRaw } = useReadContract({
    address: ARC_USDC.address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  })
  const balFormatted = balRaw !== undefined
    ? Amount.fromRaw(balRaw, ARC_USDC.decimals).toFixed(2)
    : '—'

  // Step 1 — approve
  const { writeContract: approveWrite, data: approveTx, isPending: approvePending } = useWriteContract()
  const { isLoading: approveConfirming } = useWaitForTransactionReceipt({ hash: approveTx })

  // Step 2 — batchSettle
  const { writeContract: settleWrite, data: settleTx, isPending: settlePending } = useWriteContract()
  const { isLoading: settleConfirming } = useWaitForTransactionReceipt({ hash: settleTx })

  const txUrl = settleTx ? buildTxExplorerUrl(CHAIN_ID, settleTx) : undefined

  const wrongChain = isConnected && chainId !== CHAIN_ID
  const isPending = approvePending || settlePending
  const isConfirming = approveConfirming || settleConfirming

  // Step 2: gọi batchSettle sau khi approve xác nhận
  const doSettle = useCallback((userAddr: `0x${string}`, merchant: `0x${string}`) => {
    const sessionId = keccak256(encodeAbiParameters(
      parseAbiParameters('address, uint256'),
      [userAddr, BigInt(Date.now())]
    ))
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300)
    void encodeFunctionData
    toast.info('Bước 2/2: Ghi nhận onchain...')
    settleWrite({
      address: SETTLEMENT_ROUTER.address,
      abi: SETTLEMENT_ROUTER.abi,
      functionName: 'batchSettle',
      args: [{ sessionId, user: userAddr, merchant, payToken: ARC_USDC.address,
               totalUSD6: AMOUNT_RAW, isRemittance: false,
               deadline }],
      chainId: CHAIN_ID,
    }, {
      onSuccess: () => setPayStep('done'),
      onError: (e) => { toast.error('Settle thất bại: ' + e.message.slice(0, 60)); setPayStep('idle') },
    })
  }, [settleWrite])

  const handlePay = () => {
    if (!isConnected) { toast.error(t(lang, 'error_connect_wallet')); return }
    if (wrongChain) { switchChain({ chainId: CHAIN_ID }); return }
    if (!address) return
    setPayStep('approving')
    toast.info('Bước 1/2: Phê duyệt USDC...')
    approveWrite({
      address: ARC_USDC.address,
      abi: erc20Abi,
      functionName: 'approve',
      args: [SETTLEMENT_ROUTER.address, AMOUNT_RAW],
      chainId: CHAIN_ID,
    }, {
      onSuccess: () => { setPayStep('settling'); doSettle(address, merchantAddr) },
      onError: (e) => { toast.error('Approve thất bại: ' + e.message.slice(0, 60)); setPayStep('idle') },
    })
  }

  const handleQRResult = (raw: string) => {
    setShowQR(false)
    // Extract 0x address from QR data (may be "ethereum:0x..." or plain address)
    const match = raw.match(/(0x[0-9a-fA-F]{40})/)
    if (match) {
      setMerchantAddr(match[1] as `0x${string}`)
      toast.success('Đã quét mã QR thành công')
    } else {
      toast.error('Mã QR không hợp lệ — không tìm thấy địa chỉ ví')
    }
  }

  const btnLabel = !isConnected
    ? t(lang, 'pay_btn_connect')
    : wrongChain
      ? t(lang, 'pay_btn_switch')
      : payStep === 'approving' && (approvePending || approveConfirming)
        ? 'Đang phê duyệt USDC... (1/2)'
      : payStep === 'settling' && (settlePending || settleConfirming)
        ? 'Đang thanh toán... (2/2)'
      : `${t(lang, 'pay_btn_confirm')} $${AMOUNT_USD} USDC`

  const shortMerchant = `${merchantAddr.slice(0, 6)}···${merchantAddr.slice(-4)}`
  const isDefaultMerchant = merchantAddr === '0x1111111111111111111111111111111111111111'

  return (
    <>
      {showQR && <QRScanner onResult={handleQRResult} onClose={() => setShowQR(false)} />}

      <div className="flex flex-col gap-4">

        {/* ── Page heading ── */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>
              {t(lang, 'pay_title')}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>Arc Testnet · USDC</p>
          {/* Stable Fee badge */}
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: 'var(--success)' }} />
            <span className="text-[10px] font-semibold" style={{ color: 'var(--success)' }}>
              {t(lang, 'pay_fee_stable_full')}
            </span>
          </div>
          </div>
          {/* QR scan button */}
          <button
            onClick={() => setShowQR(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold
              transition-all hover:scale-[1.03] active:scale-[0.97]"
            style={{
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              border: '1px solid rgba(26,111,255,0.2)',
            }}>
            <QrCode size={14} />
            {t(lang, 'pay_qr_scan')}
          </button>
        </div>

        {/* ── Merchant row ── */}
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl"
          style={{
            background: isDefaultMerchant ? 'var(--warning-bg)' : 'var(--success-bg)',
            border: `1px solid ${isDefaultMerchant ? 'rgba(204,140,0,0.2)' : 'rgba(15,122,69,0.2)'}`,
          }}>
          <span className="text-xs" style={{ color: isDefaultMerchant ? 'var(--warning-text)' : 'var(--success)' }}>
            {isDefaultMerchant ? t(lang, 'pay_demo_hint') : t(lang, 'pay_merchant_scanned')}
          </span>
          <span className="mono text-xs font-semibold" style={{ color: isDefaultMerchant ? 'var(--warning-text)' : 'var(--success)' }}>
            {shortMerchant}
          </span>
        </div>

        {/* ── Service selector ── */}
        <div className="grid grid-cols-2 gap-2">
          {SERVICES.map(({ key, Icon, labelKey }) => {
            const active = selected === key
            return (
              <button
                key={key}
                onClick={() => setSelected(key)}
                className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl text-sm font-medium
                  transition-all duration-150"
                style={{
                  background: active ? 'var(--accent)' : 'var(--surface)',
                  color: active ? 'white' : 'var(--ink-2)',
                  border: active ? 'none' : '1px solid var(--border)',
                  boxShadow: active ? '0 4px 16px rgba(26,111,255,0.24)' : 'none',
                }}>
                <Icon />
                <span className="truncate text-xs font-semibold">
                  {t(lang, labelKey)}
                </span>
              </button>
            )
          })}
        </div>

        {/* ── Amount card ── */}
        <section className="glass-card rounded-3xl p-5">
          <div className="h-[3px] -mx-5 -mt-5 mb-4 rounded-t-3xl" style={{ background: 'var(--spectral)' }} />
          <p className="text-xs font-semibold uppercase tracking-widest mb-2"
            style={{ color: 'var(--subtle)', letterSpacing: '0.08em' }}>
            {t(lang, 'pay_total')}
          </p>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="display text-5xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
              ${AMOUNT_USD}
            </span>
            <span className="text-base font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
          </div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {t(lang, 'pay_balance')}:{' '}
            <span className="tabular-nums font-semibold" style={{ color: 'var(--ink-2)' }}>
              {balFormatted} USDC
            </span>
          </p>

          <button
            onClick={() => setShowBreakdown(v => !v)}
            className="mt-3 flex items-center gap-1.5 text-xs font-semibold transition-colors"
            style={{ color: 'var(--accent)' }}>
            {t(lang, 'pay_detail')}
            {showBreakdown ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {showBreakdown && (
            <div className="mt-3 rounded-2xl p-3.5 flex flex-col gap-2"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--muted)', letterSpacing: '0.06em' }}>
                {t(lang, 'pay_breakdown').toUpperCase()}
              </p>
              {breakdown.map(row => (
                <div key={row.label} className="flex justify-between text-sm">
                  <span style={{ color: 'var(--muted)' }}>{row.label}</span>
                  <span className="font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>{row.value}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── CTA / Success ── */}
        {payStep === 'done' ? (
          <div className="flex flex-col items-center gap-3 py-5 glass-card rounded-3xl">
            <div className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: 'var(--success-bg)' }}>
              <CheckCircle size={36} style={{ color: 'var(--success)' }} />
            </div>
            <p className="font-bold text-base" style={{ color: 'var(--ink)' }}>
              {t(lang, 'pay_success')}
            </p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              batchSettle() đã ghi nhận onchain
            </p>
            {txUrl && (
              <a href={txUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-medium underline"
                style={{ color: 'var(--accent)' }}>
                {t(lang, 'pay_view_tx')} <ExternalLink size={11} />
              </a>
            )}
            <button
              onClick={() => { setPayStep('idle'); setShowBreakdown(false) }}
              className="mt-1 text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}>
              {t(lang, 'pay_new')}
            </button>
          </div>
        ) : (
          <button
            onClick={handlePay}
            disabled={isPending || isConfirming || payStep === 'approving' || payStep === 'settling'}
            className="w-full py-4 rounded-2xl text-sm font-bold transition-all
              hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center justify-center gap-2"
            style={{
              background: wrongChain ? 'var(--warning-bg)' : 'var(--accent)',
              color: wrongChain ? 'var(--warning-text)' : 'white',
              boxShadow: wrongChain ? 'none' : '0 4px 20px rgba(26,111,255,0.30)',
            }}>
            {(isPending || isConfirming) && <Loader2 size={16} className="animate-spin" />}
            {btnLabel}
          </button>
        )}
      </div>
    </>
  )
}
