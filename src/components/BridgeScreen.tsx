/**
 * BridgeScreen — Nạp USDC vào fimoPAY từ chain khác
 * Dùng Circle App Kit + CCTP (permissionless, không cần API key)
 * Testnet: Base Sepolia → Arc Testnet
 * Mainnet: Base / Ethereum / Polygon → Arc (cùng 1 code, chỉ đổi chain name)
 */
import { useState } from 'react'
import { useAccount, useSwitchChain, useBalance } from 'wagmi'
import { AppKit, BridgeChain } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import { toast } from 'sonner'
import { ArrowRight, CheckCircle, Loader2, ExternalLink, Info } from 'lucide-react'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { ARC_USDC } from '../contracts'
import { baseSepolia, sepolia, arbitrumSepolia, arcTestnet } from '../config'
import type { LangCode } from '../i18n'
import { t } from '../i18n'
import FaucetButton from './FaucetButton'

// USDC addresses trên testnet source chains (Circle official)
const USDC_ON_CHAIN: Record<number, `0x${string}`> = {
  [baseSepolia.id]:     '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  [sepolia.id]:         '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  [arbitrumSepolia.id]: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
}

// ── App Kit singleton (no kit key needed for bridge) ────────────
const appKit = new AppKit()

// ── Supported source chains (testnet + mainnet ready) ──────────
const SOURCE_CHAINS: { label: string; chain: BridgeChain; chainId: number; testnet: boolean }[] = [
  { label: 'Base Sepolia',     chain: BridgeChain.Base_Sepolia,     chainId: baseSepolia.id,     testnet: true  },
  { label: 'Ethereum Sepolia', chain: BridgeChain.Ethereum_Sepolia, chainId: sepolia.id,         testnet: true  },
  { label: 'Arbitrum Sepolia', chain: BridgeChain.Arbitrum_Sepolia, chainId: arbitrumSepolia.id, testnet: true  },
  // Mainnet — uncomment khi user xác nhận mainnet
  // { label: 'Base',          chain: BridgeChain.Base,             chainId: 8453,     testnet: false },
  // { label: 'Ethereum',      chain: BridgeChain.Ethereum,         chainId: 1,        testnet: false },
]

const DEST: { label: string; chain: BridgeChain; chainId: number } =
  { label: 'Arc Testnet', chain: BridgeChain.Arc_Testnet, chainId: 5042002 }
// Mainnet: { label: 'Arc', chain: BridgeChain.Arc, chainId: 5042 }

type BridgeStep = {
  name: string
  state: 'pending' | 'running' | 'success' | 'error'
  txHash?: string
}

interface BridgeScreenProps { lang: LangCode }

type FundTab = 'bridge' | 'onramp'

export default function BridgeScreen({ lang }: BridgeScreenProps) {
  const { connector, isConnected, address, chainId: walletChainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()

  const [tab, setTab]           = useState<FundTab>('bridge')
  const [srcIdx, setSrcIdx]     = useState(0)
  const [amount, setAmount]     = useState('')
  const [steps, setSteps]       = useState<BridgeStep[]>([])
  const [bridging, setBridging] = useState(false)
  const [done, setDone]         = useState(false)

  const src = SOURCE_CHAINS[srcIdx]

  // ── Balance queries ───────────────────────────────────────────
  const srcUsdcAddr = USDC_ON_CHAIN[src.chainId]
  const { data: srcBalance } = useBalance({
    address,
    token: srcUsdcAddr,
    chainId: src.chainId,
    query: { enabled: isConnected && !!srcUsdcAddr },
  })
  const { data: arcBalance } = useBalance({
    address,
    token: ARC_USDC.address,
    chainId: arcTestnet.id,
    query: { enabled: isConnected },
  })

  const fmtBal = (b: typeof srcBalance) =>
    b ? `${parseFloat(b.formatted).toFixed(2)} ${b.symbol}` : '—'

  const handleBridge = async () => {
    if (!isConnected || !connector) {
      toast.error(t(lang, 'error_connect_wallet')); return
    }
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) {
      toast.error(t(lang, 'error_invalid_amount')); return
    }

    // Switch wallet to source chain first (required by CCTP)
    if (walletChainId !== src.chainId) {
      try {
        await switchChainAsync({ chainId: src.chainId })
      } catch {
        toast.error('Không thể chuyển mạng — hãy chuyển thủ công trong ví'); return
      }
    }

    const initialSteps: BridgeStep[] = [
      { name: 'approve',          state: 'pending' },
      { name: 'burn',             state: 'pending' },
      { name: 'fetchAttestation', state: 'pending' },
      { name: 'mint',             state: 'pending' },
    ]
    setSteps(initialSteps)
    setBridging(true)
    setDone(false)

    try {
      const provider = await (connector as { getProvider: () => Promise<EIP1193Provider> }).getProvider()
      const adapter  = await createViemAdapterFromProvider({ provider })

      // Mark first step as running
      setSteps(prev => prev.map((s, i) => i === 0 ? { ...s, state: 'running' } : s))

      const result = await appKit.bridge({
        from: { adapter, chain: src.chain },
        to:   { adapter, chain: DEST.chain },
        amount: amount,
      })

      // Update all steps from result.steps after completion
      if (result.steps) {
        setSteps(result.steps.map((s: { name: string; state: string; txHash?: string }) => ({
          name: s.name,
          state: (s.state === 'success' ? 'success' : s.state === 'error' ? 'error' : 'pending') as BridgeStep['state'],
          txHash: s.txHash,
        })))
      }

      if (result.state === 'success') {
        setDone(true)
        toast.success(`Đã nhận ${amount} USDC trên Arc Testnet`)
      } else {
        toast.error('Bridge thất bại — xem chi tiết bên dưới')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message.slice(0, 80) : 'Lỗi không xác định'
      toast.error('Bridge thất bại: ' + msg)
    } finally {
      setBridging(false)
    }
  }

  const STEP_LABELS: Record<string, string> = {
    approve:          t(lang, 'bridge_step_approve'),
    burn:             t(lang, 'bridge_step_send'),
    fetchAttestation: t(lang, 'bridge_step_confirm'),
    mint:             t(lang, 'bridge_step_receive'),
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── Header ── */}
      <div>
        <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>
          {t(lang, 'bridge_title')}
        </h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
          {t(lang, 'bridge_subtitle')}
        </p>
      </div>

      {/* ── Tab switcher ── */}
      <div className="grid grid-cols-2 gap-1 rounded-xl p-1"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--stroke)' }}>
        {(['bridge', 'onramp'] as FundTab[]).map(tb => (
          <button key={tb} onClick={() => setTab(tb)}
            className="rounded-lg py-2 text-xs font-semibold transition-all"
            style={{
              background: tab === tb ? 'var(--accent)' : 'transparent',
              color: tab === tb ? '#fff' : 'var(--subtle)',
            }}>
            {tb === 'bridge'
              ? (lang === 'vi' ? 'Từ chain khác' : lang === 'ja' ? '他チェーンから' : lang === 'ko' ? '다른 체인에서' : lang === 'th' ? 'จากเชนอื่น' : lang === 'zh' ? '從其他鏈' : lang === 'fil' ? 'Mula sa ibang chain' : 'From another chain')
              : (lang === 'vi' ? 'Mua bằng thẻ / Apple Pay' : lang === 'ja' ? 'カードで購入' : lang === 'ko' ? '카드로 구매' : lang === 'th' ? 'ซื้อด้วยบัตร' : lang === 'zh' ? '用卡購買' : lang === 'fil' ? 'Bumili gamit card' : 'Buy with card')}
          </button>
        ))}
      </div>

      {/* ── Onramp tab ── */}
      {tab === 'onramp' && (
        <div className="rounded-2xl p-5 flex flex-col gap-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--stroke)' }}>
          {/* Icon + title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--accent-soft)' }}>
              <span style={{ fontSize: 20 }}>💳</span>
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                {lang === 'vi' ? 'Mua USDC bằng thẻ' : lang === 'ja' ? 'カードでUSDCを購入' : lang === 'ko' ? '카드로 USDC 구매' : lang === 'th' ? 'ซื้อ USDC ด้วยบัตร' : lang === 'zh' ? '用卡購買USDC' : lang === 'fil' ? 'Bumili USDC gamit card' : 'Buy USDC with card'}
              </p>
              <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                Visa · Mastercard · Apple Pay · Google Pay
              </p>
            </div>
          </div>

          {/* Steps */}
          {([
            t(lang, 'onramp_step1'),
            t(lang, 'onramp_step2'),
            t(lang, 'onramp_step3'),
            t(lang, 'onramp_step4'),
          ] as string[]).map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)', flexShrink: 0 }}>
                {i + 1}
              </div>
              <span className="text-sm" style={{ color: 'var(--ink)' }}>{step}</span>
            </div>
          ))}

          {/* Beta badge */}
          <div className="rounded-xl px-3 py-2.5 flex items-start gap-2"
            style={{ background: 'rgba(255,165,0,0.08)', border: '1px solid rgba(255,165,0,0.25)' }}>
            <Info size={13} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
            <p className="text-xs leading-relaxed" style={{ color: '#92400e' }}>
              {lang === 'vi'
                ? 'Tính năng đang trong giai đoạn beta — cần Circle Onramp API key. Liên hệ Circle để được cấp quyền sớm nhất.'
                : lang === 'ja' ? '現在ベータ版 — Circle Onramp APIキーが必要です。Circle にお問い合わせください。'
                : lang === 'ko' ? '베타 진행 중 — Circle Onramp API 키 필요. Circle에 문의하세요.'
                : lang === 'th' ? 'อยู่ในช่วงเบต้า — ต้องใช้ Circle Onramp API key ติดต่อ Circle'
                : lang === 'zh' ? '目前為測試版 — 需要 Circle Onramp API 金鑰。請聯繫 Circle。'
                : lang === 'fil' ? 'Beta pa — kailangan ng Circle Onramp API key. Makipag-ugnayan sa Circle.'
                : 'In beta — requires Circle Onramp API key. Contact Circle for early access.'}
            </p>
          </div>

          {/* CTA */}
          <a href="https://console.circle.com" target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold"
            style={{ background: 'var(--accent)', color: '#fff' }}>
            {lang === 'vi' ? 'Đăng ký sớm →' : lang === 'ja' ? '早期登録 →' : lang === 'ko' ? '조기 등록 →' : lang === 'th' ? 'ลงทะเบียนก่อน →' : lang === 'zh' ? '提前申請 →' : lang === 'fil' ? 'Mag-sign up →' : 'Get early access →'}
          </a>
        </div>
      )}

      {/* ── Bridge tab content (only shown when tab === 'bridge') ── */}
      {tab === 'onramp' ? null : <>

      {/* ── Fee info ── */}
      <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
        style={{ background: 'var(--accent-soft)', border: '1px solid rgba(26,111,255,0.18)' }}>
        <Info size={14} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
        <p className="text-xs leading-relaxed" style={{ color: 'var(--accent)' }}>
          {t(lang, 'bridge_fee_note')}
        </p>
      </div>

      {/* ── Balance row ── */}
      {isConnected && (
        <div className="flex gap-2 text-[11px]">
          <div className="flex-1 glass-inner rounded-xl px-3 py-2 flex justify-between items-center">
            <span style={{ color: 'var(--subtle)' }}>{src.label}</span>
            <span className="mono font-semibold" style={{ color: 'var(--ink)' }}>
              {fmtBal(srcBalance)}
            </span>
          </div>
          <div className="flex-1 glass-inner rounded-xl px-3 py-2 flex justify-between items-center">
            <span style={{ color: 'var(--subtle)' }}>Arc Testnet</span>
            <span className="mono font-semibold" style={{ color: 'var(--success)' }}>
              {fmtBal(arcBalance)}
            </span>
          </div>
        </div>
      )}

      {/* ── Route card ── */}
      <div className="glass-card rounded-2xl p-4 flex items-center gap-3">
        {/* Source picker */}
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
            style={{ color: 'var(--subtle)' }}>{t(lang, 'bridge_source')}</p>
          <select
            value={srcIdx}
            onChange={e => setSrcIdx(Number(e.target.value))}
            className="w-full text-sm font-semibold rounded-xl px-3 py-2.5 outline-none"
            style={{
              background: 'var(--surface-muted)',
              border: '1px solid var(--border)',
              color: 'var(--ink)',
            }}>
            {SOURCE_CHAINS.map((c, i) => (
              <option key={c.chain} value={i}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Arrow */}
        <div className="flex flex-col items-center gap-1 shrink-0 mt-5">
          <ArrowRight size={18} style={{ color: 'var(--accent)' }} />
          <span className="text-[9px] font-semibold" style={{ color: 'var(--subtle)' }}>CCTP</span>
        </div>

        {/* Destination — fixed Arc */}
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
            style={{ color: 'var(--subtle)' }}>{t(lang, 'bridge_dest')}</p>
          <div className="text-sm font-semibold rounded-xl px-3 py-2.5"
            style={{ background: 'var(--accent-soft)', border: '1px solid rgba(26,111,255,0.2)', color: 'var(--accent)' }}>
            {DEST.label}
          </div>
        </div>
      </div>

      {/* ── Gas note: Eth/Arb dùng ETH gas, không phải USDC ── */}
      {src.chainId !== baseSepolia.id && (
        <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
          style={{ background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(217,119,6,0.25)' }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
          <p className="text-xs leading-relaxed" style={{ color: '#b45309' }}>
            {t(lang, 'bridge_gas_note')}
          </p>
        </div>
      )}

      {/* ── Amount input ── */}
      <div className="glass-inner rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--subtle)' }}>{t(lang, 'bridge_amount')}</span>
          <div className="flex items-center gap-2">
            {srcBalance && (
              <button
                onClick={() => setAmount(parseFloat(srcBalance.formatted).toFixed(2))}
                className="text-[10px] font-bold px-2 py-0.5 rounded-lg"
                style={{ background: 'rgba(26,111,255,0.12)', color: 'var(--accent)' }}>
                Max {parseFloat(srcBalance.formatted).toFixed(2)}
              </button>
            )}
            <span className="mono text-[11px] font-bold px-2 py-0.5 rounded-lg"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>USDC</span>
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
        <div className="flex gap-2 mt-3">
          {['10', '50', '100', '500'].map(v => (
            <button key={v} onClick={() => setAmount(v)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold"
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

      {/* ── Step progress (live) ── */}
      {steps.length > 0 && (
        <div className="glass-card rounded-2xl p-4 flex flex-col gap-2.5">
          <p className="text-[11px] font-bold uppercase tracking-widest"
            style={{ color: 'var(--subtle)', letterSpacing: '0.08em' }}>
            {t(lang, 'bridge_progress')}
          </p>
          {steps.map((step, i) => (
            <div key={step.name} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                style={{
                  background:
                    step.state === 'success' ? 'var(--success-bg)' :
                    step.state === 'running' ? 'var(--accent-soft)' :
                    step.state === 'error'   ? 'var(--danger-bg)'  :
                    'var(--surface-muted)',
                  color:
                    step.state === 'success' ? 'var(--success)' :
                    step.state === 'running' ? 'var(--accent)'  :
                    step.state === 'error'   ? 'var(--danger)'  :
                    'var(--subtle)',
                }}>
                {step.state === 'success' ? <CheckCircle size={14} /> :
                 step.state === 'running' ? <Loader2 size={14} className="animate-spin" /> :
                 i + 1}
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                  {STEP_LABELS[step.name] ?? step.name}
                </p>
                {step.txHash && (
                  <a
                    href={buildTxExplorerUrl(src.chainId, step.txHash)}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px]"
                    style={{ color: 'var(--accent)' }}>
                    Xem tx <ExternalLink size={9} />
                  </a>
                )}
              </div>
              {step.state === 'error' && (
                <span className="text-[10px] font-semibold" style={{ color: 'var(--danger)' }}>Thất bại</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Done state ── */}
      {done && (
        <div className="glass-card rounded-3xl p-5 flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: 'var(--success-bg)' }}>
            <CheckCircle size={32} style={{ color: 'var(--success)' }} />
          </div>
          <p className="display font-bold text-lg text-center" style={{ color: 'var(--ink)' }}>
            {t(lang, 'bridge_success')}
          </p>
          <p className="text-sm text-center" style={{ color: 'var(--muted)' }}>
            {amount} USDC
          </p>
          <button
            onClick={() => { setDone(false); setSteps([]); setAmount('') }}
            className="mt-1 text-sm font-semibold px-6 py-2.5 rounded-xl"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}>
            {t(lang, 'bridge_new')}
          </button>
        </div>
      )}

      {/* ── CTA ── */}
      {!done && (
        <button
          onClick={() => { void handleBridge() }}
          disabled={bridging || !isConnected || !amount}
          className="w-full py-4 rounded-2xl text-sm font-bold transition-all
            hover:scale-[1.01] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed
            flex items-center justify-center gap-2"
          style={{
            background: 'var(--accent)',
            color: 'white',
            boxShadow: '0 4px 20px rgba(26,111,255,0.28)',
          }}>
          {bridging && <Loader2 size={16} className="animate-spin" />}
          {bridging ? t(lang, 'bridge_transferring') : t(lang, 'bridge_btn').replace('{amount}', amount || '0')}
        </button>
      )}

      {/* ── Gateway promo (skeleton mainnet) ── */}
      <div className="rounded-2xl px-4 py-3.5 flex gap-3 items-center"
        style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(26,111,255,0.08)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/>
            <path d="M3 12a9 3 0 0 0 18 0"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
            {t(lang, 'gateway_coming_soon')} · {t(lang, 'gateway_title')}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
            {t(lang, 'bridge_gateway_teaser')}
          </p>
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded-lg shrink-0"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          Mainnet
        </span>
      </div>

      {/* ── Faucet tích hợp ── */}
      <FaucetButton lang={lang} />

      </> /* end bridge tab */}
    </div>
  )
}
