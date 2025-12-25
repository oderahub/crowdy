# STX Escrow

Trustless P2P escrow service built with **Clarity 4** (Epoch 3.3) and **Next.js 15.1.0**.

**Powered by [Reown AppKit](https://reown.com/appkit)** for seamless wallet connectivity on Stacks blockchain.

## Features

- ✅ **Reown AppKit integration** - Modern, user-friendly wallet connection experience
- ✅ **@stacks/connect** - Full Stacks blockchain integration via AppKit UniversalConnector
- ✅ Create escrows with time-based timelocks (uses `stacks-block-time`)
- ✅ Full or partial release
- ✅ Time-locked refunds
- ✅ Dispute resolution with arbiter
- ✅ 0.5% platform fee

## Wallet Integration with Reown AppKit

This project uses **[Reown AppKit](https://reown.com/appkit)** (formerly WalletConnect AppKit) to provide a best-in-class wallet connection experience:

- **UniversalConnector** - Seamless integration with Stacks wallets
- **Multi-wallet support** - Connect with Leather, Xverse, Hiro Wallet, and more
- **Beautiful UI** - Pre-built, customizable wallet selection modal
- **WalletConnect protocol** - Industry-standard secure connection protocol

### AppKit Implementation

The AppKit is initialized in `lib/appkit.ts` and provides:
```typescript
import { UniversalConnector } from '@reown/appkit-universal-connector'
import { connect } from '@stacks/connect'
```

See `components/AppKitProvider.tsx` and `lib/appkit.ts` for implementation details.

## Clarity 4 Features Used

- `stacks-block-time` - Real Unix timestamps for timelocks
- `to-ascii` - Convert principals to strings for logging

## Quick Start

### 1. Test Contract

```bash
clarinet check
clarinet console
```

### 2. Deploy Contract

```bash
clarinet deployments generate --mainnet
clarinet deployments apply -p mainnet
```

### 3. Configure AppKit & Contract

Create `frontend/.env.local`:
```bash
# Your Reown AppKit Project ID (get from https://cloud.reown.com)
NEXT_PUBLIC_REOWN_PROJECT_ID=your_project_id_here

# Your deployed contract details
NEXT_PUBLIC_CONTRACT_ADDRESS=SP_YOUR_DEPLOYED_ADDRESS
NEXT_PUBLIC_CONTRACT_NAME=escrow
```

**Note:** Get your free Reown Project ID at [cloud.reown.com](https://cloud.reown.com)

### 4. Run Frontend

```bash
cd frontend
npm install
npm run dev
```

### 5. Deploy to Vercel

```bash
cd frontend
vercel --prod
```

## Contract Functions

| Function | Description |
|----------|-------------|
| `create-escrow` | Create escrow with timelock in seconds |
| `release-escrow` | Release all funds to beneficiary |
| `partial-release` | Release partial amount |
| `refund-escrow` | Refund after timelock expires |
| `raise-dispute` | Raise a dispute |
| `resolve-dispute` | Arbiter resolves dispute |

## Fee Structure

- **Platform Fee:** 0.5% on release

## Tech Stack

### Blockchain & Wallet
- **Reown AppKit 1.8.15** - Wallet connection & UX
- **@reown/appkit-universal-connector** - Stacks blockchain connector
- **@stacks/connect 8.2.1** - Stacks wallet integration
- **@stacks/transactions 6.17.0** - Transaction building
- **@stacks/network 6.17.0** - Network configuration
- **Clarity 4** (Epoch 3.3) - Smart contract language

### Frontend
- **Next.js 15.1.0** - React framework
- **React 19.0.0** - UI library
- **TailwindCSS 3.4.17** - Styling
- **Lucide React** - Icons

### Polyfills (for crypto libraries)
- buffer, crypto-browserify, stream-browserify, process

## License

MIT
