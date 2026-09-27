/**
 * useServiceSession — Generic hook for machine commerce payment flow
 *
 * Supports all 5 fimoPAY service types (EV, Parking, Vending, Checkout, Remittance)
 * via the same SettlementRouterV1.batchSettle() call.
 *
 * On-chain flow (when wallet connected):
 *   1. openSession()   → SessionEscrow
 *   2. approve()       → USDC ERC-20 approve for SettlementRouter
 *   3. batchSettle()   → SettlementRouterV1 (via FimoProxy)
 *
 * Demo flow (when backend unavailable or no wallet):
 *   Simulates all steps with fake txHash
 */
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, keccak256, encodePacked, toHex } from 'viem'
import { toast } from 'sonner'
import {
  SETTLEMENT_ROUTER,
  SESSION_ESCROW,
  ARC_USDC,
  CHAIN_ID,
  buildTxUrl,
} from '../contracts'
import { erc20Abi } from 'viem'

// ── Merchant address (demo) — deployer wallet is owner/merchant for testing
const DEMO_MERCHANT = '0x5B12Ce46C7194aD57d143bC22847224047b1Ef42' as `0x${string}`
// Demo device ID
const DEMO_DEVICE_ID = keccak256(toHex('FIMO_EV_001'))

export type ServiceType = 'ev' | 'parking' | 'vending' | 'checkout' | 'remittance'

export interface SettleResult {
  txHash: string
  txUrl:  string
  isDemo: boolean
}

export function useServiceSession() {
  const { writeContractAsync } = useWriteContract()

  // ── Step 1: openSession ──────────────────────────────────────────────────────
  const openSession = async (
    user: `0x${string}`,
    amountUSD: number,
    serviceType: ServiceType,
  ): Promise<`0x${string}`> => {
    const sessionId = keccak256(
      encodePacked(
        ['address', 'uint256', 'uint256'],
        [user, BigInt(Math.floor(amountUSD * 1e6)), BigInt(Date.now())],
      ),
    )

    const estimatedUSD6 = parseUnits(amountUSD.toFixed(6), 6)
    const isRemittance  = serviceType === 'remittance'

    await writeContractAsync({
      address:      SESSION_ESCROW.address,
      abi:          SESSION_ESCROW.abi,
      functionName: 'openSession',
      args: [
        sessionId,
        user,
        DEMO_DEVICE_ID,
        ARC_USDC.address,
        estimatedUSD6,
        isRemittance,
      ],
      chainId: CHAIN_ID,
    })

    return sessionId
  }

  // ── Step 2: approve USDC ────────────────────────────────────────────────────
  const approveUsdc = async (amountUSD: number): Promise<void> => {
    const amount = parseUnits(amountUSD.toFixed(6), 6)
    await writeContractAsync({
      address:      ARC_USDC.address,
      abi:          erc20Abi,
      functionName: 'approve',
      args:         [SETTLEMENT_ROUTER.address, amount],
      chainId:      CHAIN_ID,
    })
  }

  // ── Step 3: batchSettle ─────────────────────────────────────────────────────
  const batchSettle = async (
    sessionId: `0x${string}`,
    user:      `0x${string}`,
    amountUSD: number,
    serviceType: ServiceType,
    merchant?: `0x${string}`,
  ): Promise<`0x${string}`> => {
    const amountUSD6   = parseUnits(amountUSD.toFixed(6), 6)
    const deadline     = BigInt(Math.floor(Date.now() / 1000) + 300) // +5 min
    const isRemittance = serviceType === 'remittance'
    const isDevice     = serviceType !== 'remittance'

    const txHash = await writeContractAsync({
      address:      SETTLEMENT_ROUTER.address,
      abi:          SETTLEMENT_ROUTER.abi,
      functionName: 'batchSettle',
      args: [[{
        sessionId,
        user,
        payToken:     ARC_USDC.address,
        merchant:     merchant ?? DEMO_MERCHANT,
        amountUSD6,
        deadline,
        isRemittance,
        isDeviceService: isDevice,
      }]],
      chainId: CHAIN_ID,
    })

    return txHash
  }

  // ── Full flow: openSession → approve → batchSettle ──────────────────────────
  const settle = async (
    user:        `0x${string}`,
    amountUSD:   number,
    serviceType: ServiceType,
    merchant?:   `0x${string}`,
  ): Promise<SettleResult> => {
    toast.loading('Bước 1/3 · Mở phiên...', { id: 'settle' })

    const sessionId = await openSession(user, amountUSD, serviceType)
    toast.loading('Bước 2/3 · Xác nhận USDC...', { id: 'settle' })

    await approveUsdc(amountUSD)
    toast.loading('Bước 3/3 · Ghi nhận giao dịch...', { id: 'settle' })

    const txHash = await batchSettle(sessionId, user, amountUSD, serviceType, merchant)
    toast.success('Giao dịch thành công!', { id: 'settle' })

    return { txHash, txUrl: buildTxUrl(txHash), isDemo: false }
  }

  return { settle, openSession, approveUsdc, batchSettle }
}

// ── Ref to useWaitForTransactionReceipt for receipt polling ─────────────────
export { useWaitForTransactionReceipt }
