/**
 * agent.ts — FIMO Agent Backend (Tầng 2)
 *
 * Luồng EV Charger end-to-end:
 *   1. Nhận kết nối từ Frontend (REST /api/session/start)
 *   2. Gọi SettlementRouter.openSession() trên chain
 *   3. Lắng nghe UsageReading từ ev-simulator qua WebSocket
 *   4. Khi Frontend yêu cầu dừng → stopChargingSession() → gọi settle()
 *
 * Chạy: bun run agent:start
 */

import { createPublicClient, createWalletClient, http, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { WebSocket } from 'ws'
import { keccak256, encodeAbiParameters, parseAbiParameters } from 'viem'
import { startChargingSession, stopChargingSession, DEVICE_ID, type UsageReading } from './ev-simulator'

// ── Môi trường ───────────────────────────────────────────────────────────────
const RPC_URL    = process.env.RPC_URL    || 'https://rpc.testnet.arc.io'
const AGENT_KEY  = (process.env.AGENT_PRIVATE_KEY ||
  // Demo key — thay bằng key thật trong .env khi ra testnet thật
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d') as `0x${string}`

const ARC_TESTNET = {
  id:   5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const

// ── ABI tối thiểu cần dùng ───────────────────────────────────────────────────
const SESSION_ESCROW_ABI = [
  {
    name: 'openSession',
    type: 'function',
    inputs: [
      { name: 'sessionId',    type: 'bytes32' },
      { name: 'user',         type: 'address' },
      { name: 'deviceId',     type: 'bytes32' },
      { name: 'token',        type: 'address' },
      { name: 'estimatedUSD6',type: 'uint256' },
      { name: 'isRemittance', type: 'bool'    },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

const SETTLEMENT_ROUTER_ABI = [
  {
    name: 'settle',
    type: 'function',
    inputs: [{
      name: 'p',
      type: 'tuple',
      components: [
        { name: 'sessionId',      type: 'bytes32' },
        { name: 'user',           type: 'address' },
        { name: 'payToken',       type: 'address' },
        { name: 'merchant',       type: 'address' },
        { name: 'amountUSD6',     type: 'uint256' },
        { name: 'deadline',       type: 'uint256' },
        { name: 'isRemittance',   type: 'bool'    },
        { name: 'isDeviceService',type: 'bool'    },
      ],
    }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

const USAGE_ATTESTATION_ABI = [
  {
    name: 'attest',
    type: 'function',
    inputs: [
      { name: 'sessionId',  type: 'bytes32' },
      { name: 'deviceId',   type: 'bytes32' },
      { name: 'amountUSD6', type: 'uint256' },
      { name: 'signature',  type: 'bytes'   },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

// ── Địa chỉ contracts trên Arc Testnet ───────────────────────────────────────
const CONTRACTS = {
  SETTLEMENT_ROUTER:  '0xd70b8c9a1b61f1c9ebb79803ae6a610add0be34a' as `0x${string}`,
  SESSION_ESCROW:     '0x8b209ee7061481be3605a7c988fda70cf0548663' as `0x${string}`,
  USAGE_ATTESTATION:  '0xdfeb8e0b0ad692d7698b84da8a0eb6e8703d3a3e' as `0x${string}`,
  USDC:               '0x3600000000000000000000000000000000000000' as `0x${string}`,
  // Merchant demo address (trạm sạc EV owner)
  MERCHANT:           '0x5B12Ce46C7194aD57d143bC22847224047b1Ef42' as `0x${string}`,
}

// ── Viem clients ─────────────────────────────────────────────────────────────
const account      = privateKeyToAccount(AGENT_KEY)
const publicClient = createPublicClient({ chain: ARC_TESTNET, transport: http(RPC_URL) })
const walletClient = createWalletClient({ account, chain: ARC_TESTNET, transport: http(RPC_URL) })

console.log(`[AGENT] Địa chỉ agent: ${account.address}`)
console.log(`[AGENT] RPC: ${RPC_URL}`)

// ── State sessions đang chạy ─────────────────────────────────────────────────
const liveSessions = new Map<string, {
  user:      `0x${string}`
  startTime: number
  lastReading?: UsageReading
}>()

// ── Tạo sessionId ngẫu nhiên ─────────────────────────────────────────────────
function makeSessionId(user: `0x${string}`): `0x${string}` {
  const nonce = BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000))
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters('address, uint256'),
      [user, nonce]
    )
  )
}

// ── BƯỚC 1: Mở phiên sạc ─────────────────────────────────────────────────────
export async function openEVSession(user: `0x${string}`): Promise<{
  sessionId: `0x${string}`
  txHash:    `0x${string}`
}> {
  const sessionId     = makeSessionId(user)
  const estimatedUSD6 = parseUnits('5', 6) // Ước tính $5, sẽ điều chỉnh khi settle

  console.log(`\n[AGENT] === Mở phiên EV ===`)
  console.log(`[AGENT] User:      ${user}`)
  console.log(`[AGENT] SessionId: ${sessionId.slice(0, 18)}...`)

  // Gọi SessionEscrow.openSession() trên chain
  const txHash = await walletClient.writeContract({
    address:      CONTRACTS.SESSION_ESCROW,
    abi:          SESSION_ESCROW_ABI,
    functionName: 'openSession',
    args: [
      sessionId,
      user,
      DEVICE_ID,
      CONTRACTS.USDC,
      estimatedUSD6,
      false, // isRemittance
    ],
  })

  console.log(`[AGENT] openSession tx: ${txHash}`)
  await publicClient.waitForTransactionReceipt({ hash: txHash })
  console.log(`[AGENT] openSession confirmed ✓`)

  // Lưu state + bắt đầu giả lập thiết bị
  liveSessions.set(sessionId, { user, startTime: Date.now() })
  await startChargingSession(sessionId)

  return { sessionId, txHash }
}

// ── BƯỚC 2: Nhận readings từ simulator ───────────────────────────────────────
export function handleUsageReading(reading: UsageReading) {
  const session = liveSessions.get(reading.sessionId)
  if (!session) return
  session.lastReading = reading

  // Broadcast sang Frontend qua server-sent events (xem server.ts)
  broadcastToFrontend({ type: 'usage_update', data: reading })
}

// ── BƯỚC 3: Dừng và settle ───────────────────────────────────────────────────
export async function settleEVSession(sessionId: `0x${string}`): Promise<{
  finalKWh:   number
  finalUSD:   number
  settleTx:   `0x${string}`
}> {
  const session = liveSessions.get(sessionId)
  if (!session) throw new Error(`Session ${sessionId} không tồn tại`)

  console.log(`\n[AGENT] === Settle phiên EV ===`)

  // Dừng giả lập thiết bị
  const { finalKWh, finalUSD } = await stopChargingSession(sessionId)
  const amountUSD6 = BigInt(Math.round(finalUSD * 1e6))

  // Ghi attest usage lên chain trước khi settle
  const lastReading = session.lastReading
  if (lastReading) {
    const attestTx = await walletClient.writeContract({
      address:      CONTRACTS.USAGE_ATTESTATION,
      abi:          USAGE_ATTESTATION_ABI,
      functionName: 'attest',
      args: [
        sessionId,
        DEVICE_ID,
        amountUSD6,
        lastReading.signature as `0x${string}`,
      ],
    })
    await publicClient.waitForTransactionReceipt({ hash: attestTx })
    console.log(`[AGENT] attest confirmed ✓`)
  }

  // Deadline = 5 phút từ bây giờ
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300)

  // Gọi SettlementRouter.settle()
  const settleTx = await walletClient.writeContract({
    address:      CONTRACTS.SETTLEMENT_ROUTER,
    abi:          SETTLEMENT_ROUTER_ABI,
    functionName: 'settle',
    args: [{
      sessionId,
      user:           session.user,
      payToken:       CONTRACTS.USDC,
      merchant:       CONTRACTS.MERCHANT,
      amountUSD6,
      deadline,
      isRemittance:   false,
      isDeviceService: true,
    }],
  })

  console.log(`[AGENT] settle tx: ${settleTx}`)
  await publicClient.waitForTransactionReceipt({ hash: settleTx })
  console.log(`[AGENT] settle confirmed ✓`)
  console.log(`[AGENT] Thanh toán: ${finalKWh} kWh — $${finalUSD}`)

  liveSessions.delete(sessionId)

  return { finalKWh, finalUSD, settleTx }
}

// ── SSE broadcast (sẽ dùng trong server.ts) ───────────────────────────────────
type SSEClient = { res: { write: (s: string) => void } }
const sseClients: SSEClient[] = []

export function addSSEClient(client: SSEClient) { sseClients.push(client) }
export function removeSSEClient(client: SSEClient) {
  const i = sseClients.indexOf(client)
  if (i !== -1) sseClients.splice(i, 1)
}

function broadcastToFrontend(data: unknown) {
  const msg = `data: ${JSON.stringify(data)}\n\n`
  sseClients.forEach(c => { try { c.res.write(msg) } catch { /* skip dead clients */ } })
}

// ── WebSocket client lắng nghe simulator ─────────────────────────────────────
const WSS_PORT = parseInt(process.env.WSS_PORT || '8765')

function connectToSimulator() {
  const ws = new WebSocket(`ws://localhost:${WSS_PORT}`)

  ws.on('open',    ()    => console.log('[AGENT] Kết nối simulator OK'))
  ws.on('error',   (e)   => console.error('[AGENT] WS error:', e.message))
  ws.on('close',   ()    => {
    console.log('[AGENT] Simulator ngắt kết nối, thử lại sau 3s...')
    setTimeout(connectToSimulator, 3000)
  })
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      if (msg.type === 'usage_reading') handleUsageReading(msg.data as UsageReading)
    } catch { /* bỏ qua lỗi parse */ }
  })
}

connectToSimulator()
