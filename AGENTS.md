# fimoPAY — Project Memory

## Deployed Contracts (Arc Testnet — Chain ID 5042002)

| Contract | Address | Explorer |
|----------|---------|---------|
| IssuerRegistry | `0x211e8a18cfa0bdd7d3be6c09838b5e9930b9b985` | [view](https://explorer.testnet.arc.io/address/0x211e8a18cfa0bdd7d3be6c09838b5e9930b9b985) |
| ComplianceGateway | `0xe72a17930539045989e5a0c10736b47ce1bb0e5d` | [view](https://explorer.testnet.arc.io/address/0xe72a17930539045989e5a0c10736b47ce1bb0e5d) |
| SessionEscrow | `0x8b209ee7061481be3605a7c988fda70cf0548663` | [view](https://explorer.testnet.arc.io/address/0x8b209ee7061481be3605a7c988fda70cf0548663) |
| DeviceRegistry | `0x1f1c901536c81a5871a27bb381be0d34487ee5f4` | [view](https://explorer.testnet.arc.io/address/0x1f1c901536c81a5871a27bb381be0d34487ee5f4) |
| UsageAttestation | `0xdfeb8e0b0ad692d7698b84da8a0eb6e8703d3a3e` | [view](https://explorer.testnet.arc.io/address/0xdfeb8e0b0ad692d7698b84da8a0eb6e8703d3a3e) |
| SettlementRouterV1 (impl) | `0xcc8c78eb2f33b71c11a7ee0d05b3eeb53b1bcb0a` | [view](https://explorer.testnet.arc.io/address/0xcc8c78eb2f33b71c11a7ee0d05b3eeb53b1bcb0a) |
| MockUSDC (testnet) | `0xd1f2ab829a2fd0e024ad18f9f8eaef1facdefc7c` | [view](https://explorer.testnet.arc.io/address/0xd1f2ab829a2fd0e024ad18f9f8eaef1facdefc7c) |

**Deployer wallet:** `0x5B12Ce46C7194aD57d143bC22847224047b1Ef42` (Circle platform wallet)
**Deployed:** 2026-09-21

## Next Steps
- Wire ERC1967Proxy around SettlementRouterV1 impl + call `initialize()`
- Add `addIssuer()` calls to IssuerRegistry (MockUSDC, MockJPYC, MockKRW1, MockPHPC)
- Integrate real USDC via Circle CCTP/Bridge Kit
- Replace MockFXEngine with StableFX adapter when API access granted

## Contract Source
All Solidity in `contracts/` — Solidity 0.8.24, OZ 5.1.0, evm_version: paris
