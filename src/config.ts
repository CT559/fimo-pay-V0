/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet, baseSepolia, sepolia, arbitrumSepolia } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [arcTestnet, mainnet, baseSepolia, sepolia, arbitrumSepolia],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]:      http(),
    [mainnet.id]:         http(), // ENS resolution
    [baseSepolia.id]:     http(),
    [sepolia.id]:         http(),
    [arbitrumSepolia.id]: http(),
  },
})

// Export chain IDs for BridgeScreen
export { baseSepolia, sepolia, arbitrumSepolia, arcTestnet }
