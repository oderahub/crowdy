'use client'

import { useEffect } from 'react'

export function AppKitProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialize UniversalConnector on client side
    import('@/lib/appkit').then(({ getUniversalConnector }) => {
      getUniversalConnector().then(() => {
        console.log('🎯 Reown AppKit ready for Stacks Builder Challenge')
      })
    })
  }, [])

  return <>{children}</>
}
