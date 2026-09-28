// fimoPAY — Deployed contracts on Arc Testnet (Chain ID 5042002)
// ABI inlined — không import từ contracts/out/ để build trên Vercel/CI không cần forge build

import { erc20Abi } from 'viem'

export const CHAIN_ID = 5042002

// ── Tokens thật trên Arc Testnet ──────────────────────────────────────────────
export const ARC_USDC = {
  address: '0x3600000000000000000000000000000000000000' as `0x${string}`,
  abi: erc20Abi,
  decimals: 6,
  symbol: 'USDC',
  live: true,
}

export const ARC_EURC = {
  address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as `0x${string}`,
  abi: erc20Abi,
  decimals: 6,
  symbol: 'EURC',
  live: true,
}

// JPYC, KRW1, PHPC — Announced for Arc, no contract address yet (Sep 2026)
export const ARC_JPYC  = { address: null, symbol: 'JPYC',  decimals: 18, live: false, issuer: 'JPYC Inc.' }
export const ARC_KRW1  = { address: null, symbol: 'KRW1',  decimals: 0,  live: false, issuer: 'BDACS' }
export const ARC_PHPC  = { address: null, symbol: 'PHPC',  decimals: 6,  live: false, issuer: 'Coins.PH' }

// Token nhận theo quốc gia đích
export const RECEIVER_TOKEN: Record<string, typeof ARC_USDC | typeof ARC_EURC | typeof ARC_JPYC> = {
  VN: ARC_USDC,
  TH: ARC_USDC,
  TW: ARC_USDC,
  JP: ARC_JPYC,
  KR: ARC_KRW1,
  PH: ARC_PHPC,
}

// ── ABIs (inlined — không phụ thuộc forge build) ─────────────────────────────

export const ISSUER_REGISTRY_ABI = [
  { type: 'function', name: 'addIssuer',    inputs: [{ name: 'token', type: 'address' }, { name: 'symbol', type: 'string' }, { name: 'countryCode', type: 'string' }, { name: 'priceFeed', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'isRegistered', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'getIssuer',    inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: 'symbol', type: 'string' }, { name: 'countryCode', type: 'string' }, { name: 'priceFeed', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'owner',        inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'renounceOwnership', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'transferOwnership', inputs: [{ name: 'newOwner', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'event',   name: 'IssuerAdded',  inputs: [{ name: 'token', type: 'address', indexed: true }, { name: 'symbol', type: 'string', indexed: false }, { name: 'countryCode', type: 'string', indexed: false }] },
] as const

export const SESSION_ESCROW_ABI = [
  { type: 'function', name: 'openSession',   inputs: [{ name: 'sessionId', type: 'bytes32' }, { name: 'payer', type: 'address' }, { name: 'token', type: 'address' }, { name: 'maxAmount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'settleSession', inputs: [{ name: 'sessionId', type: 'bytes32' }, { name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'cancelSession', inputs: [{ name: 'sessionId', type: 'bytes32' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'getSession',    inputs: [{ name: 'sessionId', type: 'bytes32' }], outputs: [{ name: 'payer', type: 'address' }, { name: 'token', type: 'address' }, { name: 'maxAmount', type: 'uint256' }, { name: 'status', type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'owner',         inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'event',   name: 'SessionOpened', inputs: [{ name: 'sessionId', type: 'bytes32', indexed: true }, { name: 'payer', type: 'address', indexed: true }] },
  { type: 'event',   name: 'SessionSettled',inputs: [{ name: 'sessionId', type: 'bytes32', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }] },
] as const

export const SETTLEMENT_ROUTER_ABI = [
  { type: 'function', name: 'initialize', inputs: [{ name: 'initialOwner', type: 'address' }, { name: '_issuerRegistry', type: 'address' }, { name: '_complianceGateway', type: 'address' }, { name: '_sessionEscrow', type: 'address' }, { name: '_usageAttestation', type: 'address' }, { name: '_fxConverter', type: 'address' }, { name: '_fxOracle', type: 'address' }, { name: '_maxSlippageBPS', type: 'uint16' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'batchSettle', inputs: [{ name: 'items', type: 'tuple[]', components: [{ name: 'sessionId', type: 'bytes32' }, { name: 'payer', type: 'address' }, { name: 'payToken', type: 'address' }, { name: 'payAmount', type: 'uint256' }, { name: 'receiveToken', type: 'address' }, { name: 'minReceiveAmount', type: 'uint256' }, { name: 'serviceType', type: 'uint8' }, { name: 'nonce', type: 'uint256' }] }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'paused',  inputs: [], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'pause',   inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'unpause', inputs: [], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'owner',   inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'issuerRegistry', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'upgradeToAndCall', inputs: [{ name: 'newImplementation', type: 'address' }, { name: 'data', type: 'bytes' }], outputs: [], stateMutability: 'payable' },
  { type: 'event',   name: 'BatchSettled', inputs: [{ name: 'count', type: 'uint256', indexed: false }] },
] as const

// ── Core contracts ────────────────────────────────────────────────────────────
export const SETTLEMENT_ROUTER = {
  address: '0xd70b8c9a1b61f1c9ebb79803ae6a610add0be34a' as `0x${string}`,
  abi: SETTLEMENT_ROUTER_ABI,
}

export const ISSUER_REGISTRY = {
  address: '0x211e8a18cfa0bdd7d3be6c09838b5e9930b9b985' as `0x${string}`,
  abi: ISSUER_REGISTRY_ABI,
}

export const SESSION_ESCROW = {
  address: '0x8b209ee7061481be3605a7c988fda70cf0548663' as `0x${string}`,
  abi: SESSION_ESCROW_ABI,
}

// ── Explorer ──────────────────────────────────────────────────────────────────
export const EXPLORER  = 'https://explorer.testnet.arc.io'
export const buildTxUrl   = (hash: string) => `${EXPLORER}/tx/${hash}`
export const buildAddrUrl = (addr: string) => `${EXPLORER}/address/${addr}`
