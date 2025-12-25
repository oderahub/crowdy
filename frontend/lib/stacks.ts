'use client';

// Import polyfills before anything else
import '../lib/polyfills';

import { connect, request, isConnected } from '@stacks/connect';
import { StacksMainnet } from '@stacks/network';
import {
  cvToJSON,
  callReadOnlyFunction,
  ClarityValue,
  uintCV,
  stringAsciiCV,
  principalCV,
  noneCV,
  someCV,
  serializeCV,
} from '@stacks/transactions';

// ============================================
// CONFIGURATION
// ============================================

export const NETWORK = new StacksMainnet();
export const NETWORK_NAME: 'mainnet' | 'testnet' = 'mainnet';

export const CONTRACT = {
  address: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || 'SP_YOUR_ADDRESS',
  name: process.env.NEXT_PUBLIC_CONTRACT_NAME || 'escrow',
};

// ============================================
// TYPES
// ============================================

export interface Escrow {
  id: number;
  depositor: string;
  beneficiary: string;
  arbiter: string | null;
  amount: number;
  releasedAmount: number;
  description: string;
  createdTime: number;
  timelockUntil: number;
  status: string;
}

export interface TransactionResult {
  success: boolean;
  txId?: string;
  error?: string;
}

// ============================================
// WALLET CONNECTION
// ============================================

export async function connectWallet(): Promise<{ connected: boolean; address: string | null }> {
  try {
    const response = await connect();
    if (response?.addresses?.[0]) {
      return { connected: true, address: response.addresses[0].address };
    }
    return { connected: false, address: null };
  } catch (error) {
    console.error('Connect error:', error);
    return { connected: false, address: null };
  }
}

export function checkConnection(): boolean {
  return isConnected();
}

export function getCurrentAddress(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem('stacks-session');
    if (stored) {
      const session = JSON.parse(stored);
      return session?.addresses?.[0]?.address || null;
    }
  } catch {}
  return null;
}

// ============================================
// CONTRACT CALLS
// ============================================

async function callContract(functionName: string, args: ClarityValue[]): Promise<TransactionResult> {
  try {
    const serializedArgs = args.map(arg => `0x${Buffer.from(serializeCV(arg)).toString('hex')}`);

    const response = await request('stx_callContract', {
      contract: `${CONTRACT.address}.${CONTRACT.name}`,
      functionName,
      functionArgs: serializedArgs,
      network: NETWORK_NAME,
    });

    if (response?.txid) {
      return { success: true, txId: response.txid };
    }
    return { success: false, error: 'Transaction cancelled' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function readContract(functionName: string, args: ClarityValue[] = []): Promise<any> {
  try {
    const result = await callReadOnlyFunction({
      contractAddress: CONTRACT.address,
      contractName: CONTRACT.name,
      functionName,
      functionArgs: args,
      network: NETWORK,
      senderAddress: CONTRACT.address,
    });
    return cvToJSON(result);
  } catch (error) {
    console.error('Read error:', error);
    return null;
  }
}

// ============================================
// ESCROW FUNCTIONS
// ============================================

export async function createEscrow(
  beneficiary: string,
  amount: number,
  description: string,
  timelockSeconds: number,
  arbiter?: string
): Promise<TransactionResult> {
  return callContract('create-escrow', [
    principalCV(beneficiary),
    uintCV(amount),
    stringAsciiCV(description),
    uintCV(timelockSeconds),
    arbiter ? someCV(principalCV(arbiter)) : noneCV(),
  ]);
}

export async function releaseEscrow(escrowId: number): Promise<TransactionResult> {
  return callContract('release-escrow', [uintCV(escrowId)]);
}

export async function partialRelease(escrowId: number, amount: number): Promise<TransactionResult> {
  return callContract('partial-release', [uintCV(escrowId), uintCV(amount)]);
}

export async function refundEscrow(escrowId: number): Promise<TransactionResult> {
  return callContract('refund-escrow', [uintCV(escrowId)]);
}

export async function raiseDispute(escrowId: number, reason: string): Promise<TransactionResult> {
  return callContract('raise-dispute', [uintCV(escrowId), stringAsciiCV(reason)]);
}

// ============================================
// READ FUNCTIONS
// ============================================

export async function getEscrowCount(): Promise<number> {
  const result = await readContract('get-escrow-count');
  return result?.value || 0;
}

export async function getEscrow(escrowId: number): Promise<Escrow | null> {
  const result = await readContract('get-escrow', [uintCV(escrowId)]);
  if (!result?.value) return null;
  
  const e = result.value;
  return {
    id: escrowId,
    depositor: e.depositor?.value || '',
    beneficiary: e.beneficiary?.value || '',
    arbiter: e.arbiter?.value?.value || null,
    amount: parseInt(e.amount?.value || '0'),
    releasedAmount: parseInt(e['released-amount']?.value || '0'),
    description: e.description?.value || '',
    createdTime: parseInt(e['created-time']?.value || '0'),
    timelockUntil: parseInt(e['timelock-until']?.value || '0'),
    status: e.status?.value || 'unknown',
  };
}

export async function canRefund(escrowId: number): Promise<boolean> {
  const result = await readContract('can-refund', [uintCV(escrowId)]);
  return result?.value === true;
}

export async function getTimeUntilUnlock(escrowId: number): Promise<number> {
  const result = await readContract('get-time-until-unlock', [uintCV(escrowId)]);
  return result?.value || 0;
}

export async function getRemainingAmount(escrowId: number): Promise<number> {
  const result = await readContract('get-remaining-amount', [uintCV(escrowId)]);
  return result?.value || 0;
}

export async function getTotalStats(): Promise<{ escrows: number; volume: number; completed: number }> {
  const result = await readContract('get-total-stats');
  return {
    escrows: parseInt(result?.value?.['total-escrows']?.value || '0'),
    volume: parseInt(result?.value?.['total-volume']?.value || '0'),
    completed: parseInt(result?.value?.['total-completed']?.value || '0'),
  };
}

// ============================================
// UTILITIES
// ============================================

export function formatSTX(microSTX: number): string {
  return (microSTX / 1_000_000).toFixed(2);
}

export function parseSTX(stx: number): number {
  return Math.floor(stx * 1_000_000);
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function truncateAddress(address: string | null): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function getExplorerUrl(txId: string): string {
  return `https://explorer.hiro.so/txid/${txId}`;
}
