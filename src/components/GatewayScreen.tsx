/**
 * GatewayScreen — Circle Gateway: số dư hợp nhất đa chain
 *
 * Bộ khung sẵn sàng cho mainnet — chỉ cần đổi networkKind = 'mainnet'
 * khi user xác nhận chuyển sang production.
 *
 * Flow: Deposit USDC → GatewayWallet (approve + deposit)
 *       Transfer: burn intent (EIP-712) → POST /gateway-api → gatewayMint
 *
 * Tài liệu tham khảo:
 *   https://developers.circle.com/gateway/howtos/create-unified-usdc-balance.md
 *   https://docs.arc.io/arc/tutorials/access-usdc-crosschain.md
 */
import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract,
         useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi, parseUnits } from 'viem'
import { toast } from 'sonner'
import { Loader2, CheckCircle, ExternalLink, Info, AlertTriangle } from 'lucide-react'
import { getUsdc, getProtocolContractByName, buildTxExplorerUrl } from '@/onchain-facts'
import { Amount } from '@/onchain-money'
import type { LangCode } from '../i18n'

// ── Network kind — flip to 'mainnet' when going live ───────────
const NETWORK_KIND: 'testnet' | 'mainnet' = 'testnet'
const CHAIN_ID = 5042002  // Arc Testnet (swap to 5042 for mainnet)

// ── Gateway ABI fragments needed ────────────────────────────────
const GATEWAY_WALLET_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token',     type: 'address' },
      { name: 'amount',    type: 'uint256' },
      { name: 'depositor', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'getBalance',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'depositor', type: 'address' }],
    outputs: [{ name: '',          type: 'uint256' }],
  },
] as const

// Gateway REST API base
const GATEWAY_API = NETWORK_KIND === 'testnet'
  ? 'https://gateway-api-testnet.circle.com/v1'
  : 'https://gateway-api.circle.com/v1'

export default function GatewayScreen({ _lang }: { _lang: LangCode }) {
  const { address, isConnected } = useAccount()
  const [depositAmount, setDepositAmount] = useState('')
  const [depositStep, setDepositStep] = useState<'idle' | 'approving' | 'depositing' | 'done'>('idle')

  // ── USDC + Gateway addresses from onchain-facts ────────────────
  const usdcFact      = getUsdc(CHAIN_ID)
  const usdcAddr      = usdcFact?.address as `0x${string}` | undefined
  const usdcDecimals  = usdcFact?.decimals ?? 6
  const gwWallet      = getProtocolContractByName('GatewayWallet', NETWORK_KIND)
  const gwWalletAddr  = gwWallet?.address as `0x${string}` | undefined

  // ── Read USDC balance ──────────────────────────────────────────
  const { data: usdcBalRaw } = useReadContract({
    address: usdcAddr,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address && !!usdcAddr },
  })

  // ── Read Gateway unified balance ───────────────────────────────
  const { data: gwBalRaw, refetch: refetchGwBal } = useReadContract({
    address: gwWalletAddr,
    abi: GATEWAY_WALLET_ABI,
    functionName: 'getBalance',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address && !!gwWalletAddr },
  })

  const usdcBal = usdcBalRaw !== undefined
    ? Amount.fromRaw(usdcBalRaw, usdcDecimals).toFixed(2)
    : '—'
  const gwBal = gwBalRaw !== undefined
    ? Amount.fromRaw(gwBalRaw, usdcDecimals).toFixed(2)
    : '—'

  // ── Step 1: approve ────────────────────────────────────────────
  const { writeContract: approveWrite, data: approveTx } = useWriteContract()
  const { isLoading: approveConfirming } = useWaitForTransactionReceipt({ hash: approveTx })

  // ── Step 2: deposit ────────────────────────────────────────────
  const { writeContract: depositWrite, data: depositTx } = useWriteContract()
  const { isLoading: depositConfirming } = useWaitForTransactionReceipt({ hash: depositTx })

  const txUrl = depositTx ? buildTxExplorerUrl(CHAIN_ID, depositTx) : undefined
  const isProcessing = depositStep !== 'idle' && depositStep !== 'done'

  const handleDeposit = () => {
    if (!isConnected || !usdcAddr || !gwWalletAddr || !address) {
      toast.error('Hãy kết nối tài khoản trước'); return
    }
    const amt = parseFloat(depositAmount)
    if (isNaN(amt) || amt <= 0) { toast.error('Nhập số tiền hợp lệ'); return }

    const amtRaw = parseUnits(depositAmount, usdcDecimals)
    setDepositStep('approving')
    toast.info('Bước 1/2: Phê duyệt USDC...')

    approveWrite({
      address: usdcAddr,
      abi: erc20Abi,
      functionName: 'approve',
      args: [gwWalletAddr, amtRaw],
      chainId: CHAIN_ID,
    }, {
      onSuccess: () => {
        setDepositStep('depositing')
        toast.info('Bước 2/2: Nạp vào Gateway...')
        depositWrite({
          address: gwWalletAddr,
          abi: GATEWAY_WALLET_ABI,
          functionName: 'deposit',
          args: [usdcAddr, amtRaw, address],
          chainId: CHAIN_ID,
        }, {
          onSuccess: () => {
            setDepositStep('done')
            void refetchGwBal()
            toast.success(`Đã nạp ${depositAmount} USDC vào Gateway`)
          },
          onError: (e) => {
            toast.error('Deposit thất bại: ' + e.message.slice(0, 60))
            setDepositStep('idle')
          },
        })
      },
      onError: (e) => {
        toast.error('Approve thất bại: ' + e.message.slice(0, 60))
        setDepositStep('idle')
      },
    })
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── Header ── */}
      <div>
        <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>
          Số dư hợp nhất
        </h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
          Circle Gateway · Arc Testnet · &lt;500ms
        </p>
      </div>

      {/* ── Balance cards ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2"
            style={{ color: 'var(--subtle)' }}>Ví thường</p>
          <p className="display text-2xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
            {usdcBal}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>USDC · Arc Testnet</p>
        </div>
        <div className="glass-card rounded-2xl p-4"
          style={{ border: '1px solid rgba(26,111,255,0.22)' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2"
            style={{ color: 'var(--accent)' }}>Gateway</p>
          <p className="display text-2xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
            {gwBal}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Hợp nhất đa chain</p>
        </div>
      </div>

      {/* ── Info box ── */}
      <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
        style={{ background: 'var(--accent-soft)', border: '1px solid rgba(26,111,255,0.18)' }}>
        <Info size={13} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
        <p className="text-xs leading-relaxed" style={{ color: 'var(--accent)' }}>
          Số dư Gateway hợp nhất USDC từ nhiều chain (Ethereum, Base, Polygon...).
          Nạp một lần — dùng được mọi nơi. Transfer &lt;500ms, không cần chờ finality.
        </p>
      </div>

      {/* ── Deposit form ── */}
      <div className="glass-card rounded-2xl p-4 flex flex-col gap-3">
        <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
          Nạp USDC vào Gateway
        </p>
        <div className="glass-inner rounded-xl p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold" style={{ color: 'var(--subtle)' }}>
              Số lượng
            </span>
            <span className="mono text-[11px] font-bold px-2 py-0.5 rounded-lg"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              USDC
            </span>
          </div>
          <input
            inputMode="decimal"
            type="text"
            value={depositAmount}
            onChange={e => {
              const v = e.target.value.replace(/[^0-9.]/g, '')
              if (v === '' || /^\d*\.?\d*$/.test(v)) setDepositAmount(v)
            }}
            placeholder="0.00"
            className="w-full bg-transparent display text-3xl font-bold tabular-nums outline-none"
            style={{ color: depositAmount ? 'var(--ink)' : 'var(--border-strong)', caretColor: 'var(--accent)' }}
          />
        </div>

        {depositStep === 'done' ? (
          <div className="flex flex-col items-center gap-2 py-3">
            <CheckCircle size={28} style={{ color: 'var(--success)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Đã nạp thành công</p>
            {txUrl && (
              <a href={txUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs"
                style={{ color: 'var(--accent)' }}>
                Xem biên lai <ExternalLink size={11} />
              </a>
            )}
            <button
              onClick={() => { setDepositStep('idle'); setDepositAmount('') }}
              className="mt-1 text-xs font-semibold px-4 py-2 rounded-xl"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}>
              Nạp thêm
            </button>
          </div>
        ) : (
          <button
            onClick={handleDeposit}
            disabled={isProcessing || !isConnected || !depositAmount || approveConfirming || depositConfirming}
            className="w-full py-3.5 rounded-xl text-sm font-bold transition-all
              hover:scale-[1.01] active:scale-[0.98] disabled:opacity-40
              flex items-center justify-center gap-2"
            style={{ background: 'var(--accent)', color: 'white' }}>
            {isProcessing && <Loader2 size={15} className="animate-spin" />}
            {depositStep === 'approving' && (approveConfirming || isProcessing)
              ? 'Đang phê duyệt... (1/2)'
              : depositStep === 'depositing' && (depositConfirming || isProcessing)
              ? 'Đang nạp... (2/2)'
              : `Nạp ${depositAmount || '0'} USDC vào Gateway`}
          </button>
        )}
      </div>

      {/* ── Transfer skeleton (mainnet roadmap) ── */}
      <div className="rounded-2xl p-4 flex flex-col gap-2.5"
        style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <AlertTriangle size={13} style={{ color: 'var(--warning-text)' }} />
          <p className="text-xs font-bold" style={{ color: 'var(--warning-text)' }}>
            Transfer đa chain (sắp ra mắt)
          </p>
        </div>
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
          Sau khi ra mainnet: burn USDC trên Arc → mint ngay trên Ethereum/Base/Polygon &lt;500ms.
          Không cần bridge thủ công, không cần chờ attestation.
          API endpoint: <span className="mono">{GATEWAY_API}/transfers</span>
        </p>
        <div className="grid grid-cols-3 gap-1.5 mt-1">
          {['Ethereum', 'Base', 'Polygon'].map(c => (
            <div key={c} className="rounded-lg px-2 py-1.5 text-center text-[10px] font-semibold"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--subtle)' }}>
              {c}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
