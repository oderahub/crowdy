'use client'

import { UniversalConnector } from '@reown/appkit-universal-connector'

// Project configuration
export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || 'YOUR_PROJECT_ID'

// Define Stacks mainnet configuration
export const stacksMainnet = {
  id: 1,
  chainNamespace: 'stacks',
  caipNetworkId: 'stacks:1',
  name: 'Stacks',
  nativeCurrency: {
    name: 'STX',
    symbol: 'STX',
    decimals: 6
  },
  rpcUrls: {
    default: {
      http: ['https://stacks-node-api.mainnet.stacks.co']
    }
  },
  blockExplorers: {
    default: {
      name: 'Stacks Explorer',
      url: 'https://explorer.hiro.so'
    }
  }
}

// Define Stacks testnet configuration
export const stacksTestnet = {
  id: 2147483648,
  chainNamespace: 'stacks',
  caipNetworkId: 'stacks:2147483648',
  name: 'Stacks Testnet',
  nativeCurrency: {
    name: 'STX',
    symbol: 'STX',
    decimals: 6
  },
  rpcUrls: {
    default: {
      http: ['https://stacks-node-api.testnet.stacks.co']
    }
  },
  blockExplorers: {
    default: {
      name: 'Stacks Explorer Testnet',
      url: 'https://explorer.hiro.so/?chain=testnet'
    }
  }
}

// Metadata
const metadata = {
  name: 'STX Escrow',
  description: 'Trustless peer-to-peer escrow service on Stacks',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://stx-escrow.app',
  icons: ['https://avatars.githubusercontent.com/u/45615063']
}

// Universal Connector instance
let universalConnector: any = null

// Initialize UniversalConnector
export async function getUniversalConnector() {
  if (!universalConnector) {
    try {
      universalConnector = await UniversalConnector.init({
        projectId,
        metadata,
        networks: [
          {
            methods: ['stx_signMessage', 'stx_callContract', 'stx_signTransaction'],
            chains: [stacksMainnet, stacksTestnet],
            events: ['stx_chainChanged', 'stx_accountsChanged'],
            namespace: 'stacks'
          }
        ]
      })
      console.log('✅ Reown UniversalConnector initialized for Stacks Builder Challenge')
    } catch (error) {
      console.error('❌ Failed to initialize UniversalConnector:', error)
    }
  }
  return universalConnector
}

// Open AppKit modal
export async function openAppKit() {
  const connector = await getUniversalConnector()
  if (connector && connector.appKit) {
    connector.appKit.open()
  } else {
    console.error('AppKit not available')
  }
}

// Export chain configs
export const networks = [stacksMainnet, stacksTestnet]
