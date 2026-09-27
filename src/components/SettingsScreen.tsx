import { useState, useCallback } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useBalance } from 'wagmi'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import { Shield, Clock, Info, ChevronRight, AlertTriangle, CheckCircle, Loader2, ExternalLink, Wallet, Copy, Check, ArrowDownToLine } from 'lucide-react'
import { TokenBTC, TokenETH, TokenUSDC } from '@web3icons/react'
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { Amount } from '@/onchain-money'
import type { LangCode } from '../i18n'
import { t, LANGUAGES } from '../i18n'

const CHAIN_ID = 5042002

// ── Tokens LIVE trên Arc Testnet — địa chỉ thật từ docs.arc.io ──────────────
// Nguồn: https://docs.arc.io/arc/references/contract-addresses (Sep 2026)
const TOKEN_LIST = [
  { symbol: 'USDC', decimals: 6, color: '#2775CA',
    address: '0x3600000000000000000000000000000000000000' as string },
  { symbol: 'EURC', decimals: 6, color: '#4B92F5',
    address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as string },
]

// Partner Stablecoins — announced for Arc, chưa deploy (builtonarc.app Sep 2026)
// Badge hiện "Chờ issuer" thay vì "sắp ra mắt" để đúng với thực tế
const PARTNER_TOKENS = [
  { symbol: 'JPYC', issuer: 'JPYC Inc.', flag: '🇯🇵' },
  { symbol: 'KRW1', issuer: 'BDACS',     flag: '🇰🇷' },
  { symbol: 'PHPC', issuer: 'Coins.PH',  flag: '🇵🇭' },
]

// Tokens khác sẽ thêm sau
const COMING_SOON = ['ARC', 'BTC', 'cirBTC']

const TIERS = [
  { level: 0, labelKey: 'settings_tier_none'      as const, color: 'var(--subtle)' },
  { level: 1, labelKey: 'settings_tier_universal' as const, color: 'var(--accent)' },
  { level: 2, labelKey: 'settings_tier_telco'     as const, color: '#7b6cf7' },
  { level: 3, labelKey: 'settings_tier_kyc'       as const, color: 'var(--success)' },
]

// ── Token icon by symbol ──────────────────────────────────────────
function TokenIcon({ symbol, size = 20 }: { symbol: string; size?: number }) {
  if (symbol === 'USDC')   return <TokenUSDC size={size} variant="branded" />
  if (symbol === 'ETH')    return <TokenETH  size={size} variant="branded" />
  if (symbol === 'BTC' || symbol === 'cirBTC') return <TokenBTC size={size} variant="branded" />
  // EURC — euro blue circle
  if (symbol === 'EURC') return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg,#4B92F5,#1a6fff)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.42, fontWeight: 700, color: 'white', flexShrink: 0,
    }}>€</span>
  )
  // JPYC
  if (symbol === 'JPYC') return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg,#e63946,#c1121f)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: 'white', flexShrink: 0,
    }}>¥</span>
  )
  // KRW1
  if (symbol === 'KRW1') return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg,#457b9d,#1d3557)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.34, fontWeight: 700, color: 'white', flexShrink: 0,
    }}>₩</span>
  )
  // PHPC
  if (symbol === 'PHPC') return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg,#2a9d8f,#264653)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.34, fontWeight: 700, color: 'white', flexShrink: 0,
    }}>₱</span>
  )
  // ARC — branded circle
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg,#5fbeff,#1a6fff)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: 'white', flexShrink: 0,
    }}>A</span>
  )
}

// ── Single token balance row ──────────────────────────────────────
function TokenBalanceRow({
  symbol, decimals, color, address, walletAddr,
}: {
  symbol: string; decimals: number; color: string
  address: string | null; walletAddr: `0x${string}` | undefined
}) {
  // USDC — use native Arc balance (ERC-20 view)
  const usdcFact = getUsdc(CHAIN_ID)
  const resolvedAddr = symbol === 'USDC'
    ? usdcFact?.address as `0x${string}` | undefined
    : address as `0x${string}` | undefined

  const { data: balRaw } = useReadContract({
    address: resolvedAddr,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: walletAddr ? [walletAddr] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!walletAddr && !!resolvedAddr },
  })

  const balFmt = balRaw !== undefined
    ? Amount.fromRaw(balRaw, decimals).toFixed(symbol === 'USDC' ? 2 : 4)
    : '—'

  return (
    <div className="flex items-center gap-3 py-2.5"
      style={{ borderBottom: '1px solid var(--border)' }}>
      <TokenIcon symbol={symbol} size={28} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{symbol}</p>
        {symbol === 'cirBTC' && (
          <p className="text-[10px]" style={{ color: 'var(--subtle)' }}>Circle Wrapped BTC</p>
        )}
      </div>
      <p className="mono text-sm font-semibold tabular-nums" style={{ color }}>
        {balFmt}
      </p>
    </div>
  )
}

interface SettingsScreenProps {
  onNavigate?: (tab: string) => void
  lang: LangCode
  onChangeLang?: (l: LangCode) => void
}

export default function SettingsScreen({ lang, onChangeLang, onNavigate }: SettingsScreenProps) {
  const { address, isConnected } = useAccount()
  const [currentTier] = useState(1)
  const [showLimitForm, setShowLimitForm] = useState(false)
  const [newLimit, setNewLimit] = useState('')

  // Native Arc gas balance (same pool as USDC on Arc)
  const { data: nativeBal } = useBalance({ address, chainId: CHAIN_ID, query: { enabled: !!address } })
  const nativeFormatted = nativeBal
    ? parseFloat(nativeBal.formatted).toFixed(2)
    : '—'

  const { writeContract: _wc, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const txUrl = hash ? buildTxExplorerUrl(CHAIN_ID, hash) : undefined

  const handleSetLimit = () => {
    const val = parseFloat(newLimit)
    if (isNaN(val) || val <= 0) { toast.error(t(lang, 'error_invalid_amount')); return }
    toast.info(t(lang, 'error_deploy_needed'))
  }

  const shortAddr = address ? `${address.slice(0, 8)}···${address.slice(-6)}` : ''
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(() => {
    if (!address) return
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true)
      toast.success(t(lang, 'settings_copied'))
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }, [address, lang])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>
          {t(lang, 'settings_title')}
        </h2>
      </div>

      {/* ── 1. Daily limit — FIRST so users see it immediately ── */}
      <section className="glass-card rounded-3xl overflow-hidden">
        <div className="h-[3px]" style={{ background: 'var(--spectral)' }} />
        <div className="p-5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--accent-soft)' }}>
                <Clock size={14} style={{ color: 'var(--accent)' }} />
              </div>
              <p className="text-xs font-bold uppercase tracking-widest"
                style={{ color: 'var(--subtle)', letterSpacing: '0.08em' }}>
                {t(lang, 'settings_limit_title')}
              </p>
            </div>
            <button
              onClick={() => setShowLimitForm(v => !v)}
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              {t(lang, 'settings_limit_adjust')}
              <ChevronRight size={12} className={`transition-transform duration-200 ${showLimitForm ? 'rotate-90' : ''}`} />
            </button>
          </div>

          {/* Limit display */}
          <div className="flex items-baseline gap-3 mt-3">
            <span className="display text-4xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
              $500
            </span>
            <span className="text-sm font-medium" style={{ color: 'var(--subtle)' }}>{t(lang, 'settings_limit_day')}</span>
          </div>

          {/* Usage bar */}
          <div className="mt-2.5">
            <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--muted)' }}>
              <span>{t(lang, 'settings_limit_used')}: <strong style={{ color: 'var(--ink-2)' }}>$2.50</strong></span>
              <span style={{ color: 'var(--subtle)' }}>$500.00 limit</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: '0.5%', background: 'var(--accent)' }} />
            </div>
          </div>

          {/* Adjust form */}
          {showLimitForm && (
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex items-start gap-2.5 rounded-xl p-3"
                style={{ background: 'var(--warning-bg)' }}>
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--warning-text)' }} />
                <p className="text-xs leading-relaxed" style={{ color: 'var(--warning-text)' }}>
                  {t(lang, 'settings_limit_warning')}
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={newLimit}
                  onChange={e => setNewLimit(e.target.value)}
                  placeholder={t(lang, 'settings_limit_placeholder')}
                  className="flex-1 px-3.5 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
                />
                <button
                  onClick={handleSetLimit}
                  disabled={isPending || isConfirming}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 flex items-center gap-1.5"
                  style={{ background: 'var(--accent)', color: 'white' }}>
                  {(isPending || isConfirming) && <Loader2 size={14} className="animate-spin" />}
                  {t(lang, 'settings_limit_save')}
                </button>
              </div>
              {isSuccess && (
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--success)' }}>
                  <CheckCircle size={13} />
                  <span>{t(lang, 'settings_saved')}</span>
                  {txUrl && (
                    <a href={txUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-0.5 underline">
                      {t(lang, 'pay_view_tx')} <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── 2. Wallet + Token balances ── */}
      <section className="glass-card rounded-3xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--accent-soft)' }}>
            <Wallet size={14} style={{ color: 'var(--accent)' }} />
          </div>
          <p className="text-xs font-bold uppercase tracking-widest"
            style={{ color: 'var(--subtle)', letterSpacing: '0.08em' }}>
            {t(lang, 'settings_wallet')}
          </p>
        </div>

        {/* Address + copy button */}
        <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 mb-3"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <p className="mono text-xs flex-1 truncate"
            style={{ color: isConnected ? 'var(--ink-2)' : 'var(--subtle)' }}
            title={address ?? ''}>
            {isConnected ? shortAddr : t(lang, 'settings_not_connected')}
          </p>
          {isConnected && (
            <button
              onClick={handleCopy}
              title={address}
              className="flex items-center gap-1 shrink-0 px-2 py-1 rounded-lg text-[11px] font-semibold
                transition-all active:scale-95"
              style={{
                background: copied ? 'var(--success-bg)' : 'var(--accent-soft)',
                color: copied ? 'var(--success)' : 'var(--accent)',
              }}>
              {copied
                ? <><Check size={11} /> {t(lang, 'settings_copied')}</>
                : <><Copy size={11} /> {t(lang, 'settings_copy_addr')}</>}
            </button>
          )}
        </div>

        {/* Native USDC (Arc gas) */}
        <div className="flex items-center gap-2 mb-1 pb-2.5"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex-1 flex items-center gap-2">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              GAS
            </span>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              Arc Native (USDC)
            </span>
          </div>
          <span className="mono text-sm font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
            {nativeFormatted}
          </span>
        </div>

        {/* USDC ERC-20 row */}
        <div>
          {TOKEN_LIST.map(tok => (
            <TokenBalanceRow
              key={tok.symbol}
              symbol={tok.symbol}
              decimals={tok.decimals}
              color={tok.color}
              address={tok.address}
              walletAddr={address}
            />
          ))}
        </div>

        {/* ── CCTP: Nạp USDC từ chain khác ── */}
        <button
          onClick={() => onNavigate?.('bridge')}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl mt-2 mb-1 transition-all active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, rgba(26,111,255,0.10) 0%, rgba(26,111,255,0.05) 100%)',
            border: '1.5px solid rgba(26,111,255,0.20)',
          }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--accent)', color: 'white' }}>
            <ArrowDownToLine size={15} />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
              {t(lang, 'bridge_title')}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
              Base · Ethereum · Arbitrum → Arc · ~8–20s
            </p>
          </div>
          <ChevronRight size={16} style={{ color: 'var(--accent)', opacity: 0.7 }} />
        </button>

        {/* Circle Partner Stablecoins — announced, chờ issuer deploy lên Arc */}
        <div className="mt-1">
          {PARTNER_TOKENS.map((tok, i) => (
            <div key={tok.symbol} className="flex items-center gap-3 py-2.5"
              style={{ borderBottom: i < PARTNER_TOKENS.length - 1 ? '1px solid var(--border)' : 'none', opacity: 0.55 }}>
              <TokenIcon symbol={tok.symbol} size={26} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>{tok.symbol}</p>
                <p className="text-[10px]" style={{ color: 'var(--subtle)' }}>{tok.flag} {tok.issuer}</p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                style={{ background: 'rgba(251,191,36,0.12)', color: '#d97706', border: '1px solid rgba(217,119,6,0.2)' }}>
                {t(lang, 'settings_waiting_issuer')}
              </span>
            </div>
          ))}
        </div>

        {/* Tokens khác sắp ra mắt */}
        <div className="mt-0.5">
          {COMING_SOON.map((sym, i) => (
            <div key={sym} className="flex items-center gap-3 py-2"
              style={{ borderBottom: i < COMING_SOON.length - 1 ? '1px solid var(--border)' : 'none', opacity: 0.32 }}>
              <TokenIcon symbol={sym} size={22} />
              <span className="text-xs flex-1" style={{ color: 'var(--muted)' }}>{sym}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                style={{ background: 'var(--surface-muted)', color: 'var(--subtle)', border: '1px solid var(--border)' }}>
                {t(lang, 'settings_coming_soon_label')}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3. Verification tier ── */}
      <section className="glass-card rounded-3xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--accent-soft)' }}>
            <Shield size={14} style={{ color: 'var(--accent)' }} />
          </div>
          <p className="text-xs font-bold uppercase tracking-widest"
            style={{ color: 'var(--subtle)', letterSpacing: '0.08em' }}>
            {t(lang, 'settings_tier_title')}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {TIERS.map(tier => {
            const active = tier.level === currentTier
            return (
              <div key={tier.level}
                className="flex items-center gap-3 px-3.5 py-3 rounded-xl"
                style={{
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  border: active ? '1.5px solid rgba(26,111,255,0.20)' : '1px solid var(--border)',
                }}>
                <div className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: active ? tier.color : 'var(--border-strong)' }} />
                <span className="text-sm flex-1"
                  style={{ color: active ? 'var(--ink)' : 'var(--muted)', fontWeight: active ? 600 : 400 }}>
                  {t(lang, tier.labelKey)}
                </span>
                {active && (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                    style={{ background: tier.color, color: 'white', opacity: 0.9 }}>
                    {t(lang, 'settings_active')}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── 4. 2FA Security — chọn phương thức ── */}
      <section className="glass-card rounded-3xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--accent-soft)' }}>
            <Shield size={14} style={{ color: 'var(--accent)' }} />
          </div>
          <p className="text-xs font-bold uppercase tracking-widest"
            style={{ color: 'var(--subtle)', letterSpacing: '0.08em' }}>
            {t(lang, 'settings_security_title')}
          </p>
        </div>

        {/* Passkey option */}
        <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl mb-2"
          style={{ background: 'var(--accent-soft)', border: '1.5px solid rgba(26,111,255,0.20)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.10)' }}>
            {/* Fingerprint icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4"/>
              <path d="M5 19.5C5.5 18 6 15 6 12c0-1.7.7-3.2 1.8-4.3"/>
              <path d="M17.5 19.5c-.5-1.5-1-3.5-1-6 0-2.2-1.8-4-4-4S8.5 11.8 8.5 14c0 1-.2 2-.5 3"/>
              <path d="M20 17c.3-1 .5-2 .5-3 0-3.6-2-6.7-5-8.3"/>
              <path d="M11.5 17.5c.5-1 .5-2.5.5-3.5"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Passkey</p>
            <p className="text-[11px]" style={{ color: 'var(--muted)' }}>{t(lang, 'settings_passkey_desc')}</p>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'var(--accent)', color: 'white' }}>{t(lang, 'settings_passkey_active')}</span>
        </div>

        {/* Google Authenticator option */}
        <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl"
          style={{ border: '1px solid var(--border)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.10)' }}>
            {/* TOTP / clock icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EA4335"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Google Authenticator</p>
            <p className="text-[11px]" style={{ color: 'var(--muted)' }}>{t(lang, 'settings_ga_desc')}</p>
          </div>
          <button className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-all active:scale-95"
            style={{ background: 'var(--surface-muted)', color: 'var(--accent)', border: '1px solid var(--border)' }}
            onClick={() => toast.info(t(lang, 'settings_ga_soon'))}>
            {t(lang, 'settings_ga_activate')}
          </button>
        </div>

        <div className="flex items-start gap-2 mt-3 rounded-xl p-3"
          style={{ background: 'rgba(15,122,69,0.07)' }}>
          <Info size={12} className="shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--success)' }}>
            {t(lang, 'settings_security_body')}
          </p>
        </div>
      </section>

      {/* ── 5. Language picker ── */}
      {onChangeLang && (
        <section className="glass-card rounded-3xl p-5">
          <p className="text-xs font-bold uppercase tracking-widest mb-3"
            style={{ color: 'var(--subtle)', letterSpacing: '0.08em' }}>
            {t(lang, 'settings_lang_title')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {LANGUAGES.map(l => (
              <button key={l.code}
                onClick={() => onChangeLang(l.code)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all"
                style={{
                  background: l.code === lang ? 'var(--accent-soft)' : 'var(--surface-muted)',
                  color: l.code === lang ? 'var(--accent)' : 'var(--muted)',
                  border: l.code === lang ? '1.5px solid rgba(26,111,255,0.25)' : '1px solid var(--border)',
                  fontWeight: l.code === lang ? 600 : 400,
                }}>
                <span style={{ fontSize: 14 }}>{l.flag}</span>
                <span className="truncate">{l.code.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
