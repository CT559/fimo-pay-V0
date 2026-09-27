// fimoPAY — Deployed contracts on Arc Testnet (Chain ID 5042002)
// USDC: dùng contract USDC thật của Arc Testnet tại 0x3600000000000000000000000000000000000000
// (có sẵn trong sandbox Arc Studio, không cần mock)

import issuerRegistryArtifact   from '../contracts/out/IssuerRegistry.sol/IssuerRegistry.json'
import settlementRouterArtifact from '../contracts/out/SettlementRouterV1.sol/SettlementRouterV1.json'
import sessionEscrowArtifact    from '../contracts/out/SessionEscrow.sol/SessionEscrow.json'
import { erc20Abi }             from 'viem'

export const CHAIN_ID = 5042002

// ── Tokens thật trên Arc Testnet ─────────────────────────────────────────────
// Nguồn: https://docs.arc.io/arc/references/contract-addresses (September 2026)

export const ARC_USDC = {
  address: '0x3600000000000000000000000000000000000000' as `0x${string}`,
  abi: erc20Abi,
  decimals: 6,
  symbol: 'USDC',
  live: true,
}

// EURC — Euro stablecoin của Circle, LIVE trên Arc Testnet
export const ARC_EURC = {
  address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as `0x${string}`,
  abi: erc20Abi,
  decimals: 6,
  symbol: 'EURC',
  live: true,
}

// JPYC, KRW1, PHPC — Announced for Arc, chưa có địa chỉ contract (Sep 2026)
// Khi issuer deploy lên Arc, thay địa chỉ ở đây và đổi live: true
// Nguồn: https://builtonarc.app — "Announced, nothing observed on chain"
export const ARC_JPYC  = { address: null, symbol: 'JPYC',  decimals: 18, live: false, issuer: 'JPYC Inc.' }
export const ARC_KRW1  = { address: null, symbol: 'KRW1',  decimals: 0,  live: false, issuer: 'BDACS' }
export const ARC_PHPC  = { address: null, symbol: 'PHPC',  decimals: 6,  live: false, issuer: 'Coins.PH' }

// Bảng token nhận theo quốc gia đích trong luồng kiều hối
export const RECEIVER_TOKEN: Record<string, typeof ARC_USDC | typeof ARC_EURC | typeof ARC_JPYC> = {
  VN: ARC_USDC,  // Việt Nam — USDC (chưa có issuer nội địa)
  TH: ARC_USDC,  // Thái Lan — USDC
  TW: ARC_USDC,  // Đài Loan — USDC
  JP: ARC_JPYC,  // Nhật Bản — JPYC (sẽ dùng khi live)
  KR: ARC_KRW1,  // Hàn Quốc — KRW1 (sẽ dùng khi live)
  PH: ARC_PHPC,  // Philippines — PHPC (sẽ dùng khi live)
}

// ── Core contracts ────────────────────────────────────────────────────────────
export const SETTLEMENT_ROUTER = {
  // FimoProxy (ERC1967) wrapping SettlementRouterV1 — initialized, ready
  address: '0xd70b8c9a1b61f1c9ebb79803ae6a610add0be34a' as `0x${string}`,
  abi: settlementRouterArtifact.abi,
}

export const ISSUER_REGISTRY = {
  address: '0x211e8a18cfa0bdd7d3be6c09838b5e9930b9b985' as `0x${string}`,
  abi: issuerRegistryArtifact.abi,
}

export const SESSION_ESCROW = {
  address: '0x8b209ee7061481be3605a7c988fda70cf0548663' as `0x${string}`,
  abi: sessionEscrowArtifact.abi,
}

// ── Explorer ─────────────────────────────────────────────────────────────────
export const EXPLORER = 'https://explorer.testnet.arc.io'
export const buildTxUrl  = (hash: string)  => `${EXPLORER}/tx/${hash}`
export const buildAddrUrl = (addr: string) => `${EXPLORER}/address/${addr}`
