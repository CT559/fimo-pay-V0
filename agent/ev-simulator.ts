/**
 * ev-simulator.ts — Giả lập thiết bị trạm sạc EV (Tầng 1)
 *
 * Thực tế: thiết bị IoT đo kWh qua smart meter, ký EIP-712, gửi WebSocket
 * Demo:    giả lập bằng interval tăng kWh dần, log ra console
 *
 * Chạy: bun run agent:sim
 */

import { WebSocketServer, WebSocket } from 'ws'
import { privateKeyToAccount } from 'viem/accounts'
import { keccak256, encodeAbiParameters, parseAbiParameters } from 'viem'

// ── Cấu hình giả lập ────────────────────────────────────────────────────────
const DEVICE_PRIVATE_KEY = (process.env.DEVICE_PRIVATE_KEY ||
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') as `0x${string}`

const device = privateKeyToAccount(DEVICE_PRIVATE_KEY)

export const DEVICE_ID = keccak256(
  encodeAbiParameters(parseAbiParameters('address'), [device.address])
)

// kWh giá $0.20/kWh — hằng số demo
const RATE_USD_PER_KWH = 0.20

export type UsageReading = {
  sessionId:   `0x${string}`
  deviceId:    `0x${string}`
  kWh:         number          // tổng kWh đến thời điểm này
  totalUSD:    number          // USD tương ứng (6 decimals sẽ nhân *1e6 ở agent)
  timestamp:   number
  signature:   `0x${string}`
}

// ── WebSocket server (Tầng 1 → Tầng 2) ─────────────────────────────────────
const WSS_PORT = parseInt(process.env.WSS_PORT || '8765')
const wss      = new WebSocketServer({ port: WSS_PORT })
const clients  = new Set<WebSocket>()

wss.on('connection', (ws) => {
  clients.add(ws)
  console.log(`[SIM] Client kết nối. Tổng: ${clients.size}`)
  ws.on('close', () => { clients.delete(ws); console.log('[SIM] Client ngắt kết nối') })
})

// ── Phiên sạc giả lập ────────────────────────────────────────────────────────
let activeSessions: Map<string, {
  kWh: number
  startTime: number
  intervalId: ReturnType<typeof setInterval>
}> = new Map()

export async function startChargingSession(sessionId: `0x${string}`): Promise<void> {
  if (activeSessions.has(sessionId)) {
    console.log(`[SIM] Phiên ${sessionId.slice(0, 10)}... đã tồn tại`)
    return
  }

  let kWh = 0
  const startTime = Date.now()

  console.log(`\n[SIM] === Bắt đầu phiên sạc ===`)
  console.log(`[SIM] SessionId: ${sessionId.slice(0, 18)}...`)
  console.log(`[SIM] Thiết bị:  ${device.address}`)
  console.log(`[SIM] Rate:      $${RATE_USD_PER_KWH}/kWh`)

  const intervalId = setInterval(async () => {
    // Tăng kWh mỗi 3 giây (demo nhanh — thực tế mỗi phút)
    kWh += 0.1 + Math.random() * 0.05 // 0.1–0.15 kWh mỗi tick

    const totalUSD = parseFloat((kWh * RATE_USD_PER_KWH).toFixed(4))

    // Tạo payload để ký (EIP-712 simplified cho demo)
    const payload = keccak256(
      encodeAbiParameters(
        parseAbiParameters('bytes32, bytes32, uint256, uint256, uint256'),
        [
          sessionId,
          DEVICE_ID,
          BigInt(Math.round(kWh * 1000)),      // kWh * 1000 để tránh float
          BigInt(Math.round(totalUSD * 1e6)),   // USD6
          BigInt(Math.floor(Date.now() / 1000)) // timestamp
        ]
      )
    )

    const signature = await device.signMessage({ message: { raw: payload } })

    const reading: UsageReading = {
      sessionId,
      deviceId:  DEVICE_ID,
      kWh:       parseFloat(kWh.toFixed(3)),
      totalUSD,
      timestamp: Math.floor(Date.now() / 1000),
      signature,
    }

    // Broadcast tới tất cả agent clients
    const msg = JSON.stringify({ type: 'usage_reading', data: reading })
    clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg)
    })

    console.log(`[SIM] ⚡ ${reading.kWh.toFixed(3)} kWh — $${totalUSD.toFixed(4)} — ${new Date().toLocaleTimeString()}`)
  }, 3000)

  activeSessions.set(sessionId, { kWh, startTime, intervalId })
}

export async function stopChargingSession(sessionId: `0x${string}`): Promise<{
  finalKWh: number
  finalUSD: number
}> {
  const session = activeSessions.get(sessionId)
  if (!session) throw new Error(`Session ${sessionId} không tồn tại`)

  clearInterval(session.intervalId)
  activeSessions.delete(sessionId)

  const finalKWh = parseFloat(session.kWh.toFixed(3))
  const finalUSD = parseFloat((finalKWh * RATE_USD_PER_KWH).toFixed(4))

  console.log(`\n[SIM] === Kết thúc phiên sạc ===`)
  console.log(`[SIM] Tổng kWh:  ${finalKWh}`)
  console.log(`[SIM] Tổng tiền: $${finalUSD}`)

  return { finalKWh, finalUSD }
}

// ── Tự khởi động nếu chạy trực tiếp ────────────────────────────────────────
const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  console.log(`[SIM] WebSocket server chạy tại ws://localhost:${WSS_PORT}`)
  console.log(`[SIM] Đang chờ agent kết nối...`)
}
