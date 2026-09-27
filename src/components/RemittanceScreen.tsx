import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { toast } from 'sonner'
import { ChevronDown, CheckCircle, Loader2, AlertTriangle, ExternalLink } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { parseAmount, Amount } from '@/onchain-money'
import type { LangCode } from '../i18n'
import { t } from '../i18n'

const CHAIN_ID = 5042002

interface Country {
  code: string
  name: string
  /** Token người nhận sẽ nhận được sau khi agent Waterfall Settlement hoàn tất convert */
  receiverToken: string
  flag: string
}

// Người GỬI luôn gửi USDC (token trên Arc Testnet).
// Agent tự động convert sang receiverToken ở hậu trường qua Waterfall Settlement.
// Ví dụ: gửi đến Nhật → người nhận nhận JPYC, không phải USDC.
const COUNTRIES: Country[] = [
  { code: 'VN', name: 'Việt Nam',    receiverToken: 'USDC', flag: '🇻🇳' },
  { code: 'PH', name: 'Philippines', receiverToken: 'PHPC', flag: '🇵🇭' },
  { code: 'KR', name: '한국',         receiverToken: 'KRW1', flag: '🇰🇷' },
  { code: 'JP', name: '日本',         receiverToken: 'JPYC', flag: '🇯🇵' },
  { code: 'TH', name: 'ไทย',         receiverToken: 'USDC', flag: '🇹🇭' },
  { code: 'TW', name: '台灣',         receiverToken: 'USDC', flag: '🇹🇼' },
]

interface RemittanceScreenProps {
  lang: LangCode
}

export default function RemittanceScreen({ lang }: RemittanceScreenProps) {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()

  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [dest, setDest] = useState(COUNTRIES[0])
  const [showCountry, setShowCountry] = useState(false)
  const [step, setStep] = useState<'input' | 'confirm' | 'sending' | 'done'>('input')

  const usdcFact = getUsdc(CHAIN_ID)
  const usdcAddr = usdcFact?.address as `0x${string}` | undefined

  const { data: balRaw } = useReadContract({
    address: usdcAddr,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address && !!usdcAddr },
  })
  const usdcDecimals = usdcFact?.decimals ?? 6
  const balFormatted = balRaw !== undefined
    ? Amount.fromRaw(balRaw, usdcDecimals).toFixed(2)
    : '—'

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const txUrl = hash ? buildTxExplorerUrl(CHAIN_ID, hash) : undefined

  const validAddr = recipient.length > 0 && isAddress(recipient)
  const amountNum = parseFloat(amount)
  const validAmt  = !isNaN(amountNum) && amountNum > 0
  const wrongChain = isConnected && chainId !== CHAIN_ID

  if (isSuccess && step === 'sending') setStep('done')

  const handleSend = () => {
    if (!isConnected || !usdcAddr) { toast.error(t(lang, 'error_connect_wallet')); return }
    if (wrongChain) { switchChain({ chainId: CHAIN_ID }); return }
    setStep('sending')
    const parsed = parseAmount(CHAIN_ID, amount)
    writeContract({
      address: usdcAddr,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient as `0x${string}`, parsed.raw],
      chainId: CHAIN_ID,
    })
  }

  const shortAddr = recipient ? `${recipient.slice(0, 6)}···${recipient.slice(-4)}` : ''

  // ── Done ──
  if (step === 'done') {
    return (
      <div className="glass-card rounded-3xl p-6 flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: 'var(--success-bg)' }}>
          <CheckCircle size={36} style={{ color: 'var(--success)' }} />
        </div>
        <div className="text-center">
          <p className="display font-bold text-xl" style={{ color: 'var(--ink)' }}>
            {t(lang, 'send_success')}
          </p>
          <p className="text-sm mt-1.5" style={{ color: 'var(--muted)' }}>
            ${amount} USDC → {shortAddr}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
            {dest.flag} {dest.name} · → <strong>{dest.receiverToken}</strong>
          </p>
        </div>
        {txUrl && (
          <a href={txUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: 'var(--accent)' }}>
            {t(lang, 'send_view_tx')} <ExternalLink size={12} />
          </a>
        )}
        <button
          onClick={() => { setStep('input'); setAmount(''); setRecipient('') }}
          className="mt-1 w-full py-3 rounded-2xl text-sm font-semibold transition-colors"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}>
          {t(lang, 'send_btn_again')}
        </button>
      </div>
    )
  }

  // ── Confirm sheet ──
  if (step === 'confirm' || step === 'sending') {
    return (
      <div className="flex flex-col gap-4">
        <div className="glass-card rounded-3xl overflow-hidden">
          <div className="h-[3px]" style={{ background: 'var(--spectral)' }} />
          <div className="p-5 flex flex-col gap-3">
            <p className="text-xs font-bold uppercase tracking-widest"
              style={{ color: 'var(--subtle)', letterSpacing: '0.08em' }}>
              {t(lang, 'send_confirm_title')}
            </p>
            {[
              { label: t(lang, 'send_confirm_amount'),    value: `$${amount} USDC` },
              { label: t(lang, 'send_confirm_dest'),      value: `${dest.flag} ${dest.name} → ${dest.receiverToken}` },
              { label: t(lang, 'send_confirm_recipient'), value: <span className="mono text-xs">{shortAddr}</span> },
            ].map(row => (
              <div key={String(row.label)} className="flex justify-between items-center py-1.5"
                style={{ borderBottom: '1px solid var(--border)' }}>
                <span className="text-sm" style={{ color: 'var(--muted)' }}>{row.label}</span>
                <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>{row.value}</span>
              </div>
            ))}
            <div className="flex items-start gap-2.5 rounded-xl p-3 mt-1"
              style={{ background: 'var(--warning-bg)' }}>
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--warning-text)' }} />
              <p className="text-xs leading-relaxed" style={{ color: 'var(--warning-text)' }}>
                {t(lang, 'send_warning_irreversible')}
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => { handleSend() }}
          disabled={isPending || isConfirming}
          className="w-full py-4 rounded-2xl text-sm font-bold
            hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 transition-all
            flex items-center justify-center gap-2"
          style={{ background: 'var(--accent)', color: 'white',
            boxShadow: '0 4px 20px rgba(26,111,255,0.28)' }}>
          {(isPending || isConfirming) && <Loader2 size={16} className="animate-spin" />}
          {isPending ? t(lang, 'pay_btn_pending')
            : isConfirming ? t(lang, 'pay_btn_confirming')
            : t(lang, 'send_btn_send')}
        </button>
        <button onClick={() => setStep('input')}
          className="text-center text-sm font-medium"
          style={{ color: 'var(--muted)' }}>
          ← {t(lang, 'send_btn_back')}
        </button>
      </div>
    )
  }

  // ── Input form ──
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>
          {t(lang, 'send_title')}
        </h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>Arc Testnet · USDC</p>
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--success)' }} />
          <span className="text-[10px] font-semibold" style={{ color: 'var(--success)' }}>
            {t(lang, 'pay_fee_stable_full')}
          </span>
        </div>
      </div>

      {/* ── Bảng luồng tiền ── */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-2.5 flex items-center gap-2"
          style={{ background: 'var(--accent-soft)', borderBottom: '1px solid var(--border)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          <span className="text-[11px] font-bold uppercase" style={{ color: 'var(--accent)', letterSpacing: '0.08em' }}>
            {t(lang, 'send_flow_header')}
          </span>
        </div>
        {/* Rows */}
        {([
          { from: t(lang, 'send_flow_same'), fromToken: 'USDC', toToken: 'USDC' },
          { from: t(lang, 'send_flow_jp'),   fromToken: 'USDC', toToken: 'JPYC' },
          { from: t(lang, 'send_flow_kr'),   fromToken: 'USDC', toToken: 'KRW1' },
          { from: t(lang, 'send_flow_ph'),   fromToken: 'USDC', toToken: 'PHPC' },
        ] as { from: string; fromToken: string; toToken: string }[]).map((row, i) => (
          <div key={i} className="flex items-center px-4 py-2.5 gap-2 text-xs"
            style={{ borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
            <span style={{ color: 'var(--muted)', flex: 1 }}>{row.from}</span>
            <span className="mono font-bold px-2 py-0.5 rounded"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 10 }}>
              {row.fromToken}
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--subtle)"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            <span className="mono font-bold px-2 py-0.5 rounded"
              style={{
                background: row.toToken === 'USDC' ? 'var(--accent-soft)' : 'rgba(15,122,69,0.10)',
                color: row.toToken === 'USDC' ? 'var(--accent)' : 'var(--success)',
                fontSize: 10
              }}>
              {row.toToken}
            </span>
          </div>
        ))}
        {/* Bank note */}
        <div className="px-4 py-3 flex items-start gap-2.5"
          style={{ background: 'rgba(15,122,69,0.06)', borderTop: '1px solid var(--border)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--success)"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--success)' }}>
            <strong>{t(lang, 'send_bank_title')}:</strong> {t(lang, 'send_bank_note')}
          </p>
        </div>
      </div>

      {/* ── Country picker ── */}
      <div className="relative">
        <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>
          {t(lang, 'send_dest')}
        </p>
        <button
          onClick={() => setShowCountry(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-medium
            transition-colors"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}>
          <span>{dest.flag} {dest.name} — <span className="mono text-xs font-bold" style={{ color: 'var(--accent)' }}>{dest.receiverToken}</span></span>
          <ChevronDown size={15} style={{ color: 'var(--subtle)' }} />
        </button>
        {showCountry && (
          <div className="absolute z-20 mt-1.5 w-full rounded-2xl overflow-hidden"
            style={{
              background: 'var(--surface-strong)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid var(--border-strong)',
              boxShadow: '0 8px 32px rgba(15,35,64,0.12)',
            }}>
            {COUNTRIES.map(c => (
              <button key={c.code}
                onClick={() => { setDest(c); setShowCountry(false) }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors"
                style={{
                  color: c.code === dest.code ? 'var(--accent)' : 'var(--ink)',
                  background: c.code === dest.code ? 'var(--accent-soft)' : 'transparent',
                  fontWeight: c.code === dest.code ? 600 : 400,
                  borderBottom: '1px solid var(--border)',
                }}>
                <span style={{ fontSize: 18 }}>{c.flag}</span>
                <span className="flex-1">{c.name}</span>
                <span className="mono text-xs font-bold" style={{ color: 'var(--subtle)' }}>{c.receiverToken}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Waterfall note ── */}
      {dest.receiverToken !== 'USDC' && (
        <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
          style={{ background: 'var(--accent-soft)', border: '1px solid rgba(26,111,255,0.18)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
          </svg>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--accent)' }}>
            {t(lang, 'send_waterfall_note')
              .replace('{flag}', dest.flag)
              .replace('{name}', dest.name)
              .replace('{token}', dest.receiverToken)}
          </p>
        </div>
      )}

      {/* ── Amount input ── */}
      <div>
        <div className="glass-inner rounded-2xl p-4">
          {/* USDC badge — góc trên phải */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--subtle)' }}>
              {t(lang, 'send_amount')}
            </span>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
              style={{ background: 'var(--accent-soft)', border: '1px solid rgba(26,111,255,0.18)' }}>
              <TokenUSDC size={14} variant="branded" />
              <span className="mono text-[11px] font-bold" style={{ color: 'var(--accent)' }}>USDC</span>
            </div>
          </div>
          <input
            inputMode="decimal"
            type="text"
            value={amount}
            onChange={e => {
              const v = e.target.value.replace(/[^0-9.]/g, '')
              if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
            }}
            placeholder="0.00"
            className="w-full bg-transparent display text-4xl font-bold tabular-nums outline-none"
            style={{ color: amount ? 'var(--ink)' : 'var(--border-strong)', caretColor: 'var(--accent)' }}
          />
          <div className="flex items-center justify-between mt-2.5">
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>
              {t(lang, 'send_balance')}: <span className="tabular-nums font-semibold" style={{ color: 'var(--ink-2)' }}>{balFormatted}</span>
            </span>
            {balRaw !== undefined && (
              <button onClick={() => setAmount(balFormatted)}
                className="text-xs font-bold"
                style={{ color: 'var(--accent)' }}>
                Max
              </button>
            )}
          </div>
        </div>
        {/* Quick chips */}
        <div className="flex gap-2 mt-2">
          {['50', '100', '200', '500'].map(v => (
            <button key={v} onClick={() => setAmount(v)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
              style={{
                background: amount === v ? 'var(--accent-soft)' : 'var(--surface)',
                color: amount === v ? 'var(--accent)' : 'var(--muted)',
                border: '1px solid var(--border)',
              }}>
              ${v}
            </button>
          ))}
        </div>
      </div>

      {/* ── Recipient address ── */}
      <div>
        <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>
          {t(lang, 'send_recipient')}
        </p>
        <input
          type="text"
          value={recipient}
          onChange={e => setRecipient(e.target.value)}
          placeholder={t(lang, 'send_placeholder_addr')}
          spellCheck={false}
          className="w-full mono text-sm px-4 py-3 rounded-2xl outline-none transition-colors"
          style={{
            background: 'var(--surface)',
            border: recipient && !validAddr
              ? '1.5px solid var(--danger)'
              : validAddr ? '1.5px solid var(--success)' : '1px solid var(--border)',
            color: 'var(--ink)',
          }}
        />
        {recipient && !validAddr && (
          <p className="text-xs mt-1.5" style={{ color: 'var(--danger)' }}>
            {t(lang, 'error_invalid_address')}
          </p>
        )}
      </div>

      {/* ── Next CTA ── */}
      <button
        onClick={() => {
          if (!validAddr) { toast.error(t(lang, 'error_invalid_address')); return }
          if (!validAmt) { toast.error(t(lang, 'error_invalid_amount')); return }
          if (!isConnected) { toast.error(t(lang, 'error_connect_wallet')); return }
          setStep('confirm')
        }}
        disabled={!validAddr || !validAmt || !isConnected}
        className="w-full py-4 rounded-2xl text-sm font-bold transition-all
          hover:scale-[1.01] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: 'var(--accent)',
          color: 'white',
          boxShadow: '0 4px 20px rgba(26,111,255,0.28)',
        }}>
        {t(lang, 'send_btn_next')} →
      </button>
    </div>
  )
}
