/**
 * server.ts — HTTP REST server cho Agent Backend (Tầng 2)
 *
 * Endpoints:
 *   POST /session/start       { user: address } → { sessionId, txHash }
 *   POST /session/stop        { sessionId }     → { finalKWh, finalUSD, settleTx }
 *   GET  /session/:id/status  → { status, kWh, usd, ... }
 *   GET  /session/:id/stream  → SSE stream live readings
 *
 * Frontend gọi qua Vite proxy: /api/* → localhost:3001/*
 * Chạy: bun run agent:start
 */

import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { openEVSession, settleEVSession, addSSEClient, removeSSEClient } from './agent'

const app = new Hono()

// CORS — allow Vite dev server
app.use('*', cors({ origin: '*' }))

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (c) => c.json({ ok: true, service: 'fimoPAY-agent', ts: Date.now() }))

// ── Bắt đầu phiên sạc ────────────────────────────────────────────────────────
app.post('/session/start', async (c) => {
  try {
    const { user } = await c.req.json<{ user: `0x${string}` }>()
    if (!user || !user.startsWith('0x')) {
      return c.json({ error: 'user address bắt buộc' }, 400)
    }

    const result = await openEVSession(user)
    return c.json({ ok: true, ...result })
  } catch (err) {
    console.error('[SERVER] start error:', err)
    return c.json({ error: String(err) }, 500)
  }
})

// ── Dừng và settle phiên sạc ─────────────────────────────────────────────────
app.post('/session/stop', async (c) => {
  try {
    const { sessionId } = await c.req.json<{ sessionId: `0x${string}` }>()
    if (!sessionId) return c.json({ error: 'sessionId bắt buộc' }, 400)

    const result = await settleEVSession(sessionId)
    return c.json({ ok: true, ...result })
  } catch (err) {
    console.error('[SERVER] stop error:', err)
    return c.json({ error: String(err) }, 500)
  }
})

// ── SSE stream — live readings ────────────────────────────────────────────────
app.get('/session/:id/stream', (c) => {
  const { id } = c.req.param()
  console.log(`[SERVER] SSE client kết nối cho session ${id.slice(0, 10)}...`)

  const headers = {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',
  }

  return new Response(
    new ReadableStream({
      start(controller) {
        // Gửi ping ngay để browser biết stream đã mở
        controller.enqueue(new TextEncoder().encode('data: {"type":"connected"}\n\n'))

        const client = {
          res: {
            write: (s: string) => {
              try { controller.enqueue(new TextEncoder().encode(s)) }
              catch { /* stream đã đóng */ }
            }
          }
        }

        addSSEClient(client)

        // Cleanup khi client ngắt kết nối
        c.req.raw.signal.addEventListener('abort', () => {
          removeSSEClient(client)
          controller.close()
        })
      }
    }),
    { headers }
  )
})

// ── Khởi động server ─────────────────────────────────────────────────────────
const PORT = parseInt(process.env.AGENT_PORT || '3001')

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`\n[SERVER] fimoPAY Agent Backend chạy tại http://localhost:${PORT}`)
  console.log(`[SERVER] Endpoints:`)
  console.log(`[SERVER]   POST /session/start`)
  console.log(`[SERVER]   POST /session/stop`)
  console.log(`[SERVER]   GET  /session/:id/stream (SSE)`)
  console.log(`[SERVER]   GET  /health`)
})
