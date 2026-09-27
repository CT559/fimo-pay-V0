/**
 * ServiceScreen — Generic machine commerce payment screen
 *
 * Dùng cho: Bãi đỗ xe, Vending Machine, Self-checkout
 * Không dùng cho EV (có live kWh meter riêng) và Remittance (có currency picker riêng).
 *
 * Flow: idle → confirming → done
 * On-chain: approve USDC → batchSettle (qua useServiceSession)
 * Demo:     khi chưa kết nối ví hoặc backend lỗi → txHash giả
 */

import { useState } from 'react'
import { useAccount, useBalance, useWriteContract } from 'wagmi'
import { parseUnits } from 'viem'
import { toast } from 'sonner'
import { CheckCircle, Loader2, ChevronRight, ExternalLink, ShoppingCart } from 'lucide-react'
import { erc20Abi } from 'viem'
import type { LangCode } from '../i18n'
import { t } from '../i18n'
import {
  ARC_USDC, SETTLEMENT_ROUTER, SESSION_ESCROW,
  CHAIN_ID, buildTxUrl,
} from '../contracts'
import { keccak256, encodePacked, toHex } from 'viem'

// ── Service config ─────────────────────────────────────────────────────────────
export interface ServiceConfig {
  /** service key */
  type: 'parking' | 'vending' | 'checkout'
  /** Icon SVG component */
  Icon: React.FC<{ size?: number; color?: string }>
  /** Localisation title key */
  titleKey: string
  /** Localisation subtitle key */
  subtitleKey: string
  /** Demo merchant (for testing) */
  demoMerchant: `0x${string}`
  /** Demo items (shown in confirm screen) */
  demoItems: { label: string; amount: number }[]
  /** Fixed demo price per transaction */
  demoTotal: number
  /** Unit label in receipt (e.g. "phút", "sản phẩm") */
  unitLabel: string
  /** Unit value in receipt */
  unitValue: string
}

const DEMO_MERCHANT = '0x5B12Ce46C7194aD57d143bC22847224047b1Ef42' as `0x${string}`
const DEMO_DEVICE   = keccak256(toHex('FIMO_DEVICE_001'))

type Phase = 'idle' | 'approving' | 'settling' | 'done' | 'error'

interface ServiceScreenProps {
  lang:   LangCode
  config: ServiceConfig
}

export default function ServiceScreen({ lang, config }: ServiceScreenProps) {
  const { address, isConnected } = useAccount()

  const [phase,    setPhase]    = useState<Phase>('idle')
  const [txHash,   setTxHash]   = useState<string>('')
  const [isDemo,   setIsDemo]   = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const { data: usdcBalance } = useBalance({
    address,
    token: ARC_USDC.address,
    chainId: CHAIN_ID,
    query: { enabled: isConnected && !!address },
  })

  const { writeContractAsync: approveWrite } = useWriteContract()
  const { writeContractAsync: openWrite }    = useWriteContract()
  const { writeContractAsync: settleWrite }  = useWriteContract()

  const totalUSD = config.demoTotal

  // ── Demo settle ─────────────────────────────────────────────────────────────
  const runDemo = async () => {
    setIsDemo(true)
    await new Promise(r => setTimeout(r, 800))
    const fakeTx = '0xdemo' + Math.random().toString(16).slice(2, 14).padEnd(60, '0')
    setTxHash(fakeTx)
    setPhase('done')
    toast.success(t(lang, 'pay_success') + ' · Demo Mode')
  }

  // ── On-chain settle ─────────────────────────────────────────────────────────
  const runOnChain = async () => {
    if (!address) return
    setIsDemo(false)

    // 1. openSession
    const sessionId = keccak256(
      encodePacked(
        ['address', 'uint256', 'uint256'],
        [address, BigInt(Math.floor(totalUSD * 1e6)), BigInt(Date.now())],
      ),
    )
    setPhase('approving')
    toast.loading('Bước 1/3 · Mở phiên...', { id: 'svc-settle' })

    await openWrite({
      address: SESSION_ESCROW.address,
      abi:     SESSION_ESCROW.abi,
      functionName: 'openSession',
      args: [
        sessionId,
        address,
        DEMO_DEVICE,
        ARC_USDC.address,
        parseUnits(totalUSD.toFixed(6), 6),
        false, // isRemittance = false for device services
      ],
      chainId: CHAIN_ID,
    })

    // 2. approve USDC
    toast.loading('Bước 2/3 · Xác nhận USDC...', { id: 'svc-settle' })
    await approveWrite({
      address:      ARC_USDC.address,
      abi:          erc20Abi,
      functionName: 'approve',
      args:         [SETTLEMENT_ROUTER.address, parseUnits(totalUSD.toFixed(6), 6)],
      chainId:      CHAIN_ID,
    })

    // 3. batchSettle
    setPhase('settling')
    toast.loading('Bước 3/3 · Ghi nhận giao dịch...', { id: 'svc-settle' })
    const hash = await settleWrite({
      address:      SETTLEMENT_ROUTER.address,
      abi:          SETTLEMENT_ROUTER.abi,
      functionName: 'batchSettle',
      args: [[{
        sessionId,
        user:         address,
        payToken:     ARC_USDC.address,
        merchant:     DEMO_MERCHANT,
        amountUSD6:   parseUnits(totalUSD.toFixed(6), 6),
        deadline:     BigInt(Math.floor(Date.now() / 1000) + 300),
        isRemittance: false,
        isDeviceService: true,
      }]],
      chainId: CHAIN_ID,
    })

    toast.success('Giao dịch thành công!', { id: 'svc-settle' })
    setTxHash(hash)
    setPhase('done')
  }

  const handlePay = async () => {
    if (!isConnected || !address) {
      toast.error(t(lang, 'error_connect_wallet')); return
    }
    try {
      // Thử on-chain trước, fallback Demo
      await runOnChain()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('rejected') || msg.includes('denied')) {
        toast.error('Giao dịch đã huỷ')
        setPhase('idle')
      } else {
        // Contract không sẵn sàng → Demo Mode
        console.warn('On-chain settle failed, fallback to demo:', msg)
        await runDemo()
      }
    }
  }

  const handleReset = () => {
    setPhase('idle'); setTxHash(''); setErrorMsg(''); setIsDemo(false)
  }

  // ── Icon ────────────────────────────────────────────────────────────────────
  const { Icon } = config

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '20px 16px', maxWidth: 480, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
          {t(lang, config.titleKey as Parameters<typeof t>[1])}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4 }}>
          {t(lang, config.subtitleKey as Parameters<typeof t>[1])}
        </p>
      </div>

      {/* === IDLE + CONFIRM === */}
      {(phase === 'idle') && (
        <div>
          {/* Service card */}
          <div className="glass-card rounded-2xl p-5 mb-5">
            {/* Icon + device info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(26,111,255,0.13), rgba(26,111,255,0.26))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={24} color="var(--accent)" />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>
                  {t(lang, config.titleKey as Parameters<typeof t>[1])} #001
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                  Demo · Arc Testnet
                </div>
              </div>
            </div>

            {/* Spectral strip */}
            <div style={{ height: 2, background: 'var(--spectral)', borderRadius: 2, marginBottom: 16 }} />

            {/* Items */}
            {config.demoItems.map(item => (
              <div key={item.label} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '8px 0', borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{item.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                  ${item.amount.toFixed(2)}
                </span>
              </div>
            ))}

            {/* Total */}
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '12px 0 0',
              marginTop: 4,
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                {t(lang, 'pay_total')}
              </span>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)' }}>
                ${totalUSD.toFixed(2)} USDC
              </span>
            </div>
          </div>

          {/* Balance */}
          {isConnected && usdcBalance && (
            <p style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 12, textAlign: 'right' }}>
              {t(lang, 'pay_balance')}: {parseFloat(usdcBalance.formatted).toFixed(2)} USDC
            </p>
          )}

          {/* Stable fee note */}
          <div style={{
            background: 'rgba(26,111,255,0.07)', borderRadius: 10, padding: '8px 12px',
            fontSize: 11, color: 'var(--accent)', marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <ShoppingCart size={11} />
            Phí giao dịch ~$0.001 · Cố định · Arc EWMA
          </div>

          {/* CTA */}
          <button
            onClick={() => void handlePay()}
            disabled={!isConnected}
            style={{
              width: '100%', padding: '16px',
              background: isConnected ? 'var(--accent)' : 'var(--surface-muted)',
              color: isConnected ? '#fff' : 'var(--subtle)',
              border: 'none', borderRadius: 14,
              fontSize: 16, fontWeight: 600,
              cursor: isConnected ? 'pointer' : 'default',
            }}
          >
            {t(lang, 'pay_btn_confirm')} ${totalUSD.toFixed(2)} USDC
          </button>

          {!isConnected && (
            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-2)', marginTop: 10 }}>
              {t(lang, 'error_connect_wallet')}
            </p>
          )}
        </div>
      )}

      {/* === APPROVING / SETTLING === */}
      {(phase === 'approving' || phase === 'settling') && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Loader2 size={48} color="var(--accent)"
            style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>
            {phase === 'approving'
              ? 'Bước 2/3 · Xác nhận USDC...'
              : 'Bước 3/3 · Ghi nhận giao dịch...'}
          </div>
        </div>
      )}

      {/* === DONE === */}
      {phase === 'done' && (
        <div>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <CheckCircle size={56} color="#22c55e" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>
              {t(lang, 'pay_success')}
            </div>
            {isDemo && (
              <span style={{
                display: 'inline-block', marginTop: 6,
                fontSize: 11, fontWeight: 600, padding: '2px 8px',
                borderRadius: 6, background: '#22c55e18', color: '#16a34a',
              }}>
                Demo Mode
              </span>
            )}
          </div>

          {/* Receipt */}
          <div className="glass-inner rounded-2xl p-5 mb-5">
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--subtle)', letterSpacing: '0.08em', marginBottom: 12 }}>
              {t(lang, 'ev_receipt').toUpperCase()}
            </div>
            {[
              [config.unitLabel, config.unitValue],
              [t(lang, 'ev_amount'), `$${totalUSD.toFixed(2)} USDC`],
              [t(lang, 'ev_fee'),   '~$0.001'],
            ].map(([label, value]) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '8px 0', borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{value}</span>
              </div>
            ))}

            {txHash && (
              <a
                href={buildTxUrl(txHash)}
                target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14,
                  fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}
              >
                <ExternalLink size={12} />
                {t(lang, 'pay_view_tx')}
              </a>
            )}
          </div>

          <button
            onClick={handleReset}
            style={{
              width: '100%', padding: '14px',
              background: 'transparent', color: 'var(--accent)',
              border: '1.5px solid var(--accent)', borderRadius: 14,
              fontSize: 15, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <ChevronRight size={16} />
            {t(lang, 'pay_new')}
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
          <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 20 }}>{errorMsg}</div>
          <button onClick={handleReset} style={{
            padding: '12px 24px', background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: 10, fontSize: 14, cursor: 'pointer',
          }}>
            {t(lang, 'pay_btn_connect')}
          </button>
        </div>
      )}
    </div>
  )
}
