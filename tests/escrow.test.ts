import { describe, it, expect } from 'vitest'
import { Cl } from '@stacks/transactions'


declare const simnet: any

// Helper to advance time (in seconds)
const advanceTime = (seconds: number) => {
  const blocksNeeded = Math.ceil(seconds / 600) // ~10min per block
  for (let i = 0; i < blocksNeeded; i++) {
    simnet.mineEmptyBlock()
  }
}

describe('STX Escrow Contract', () => {
  // ============================================
  // ESCROW CREATION TESTS
  // ============================================

  describe('Escrow Creation', () => {
    it('can create escrow and deposit STX successfully', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!
      const amount = 10_000_000 // 10 STX

      const { result, events } = simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(amount),
          Cl.stringAscii('Test escrow payment'),
          Cl.uint(3600), // 1 hour timelock
          Cl.none()
        ],
        deployer
      )

      expect(result).toBeOk(Cl.uint(1))

      // Verify STX transfer to contract
      const transferEvent = events.expectSTXTransferEvent(amount, deployer, `${deployer}.escrow`)
      expect(transferEvent).toBeDefined()
    })

    it('cannot create self-escrow (depositor = beneficiary)', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const amount = 10_000_000

      const { result } = simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(deployer), // Same as sender
          Cl.uint(amount),
          Cl.stringAscii('Self escrow'),
          Cl.uint(3600),
          Cl.none()
        ],
        deployer
      )

      expect(result).toBeErr(Cl.uint(109)) // ERR-SELF-ESCROW
    })

    it('cannot create with zero amount', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!

      const { result } = simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(0), // Zero amount
          Cl.stringAscii('Zero escrow'),
          Cl.uint(3600),
          Cl.none()
        ],
        deployer
      )

      expect(result).toBeErr(Cl.uint(107)) // ERR-INVALID-AMOUNT
    })

    it('can create with arbiter', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!
      const arbiter = accounts.get('wallet_2')!
      const amount = 5_000_000

      const { result } = simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(amount),
          Cl.stringAscii('Escrow with arbiter'),
          Cl.uint(7200),
          Cl.some(Cl.principal(arbiter))
        ],
        deployer
      )

      expect(result).toBeOk(Cl.uint(1))

      // Verify escrow data includes arbiter
      const escrowData = simnet.callReadOnlyFn('escrow', 'get-escrow', [Cl.uint(1)], deployer)

      const escrow = escrowData.result.expectSome().expectTuple()
      expect(escrow.depositor).toBe(deployer)
      expect(escrow.beneficiary).toBe(beneficiary)
      expect(escrow.amount).toStrictEqual(Cl.uint(amount))
    })
  })

  // ============================================
  // RELEASE TESTS
  // ============================================

  describe('Release Functions', () => {
    it('depositor can release full escrow to beneficiary', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!
      const amount = 10_000_000

      // Create escrow
      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(amount),
          Cl.stringAscii('Full release test'),
          Cl.uint(0), // No timelock
          Cl.none()
        ],
        deployer
      )

      // Release escrow
      const { result, events } = simnet.callPublicFn(
        'escrow',
        'release-escrow',
        [Cl.uint(1)],
        deployer
      )

      const fee = Math.floor((amount * 5) / 1000) // 0.5% fee
      const netAmount = amount - fee

      expect(result).toBeOk(Cl.bool(true))

      // Check transfers
      events.expectSTXTransferEvent(netAmount, `${deployer}.escrow`, beneficiary)
      events.expectSTXTransferEvent(fee, `${deployer}.escrow`, deployer) // Treasury = deployer
    })

    it('only depositor can release escrow', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!
      const attacker = accounts.get('wallet_2')!

      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(10_000_000),
          Cl.stringAscii('Unauthorized test'),
          Cl.uint(0),
          Cl.none()
        ],
        deployer
      )

      const { result } = simnet.callPublicFn('escrow', 'release-escrow', [Cl.uint(1)], attacker)

      expect(result).toBeErr(Cl.uint(102)) // ERR-UNAUTHORIZED
    })

    it('cannot release already released escrow', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!

      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(10_000_000),
          Cl.stringAscii('Double release test'),
          Cl.uint(0),
          Cl.none()
        ],
        deployer
      )

      // First release - should succeed
      simnet.callPublicFn('escrow', 'release-escrow', [Cl.uint(1)], deployer)

      // Second release - should fail
      const { result } = simnet.callPublicFn('escrow', 'release-escrow', [Cl.uint(1)], deployer)

      expect(result).toBeErr(Cl.uint(103)) // ERR-ALREADY-RELEASED
    })
  })

  // ============================================
  // PARTIAL RELEASE TESTS
  // ============================================

  describe('Partial Release', () => {
    it('can release partial amount', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!
      const totalAmount = 10_000_000
      const partialAmount = 5_000_000

      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(totalAmount),
          Cl.stringAscii('Partial release test'),
          Cl.uint(0),
          Cl.none()
        ],
        deployer
      )

      const { result, events } = simnet.callPublicFn(
        'escrow',
        'partial-release',
        [Cl.uint(1), Cl.uint(partialAmount)],
        deployer
      )

      const fee = Math.floor((partialAmount * 5) / 1000)
      const netAmount = partialAmount - fee

      expect(result).toBeOk(Cl.bool(true))

      events.expectSTXTransferEvent(netAmount, `${deployer}.escrow`, beneficiary)

      // Check remaining amount
      const remaining = simnet.callReadOnlyFn(
        'escrow',
        'get-remaining-amount',
        [Cl.uint(1)],
        deployer
      )

      expect(remaining.result).toStrictEqual(Cl.uint(totalAmount - partialAmount))
    })

    it('cannot release more than remaining', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!
      const totalAmount = 10_000_000

      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(totalAmount),
          Cl.stringAscii('Over-release test'),
          Cl.uint(0),
          Cl.none()
        ],
        deployer
      )

      const { result } = simnet.callPublicFn(
        'escrow',
        'partial-release',
        [Cl.uint(1), Cl.uint(totalAmount + 1_000_000)], // More than deposited
        deployer
      )

      expect(result).toBeErr(Cl.uint(106)) // ERR-INSUFFICIENT-FUNDS
    })

    it('multiple partial releases work correctly', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!
      const totalAmount = 12_000_000

      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(totalAmount),
          Cl.stringAscii('Multiple partial releases'),
          Cl.uint(0),
          Cl.none()
        ],
        deployer
      )

      // First partial release: 4 STX
      simnet.callPublicFn('escrow', 'partial-release', [Cl.uint(1), Cl.uint(4_000_000)], deployer)

      // Second partial release: 3 STX
      simnet.callPublicFn('escrow', 'partial-release', [Cl.uint(1), Cl.uint(3_000_000)], deployer)

      // Third partial release: 5 STX (completes the escrow)
      const { result } = simnet.callPublicFn(
        'escrow',
        'partial-release',
        [Cl.uint(1), Cl.uint(5_000_000)],
        deployer
      )

      expect(result).toBeOk(Cl.bool(true))

      // Verify remaining is 0
      const remaining = simnet.callReadOnlyFn(
        'escrow',
        'get-remaining-amount',
        [Cl.uint(1)],
        deployer
      )

      expect(remaining.result).toStrictEqual(Cl.uint(0))
    })
  })

  // ============================================
  // REFUND TESTS
  // ============================================

  describe('Refund Functions', () => {
    it('can refund after timelock expires', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!
      const amount = 10_000_000
      const timelockSeconds = 3600 // 1 hour

      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(amount),
          Cl.stringAscii('Refund test'),
          Cl.uint(timelockSeconds),
          Cl.none()
        ],
        deployer
      )

      // Advance time beyond timelock
      advanceTime(timelockSeconds + 600)

      const { result, events } = simnet.callPublicFn(
        'escrow',
        'refund-escrow',
        [Cl.uint(1)],
        deployer
      )

      expect(result).toBeOk(Cl.bool(true))

      // Full amount returned (no fee on refunds)
      events.expectSTXTransferEvent(amount, `${deployer}.escrow`, deployer)
    })

    it('cannot refund before timelock expires', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!

      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(10_000_000),
          Cl.stringAscii('Early refund test'),
          Cl.uint(7200), // 2 hours
          Cl.none()
        ],
        deployer
      )

      // Try to refund immediately
      const { result } = simnet.callPublicFn('escrow', 'refund-escrow', [Cl.uint(1)], deployer)

      expect(result).toBeErr(Cl.uint(108)) // ERR-TIMELOCK-ACTIVE
    })

    it('only depositor can refund', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!
      const attacker = accounts.get('wallet_2')!

      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(10_000_000),
          Cl.stringAscii('Unauthorized refund'),
          Cl.uint(3600),
          Cl.none()
        ],
        deployer
      )

      advanceTime(3600 + 600)

      const { result } = simnet.callPublicFn('escrow', 'refund-escrow', [Cl.uint(1)], attacker)

      expect(result).toBeErr(Cl.uint(102)) // ERR-UNAUTHORIZED
    })
  })

  // ============================================
  // DISPUTE TESTS
  // ============================================

  describe('Dispute Handling', () => {
    it('beneficiary can raise dispute', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!
      const arbiter = accounts.get('wallet_2')!

      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(10_000_000),
          Cl.stringAscii('Dispute test'),
          Cl.uint(0),
          Cl.some(Cl.principal(arbiter))
        ],
        deployer
      )

      const { result } = simnet.callPublicFn(
        'escrow',
        'raise-dispute',
        [Cl.uint(1), Cl.stringAscii('Item not as described')],
        beneficiary
      )

      expect(result).toBeOk(Cl.bool(true))
    })

    it('depositor can raise dispute', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!
      const arbiter = accounts.get('wallet_2')!

      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(10_000_000),
          Cl.stringAscii('Depositor dispute'),
          Cl.uint(0),
          Cl.some(Cl.principal(arbiter))
        ],
        deployer
      )

      const { result } = simnet.callPublicFn(
        'escrow',
        'raise-dispute',
        [Cl.uint(1), Cl.stringAscii('Service not provided')],
        deployer
      )

      expect(result).toBeOk(Cl.bool(true))
    })

    it('non-party cannot raise dispute', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!
      const arbiter = accounts.get('wallet_2')!
      const outsider = accounts.get('wallet_3')!

      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(10_000_000),
          Cl.stringAscii('Outsider dispute'),
          Cl.uint(0),
          Cl.some(Cl.principal(arbiter))
        ],
        deployer
      )

      const { result } = simnet.callPublicFn(
        'escrow',
        'raise-dispute',
        [Cl.uint(1), Cl.stringAscii('Random dispute')],
        outsider
      )

      expect(result).toBeErr(Cl.uint(102)) // ERR-UNAUTHORIZED
    })

    it('arbiter can resolve in favor of beneficiary', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!
      const arbiter = accounts.get('wallet_2')!
      const amount = 10_000_000

      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(amount),
          Cl.stringAscii('Resolve to buyer'),
          Cl.uint(0),
          Cl.some(Cl.principal(arbiter))
        ],
        deployer
      )

      // Raise dispute
      simnet.callPublicFn(
        'escrow',
        'raise-dispute',
        [Cl.uint(1), Cl.stringAscii('Defective item')],
        beneficiary
      )

      // Resolve in favor of beneficiary
      const { result, events } = simnet.callPublicFn(
        'escrow',
        'resolve-dispute',
        [
          Cl.uint(1),
          Cl.stringAscii('Buyer wins - item was defective'),
          Cl.bool(true) // release to beneficiary
        ],
        arbiter
      )

      const fee = Math.floor((amount * 5) / 1000)
      const netAmount = amount - fee

      expect(result).toBeOk(Cl.bool(true))

      events.expectSTXTransferEvent(netAmount, `${deployer}.escrow`, beneficiary)
      events.expectSTXTransferEvent(fee, `${deployer}.escrow`, deployer)
    })

    it('arbiter can resolve in favor of depositor', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!
      const arbiter = accounts.get('wallet_2')!
      const amount = 10_000_000

      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(amount),
          Cl.stringAscii('Resolve to seller'),
          Cl.uint(0),
          Cl.some(Cl.principal(arbiter))
        ],
        deployer
      )

      simnet.callPublicFn(
        'escrow',
        'raise-dispute',
        [Cl.uint(1), Cl.stringAscii('Fraudulent claim')],
        deployer
      )

      // Resolve in favor of depositor
      const { result, events } = simnet.callPublicFn(
        'escrow',
        'resolve-dispute',
        [
          Cl.uint(1),
          Cl.stringAscii('Seller wins - false claim'),
          Cl.bool(false) // release to depositor
        ],
        arbiter
      )

      const fee = Math.floor((amount * 5) / 1000)
      const netAmount = amount - fee

      expect(result).toBeOk(Cl.bool(true))

      events.expectSTXTransferEvent(netAmount, `${deployer}.escrow`, deployer)
    })

    it('only arbiter can resolve dispute', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!
      const arbiter = accounts.get('wallet_2')!
      const attacker = accounts.get('wallet_3')!

      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(10_000_000),
          Cl.stringAscii('Unauthorized resolution'),
          Cl.uint(0),
          Cl.some(Cl.principal(arbiter))
        ],
        deployer
      )

      simnet.callPublicFn(
        'escrow',
        'raise-dispute',
        [Cl.uint(1), Cl.stringAscii('Dispute')],
        beneficiary
      )

      const { result } = simnet.callPublicFn(
        'escrow',
        'resolve-dispute',
        [Cl.uint(1), Cl.stringAscii('Fake resolution'), Cl.bool(true)],
        attacker
      )

      expect(result).toBeErr(Cl.uint(102)) // ERR-UNAUTHORIZED
    })
  })

  // ============================================
  // READ-ONLY FUNCTION TESTS
  // ============================================

  describe('Read-Only Functions', () => {
    it('get-escrow returns correct data', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!
      const amount = 15_000_000
      const timelock = 7200

      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(amount),
          Cl.stringAscii('Read test'),
          Cl.uint(timelock),
          Cl.none()
        ],
        deployer
      )

      const result = simnet.callReadOnlyFn('escrow', 'get-escrow', [Cl.uint(1)], deployer)

      const escrow = result.result.expectSome().expectTuple()
      expect(escrow.depositor).toBe(deployer)
      expect(escrow.beneficiary).toBe(beneficiary)
      expect(escrow.amount).toStrictEqual(Cl.uint(amount))
      expect(escrow['released-amount']).toStrictEqual(Cl.uint(0))
      expect(escrow.status).toBe(Cl.stringAscii('active'))
    })

    it('get-escrow-count returns correct count', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!

      // Create 3 escrows
      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(1_000_000),
          Cl.stringAscii('Escrow 1'),
          Cl.uint(0),
          Cl.none()
        ],
        deployer
      )

      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(2_000_000),
          Cl.stringAscii('Escrow 2'),
          Cl.uint(0),
          Cl.none()
        ],
        deployer
      )

      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(3_000_000),
          Cl.stringAscii('Escrow 3'),
          Cl.uint(0),
          Cl.none()
        ],
        deployer
      )

      const count = simnet.callReadOnlyFn('escrow', 'get-escrow-count', [], deployer)

      expect(count.result).toStrictEqual(Cl.uint(3))
    })

    it('can-refund returns correct status', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!

      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(10_000_000),
          Cl.stringAscii('Refund check'),
          Cl.uint(3600),
          Cl.none()
        ],
        deployer
      )

      // Before timelock expires
      let canRefund = simnet.callReadOnlyFn('escrow', 'can-refund', [Cl.uint(1)], deployer)
      expect(canRefund.result).toStrictEqual(Cl.bool(false))

      // After timelock expires
      advanceTime(3600 + 600)

      canRefund = simnet.callReadOnlyFn('escrow', 'can-refund', [Cl.uint(1)], deployer)
      expect(canRefund.result).toStrictEqual(Cl.bool(true))
    })

    it('get-remaining-amount returns correct value', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!
      const totalAmount = 20_000_000

      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(totalAmount),
          Cl.stringAscii('Remaining test'),
          Cl.uint(0),
          Cl.none()
        ],
        deployer
      )

      // Initially full amount
      let remaining = simnet.callReadOnlyFn(
        'escrow',
        'get-remaining-amount',
        [Cl.uint(1)],
        deployer
      )
      expect(remaining.result).toStrictEqual(Cl.uint(totalAmount))

      // After partial release
      simnet.callPublicFn('escrow', 'partial-release', [Cl.uint(1), Cl.uint(8_000_000)], deployer)

      remaining = simnet.callReadOnlyFn('escrow', 'get-remaining-amount', [Cl.uint(1)], deployer)
      expect(remaining.result).toStrictEqual(Cl.uint(12_000_000))
    })

    it('get-total-stats returns correct statistics', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!

      // Create and complete 2 escrows
      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(5_000_000),
          Cl.stringAscii('Stats 1'),
          Cl.uint(0),
          Cl.none()
        ],
        deployer
      )

      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(7_000_000),
          Cl.stringAscii('Stats 2'),
          Cl.uint(0),
          Cl.none()
        ],
        deployer
      )

      // Complete first escrow
      simnet.callPublicFn('escrow', 'release-escrow', [Cl.uint(1)], deployer)

      const stats = simnet.callReadOnlyFn('escrow', 'get-total-stats', [], deployer)

      const result = stats.result.expectTuple()
      expect(result['total-escrows']).toStrictEqual(Cl.uint(2))
      expect(result['total-volume']).toStrictEqual(Cl.uint(12_000_000))
      expect(result['total-completed']).toStrictEqual(Cl.uint(1))
    })
  })

  // ============================================
  // EDGE CASE TESTS
  // ============================================

  describe('Edge Cases', () => {
    it('cannot operate on non-existent escrow', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!

      const { result } = simnet.callPublicFn('escrow', 'release-escrow', [Cl.uint(999)], deployer)

      expect(result).toBeErr(Cl.uint(101)) // ERR-ESCROW-NOT-FOUND
    })

    it('platform fee calculation is correct', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!
      const amount = 10_050_000 // Chosen to test fee rounding

      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(amount),
          Cl.stringAscii('Fee test'),
          Cl.uint(0),
          Cl.none()
        ],
        deployer
      )

      const { events } = simnet.callPublicFn('escrow', 'release-escrow', [Cl.uint(1)], deployer)

      const expectedFee = Math.floor((amount * 5) / 1000) // 50,250
      const expectedNet = amount - expectedFee

      events.expectSTXTransferEvent(expectedNet, `${deployer}.escrow`, beneficiary)
      events.expectSTXTransferEvent(expectedFee, `${deployer}.escrow`, deployer)
    })

    it('complete escrow workflow with all features', () => {
      const accounts = simnet.getAccounts()
      const deployer = accounts.get('deployer')!
      const beneficiary = accounts.get('wallet_1')!
      const arbiter = accounts.get('wallet_2')!
      const amount = 20_000_000

      // 1. Create escrow with arbiter
      simnet.callPublicFn(
        'escrow',
        'create-escrow',
        [
          Cl.principal(beneficiary),
          Cl.uint(amount),
          Cl.stringAscii('Full workflow test'),
          Cl.uint(3600),
          Cl.some(Cl.principal(arbiter))
        ],
        deployer
      )

      // 2. Partial release
      simnet.callPublicFn('escrow', 'partial-release', [Cl.uint(1), Cl.uint(8_000_000)], deployer)

      // 3. Raise dispute
      simnet.callPublicFn(
        'escrow',
        'raise-dispute',
        [Cl.uint(1), Cl.stringAscii('Quality issues')],
        beneficiary
      )

      // 4. Resolve dispute
      const { result } = simnet.callPublicFn(
        'escrow',
        'resolve-dispute',
        [Cl.uint(1), Cl.stringAscii('Partial refund agreed'), Cl.bool(true)],
        arbiter
      )

      // Verify final resolution
      expect(result).toBeOk(Cl.bool(true))

      const escrowData = simnet.callReadOnlyFn('escrow', 'get-escrow', [Cl.uint(1)], deployer)

      const escrow = escrowData.result.expectSome().expectTuple()
      expect(escrow.status).toBe(Cl.stringAscii('resolved'))
    })
  })
})
