/**
 * StableFX Adapter — fimoPAY
 *
 * Thay thế MockFXEngine khi Circle cấp StableFX API key.
 * Interface: IFXConverter (đã có sẵn trong SettlementRouterV1)
 *
 * Flow:
 *  1. agentGetBestQuote(merchant, amount) → gọi StableFX RFQ
 *  2. Chọn quote tốt nhất (rate cao nhất, fee thấp nhất)
 *  3. SettlementRouter.batchSettle() truyền quoteId vào
 *  4. StableFX smart contract thực hiện convert + settle atomically
 *
 * Trạng thái: SKELETON — chờ StableFX API key từ Circle design partner program
 * Apply: https://www.circle.com/stablefx (nút "Become a design partner")
 */

export interface StableFXQuote {
  quoteId: string
  inputToken: string      // USDC
  outputToken: string     // JPYC | KRW1 | PHPC | EURC
  inputAmount: string     // 6 decimals
  outputAmount: string    // token-specific decimals
  rate: string            // outputAmount / inputAmount
  expiry: number          // unix timestamp
  liquidityProvider: string
  slippageBPS: number
}

export interface StableFXConfig {
  apiKey: string          // từ Circle Console — server-side only
  baseUrl: string         // https://api.stablefx.circle.com (TBD khi live)
  chainId: number         // Arc Testnet = 5042002 | Arc Mainnet = 60808
}

// Token addresses trên Arc
const TOKEN_MAP: Record<string, string> = {
  USDC:  '0x3600000000000000000000000000000000000000',
  EURC:  '0x89B5b7ae9c8ef1bdcf4e6b2e88af9ce9c04d72a',
  // Chờ issuer deploy:
  JPYC:  '', // announced — chờ JPYC Inc
  KRW1:  '', // announced — chờ BDACS
  PHPC:  '', // announced — chờ Coins.PH
}

/**
 * agentGetBestQuote — gọi StableFX RFQ và chọn quote tốt nhất
 *
 * HIỆN TẠI: trả mock quote vì chưa có API key
 * SAU NÀY: uncomment đoạn fetch bên dưới và truyền vào STABLEFX_API_KEY
 */
export async function agentGetBestQuote(
  inputToken: string,
  outputToken: string,
  inputAmountUSD: number,
  _config?: Partial<StableFXConfig>
): Promise<StableFXQuote> {

  // ── MOCK (dùng cho testnet / demo) ──────────────────────────────────────
  const mockRates: Record<string, number> = {
    JPYC: 155.2,
    KRW1: 1340.5,
    PHPC: 58.1,
    EURC: 0.92,
    USDC: 1.0,
  }
  const rate = mockRates[outputToken] ?? 1.0
  const outputAmount = (inputAmountUSD * rate).toFixed(2)

  return {
    quoteId: `mock-${Date.now()}`,
    inputToken,
    outputToken,
    inputAmount: (inputAmountUSD * 1_000_000).toFixed(0), // 6 dec USDC
    outputAmount,
    rate: rate.toFixed(6),
    expiry: Math.floor(Date.now() / 1000) + 30,
    liquidityProvider: 'Mock (StableFX pending)',
    slippageBPS: 50,
  }

  // ── LIVE StableFX (uncomment khi có API key) ─────────────────────────────
  // const cfg = {
  //   apiKey:  process.env.STABLEFX_API_KEY ?? '',
  //   baseUrl: 'https://api.stablefx.circle.com',
  //   chainId: 5042002,
  //   ..._config,
  // }
  // const res = await fetch(`${cfg.baseUrl}/v1/rfq`, {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     'Authorization': `Bearer ${cfg.apiKey}`,
  //   },
  //   body: JSON.stringify({
  //     inputToken:   TOKEN_MAP[inputToken]  ?? inputToken,
  //     outputToken:  TOKEN_MAP[outputToken] ?? outputToken,
  //     inputAmount:  (inputAmountUSD * 1_000_000).toFixed(0),
  //     chainId:      cfg.chainId,
  //   }),
  // })
  // if (!res.ok) throw new Error(`StableFX RFQ failed: ${res.status}`)
  // const quotes: StableFXQuote[] = await res.json()
  // // Chọn quote có outputAmount cao nhất (tỷ giá tốt nhất cho user)
  // return quotes.sort((a, b) =>
  //   parseFloat(b.outputAmount) - parseFloat(a.outputAmount)
  // )[0]
}

export { TOKEN_MAP }
