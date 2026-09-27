# fimoPAY — Agent Marketplace Listing

## Service Name
fimoPAY Machine Commerce API

## Description
Instant USDC payment settlement for IoT devices and automated services across 6 countries.
Devices self-measure usage, compute billing, and request settlement — all programmatically.

## Endpoints

| Method | Path | Description | Price |
|--------|------|-------------|-------|
| POST | `/api/session/start` | Open a payment session for a device | $0.001 USDC |
| POST | `/api/session/settle` | Settle a session with usage data | $0.002 USDC |
| GET  | `/api/quote`         | Get best FX quote (USDC → local token) | $0.0005 USDC |

## Supported Services
- EV Charging stations
- Smart parking
- Vending machines
- Retail self-checkout
- Remittance (cross-border USDC)

## Supported Countries & Tokens
| Country | Receive Token |
|---------|--------------|
| Vietnam | USDC |
| Philippines | PHPC (Coins.PH) |
| South Korea | KRW1 (BDACS) |
| Japan | JPYC (JPYC Inc) |
| Thailand | USDC |
| Taiwan | USDC |

## Payment
- Network: Arc Testnet (Chain ID 5042002) / Arc Mainnet
- Token: USDC
- Method: Circle Gateway Nanopayments (x402)
- Batching: @circle-fin/x402-batching

## Integration
```typescript
import { createGatewayMiddleware } from '@circle-fin/x402-batching/server'

const gateway = createGatewayMiddleware({
  sellerAddress: '0xFIMOPAY_WALLET',
})

app.post('/api/session/settle',
  gateway.require('$0.002'),
  settleHandler
)
```

## Status
- Testnet: Live (Arc Testnet)
- Mainnet: Q1 2027 (pending StableFX + PHPC/KRW1/JPYC issuer launch)
- Agent Marketplace: Ready to list when `agents.circle.com/services/network/arc` opens submissions
