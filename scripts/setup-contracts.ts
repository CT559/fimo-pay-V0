/**
 * setup-contracts.ts
 * One-time setup: transfer ownership + addIssuer USDC
 * Run: bun run scripts/setup-contracts.ts
 */
import { createWalletClient, createPublicClient, http, encodeFunctionData, defineChain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
})

// Deployer PK — set via env
const pk = (process.env.DEPLOYER_PK ?? '') as `0x${string}`
if (!pk) { console.error('Set DEPLOYER_PK env var'); process.exit(1) }

const account = privateKeyToAccount(pk)
const transport = http('https://rpc.testnet.arc.io')
const publicClient = createPublicClient({ chain: arcTestnet, transport })
const walletClient = createWalletClient({ chain: arcTestnet, transport, account })

// Addresses
const PROXY            = '0xd70b8c9a1b61f1c9ebb79803ae6a610add0be34a'
const SESSION_ESCROW   = '0x8b209ee7061481be3605a7c988fda70cf0548663'
const COMPLIANCE_GW    = '0xe72a17930539045989e5a0c10736b47ce1bb0e5d'
const USAGE_ATTEST     = '0xdfeb8e0b0ad692d7698b84da8a0eb6e8703d3a3e'
const ISSUER_REGISTRY  = '0x211e8a18cfa0bdd7d3be6c09838b5e9930b9b985'
const USDC_ADDRESS     = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359' // Arc Testnet USDC
// Mock FX oracle needed so fxOracle.getUSDPrice returns 1:1 for USDC
const MOCK_FX_ORACLE   = '0xa5fd9fe71e48501f01c28c04b96da7b91eb3e8f6'

const TRANSFER_OWNERSHIP_ABI = [{
  name: 'transferOwnership', type: 'function',
  inputs: [{ name: 'newOwner', type: 'address' }], outputs: []
}] as const

const ADD_ISSUER_ABI = [{
  name: 'addIssuer', type: 'function',
  inputs: [
    { name: 'token', type: 'address' },
    { name: 'symbol', type: 'string' },
    { name: 'countryCode', type: 'string' },
    { name: 'priceFeed', type: 'address' },
  ], outputs: []
}] as const

async function send(to: `0x${string}`, data: `0x${string}`, label: string) {
  console.log(`→ ${label}`)
  const hash = await walletClient.sendTransaction({ chain: arcTestnet, to, data, gas: 100_000n })
  await publicClient.waitForTransactionReceipt({ hash })
  console.log(`  ✓ ${hash}`)
}

async function main() {
  console.log('Setting up FIMO contracts on Arc Testnet...\n')

  // 1. Transfer ownership of SessionEscrow → proxy
  await send(SESSION_ESCROW,
    encodeFunctionData({ abi: TRANSFER_OWNERSHIP_ABI, functionName: 'transferOwnership', args: [PROXY] }),
    'SessionEscrow.transferOwnership(proxy)')

  // 2. Transfer ownership of ComplianceGateway → proxy
  await send(COMPLIANCE_GW,
    encodeFunctionData({ abi: TRANSFER_OWNERSHIP_ABI, functionName: 'transferOwnership', args: [PROXY] }),
    'ComplianceGateway.transferOwnership(proxy)')

  // 3. Transfer ownership of UsageAttestation → proxy
  await send(USAGE_ATTEST,
    encodeFunctionData({ abi: TRANSFER_OWNERSHIP_ABI, functionName: 'transferOwnership', args: [PROXY] }),
    'UsageAttestation.transferOwnership(proxy)')

  // 4. Add USDC as supported issuer in IssuerRegistry
  await send(ISSUER_REGISTRY,
    encodeFunctionData({ abi: ADD_ISSUER_ABI, functionName: 'addIssuer',
      args: [USDC_ADDRESS, 'USDC', 'GLOBAL', MOCK_FX_ORACLE] }),
    'IssuerRegistry.addIssuer(USDC)')

  console.log('\n✅ Setup complete. SettlementRouter proxy can now openSession + settle.')
}

main().catch(e => { console.error(e); process.exit(1) })
