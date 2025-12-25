'use client';

import { useState, useEffect } from 'react';
import { Lock, Plus, ArrowRight, Clock, Shield, Loader2, CheckCircle, XCircle, AlertTriangle, Wallet } from 'lucide-react';
import {
  connectWallet,
  checkConnection,
  getCurrentAddress,
  createEscrow,
  releaseEscrow,
  refundEscrow,
  raiseDispute,
  getEscrowCount,
  getEscrow,
  canRefund,
  getTotalStats,
  truncateAddress,
  formatDuration,
  formatSTX,
  parseSTX,
  getExplorerUrl,
  Escrow,
} from '@/lib/stacks';

export default function EscrowPage() {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [stats, setStats] = useState({ escrows: 0, volume: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [txPending, setTxPending] = useState(false);
  const [txResult, setTxResult] = useState<{ success: boolean; txId?: string } | null>(null);

  useEffect(() => {
    if (checkConnection()) {
      setAddress(getCurrentAddress());
    }
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [count, totalStats] = await Promise.all([getEscrowCount(), getTotalStats()]);
      setStats(totalStats);
      const escrowPromises = [];
      for (let i = count; i > Math.max(0, count - 10); i--) {
        escrowPromises.push(getEscrow(i));
      }
      const loadedEscrows = (await Promise.all(escrowPromises)).filter(Boolean) as Escrow[];
      setEscrows(loadedEscrows);
    } catch (error) {
      console.error('Load error:', error);
    }
    setLoading(false);
  }

  async function handleConnect() {
    setConnecting(true);
    const result = await connectWallet();
    if (result.connected) setAddress(result.address);
    setConnecting(false);
  }

  async function handleAppKitConnect() {
    try {
      const { openAppKit } = await import('@/lib/appkit');
      await openAppKit();
    } catch (error) {
      console.error('Failed to open AppKit:', error);
    }
  }

  async function handleRelease(escrowId: number) {
    setTxPending(true);
    const result = await releaseEscrow(escrowId);
    setTxResult(result);
    setTxPending(false);
    if (result.success) setTimeout(() => loadData(), 2000);
  }

  async function handleRefund(escrowId: number) {
    setTxPending(true);
    const result = await refundEscrow(escrowId);
    setTxResult(result);
    setTxPending(false);
    if (result.success) setTimeout(() => loadData(), 2000);
  }

  async function handleDispute(escrowId: number) {
    const reason = prompt('Enter dispute reason:');
    if (!reason) return;
    setTxPending(true);
    const result = await raiseDispute(escrowId, reason);
    setTxResult(result);
    setTxPending(false);
    if (result.success) setTimeout(() => loadData(), 2000);
  }

  async function handleCreateEscrow(beneficiary: string, amount: number, description: string, timelock: number) {
    setTxPending(true);
    const result = await createEscrow(beneficiary, amount, description, timelock);
    setTxResult(result);
    setTxPending(false);
    setShowCreateModal(false);
    if (result.success) setTimeout(() => loadData(), 2000);
  }

  const myEscrows = escrows.filter(e => e.depositor === address || e.beneficiary === address);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-gray-900 to-black text-white">
      <header className="border-b border-emerald-800/50 backdrop-blur-sm sticky top-0 z-50 bg-black/50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Lock className="w-8 h-8 text-emerald-400" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              STX Escrow
            </h1>
          </div>
          {address ? (
            <div className="flex items-center gap-4">
              <button
                onClick={handleAppKitConnect}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-all flex items-center gap-2 text-sm"
                title="Open AppKit Modal (Reown)"
              >
                <Wallet className="w-4 h-4" />
                AppKit
              </button>
              <span className="text-emerald-300">{truncateAddress(address)}</span>
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={handleAppKitConnect}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-all flex items-center gap-2"
                title="Connect via Reown AppKit"
              >
                <Wallet className="w-4 h-4" />
                AppKit
              </button>
              <span className="text-gray-500">or</span>
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-medium transition-all disabled:opacity-50"
              >
                {connecting ? 'Connecting...' : 'Stacks Connect'}
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-emerald-900/30 rounded-xl p-6 border border-emerald-800/50">
            <div className="flex items-center gap-3 mb-2"><Lock className="w-5 h-5 text-emerald-400" /><span className="text-emerald-300">Total Escrows</span></div>
            <p className="text-3xl font-bold">{stats.escrows}</p>
          </div>
          <div className="bg-emerald-900/30 rounded-xl p-6 border border-emerald-800/50">
            <div className="flex items-center gap-3 mb-2"><Shield className="w-5 h-5 text-emerald-400" /><span className="text-emerald-300">Total Volume</span></div>
            <p className="text-3xl font-bold">{formatSTX(stats.volume)} STX</p>
          </div>
          <div className="bg-emerald-900/30 rounded-xl p-6 border border-emerald-800/50">
            <div className="flex items-center gap-3 mb-2"><CheckCircle className="w-5 h-5 text-emerald-400" /><span className="text-emerald-300">Completed</span></div>
            <p className="text-3xl font-bold">{stats.completed}</p>
          </div>
        </div>

        {address && (
          <button onClick={() => setShowCreateModal(true)} className="mb-8 flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-lg font-medium transition-all">
            <Plus className="w-5 h-5" />Create Escrow
          </button>
        )}

        <div>
          <h2 className="text-xl font-semibold text-emerald-300 mb-4">Recent Escrows</h2>
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-400" /></div>
          ) : escrows.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No escrows yet. Create the first one!</div>
          ) : (
            <div className="space-y-4">
              {escrows.map(escrow => (
                <EscrowCard key={escrow.id} escrow={escrow} address={address} onRelease={handleRelease} onRefund={handleRefund} onDispute={handleDispute} txPending={txPending} />
              ))}
            </div>
          )}
        </div>

        {txResult && (
          <div className={`fixed bottom-4 right-4 p-4 rounded-lg ${txResult.success ? 'bg-green-900 border-green-700' : 'bg-red-900 border-red-700'} border`}>
            <div className="flex items-center gap-2">
              {txResult.success ? <CheckCircle className="w-5 h-5 text-green-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
              <span>{txResult.success ? 'Transaction submitted!' : 'Transaction failed'}</span>
            </div>
            {txResult.txId && <a href={getExplorerUrl(txResult.txId)} target="_blank" rel="noopener noreferrer" className="text-sm text-emerald-400 hover:underline mt-1 block">View on Explorer →</a>}
            <button onClick={() => setTxResult(null)} className="absolute top-1 right-2 text-gray-400 hover:text-white">×</button>
          </div>
        )}

        {showCreateModal && <CreateEscrowModal onClose={() => setShowCreateModal(false)} onSubmit={handleCreateEscrow} pending={txPending} />}
      </main>
    </div>
  );
}

function EscrowCard({ escrow, address, onRelease, onRefund, onDispute, txPending }: { escrow: Escrow; address: string | null; onRelease: (id: number) => void; onRefund: (id: number) => void; onDispute: (id: number) => void; txPending: boolean }) {
  const [refundable, setRefundable] = useState(false);
  useEffect(() => { canRefund(escrow.id).then(setRefundable); }, [escrow]);

  const isDepositor = address === escrow.depositor;
  const isBeneficiary = address === escrow.beneficiary;
  const remaining = escrow.amount - escrow.releasedAmount;
  const now = Math.floor(Date.now() / 1000);
  const timeUntilUnlock = Math.max(0, escrow.timelockUntil - now);

  const statusColors: Record<string, string> = { active: 'bg-green-900 text-green-300', released: 'bg-blue-900 text-blue-300', refunded: 'bg-gray-800 text-gray-300', disputed: 'bg-red-900 text-red-300', resolved: 'bg-purple-900 text-purple-300' };

  return (
    <div className="bg-gray-900/50 rounded-xl p-6 border border-emerald-800/30 hover:border-emerald-600/50 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="text-center"><p className="text-xs text-gray-500">From</p><p className="text-sm font-mono">{truncateAddress(escrow.depositor)}</p></div>
          <ArrowRight className="w-5 h-5 text-emerald-400" />
          <div className="text-center"><p className="text-xs text-gray-500">To</p><p className="text-sm font-mono">{truncateAddress(escrow.beneficiary)}</p></div>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm ${statusColors[escrow.status] || 'bg-gray-800'}`}>{escrow.status}</div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-emerald-900/30 rounded-lg p-3"><p className="text-sm text-emerald-300">Amount</p><p className="text-xl font-bold">{formatSTX(escrow.amount)} STX</p></div>
        <div className="bg-emerald-900/30 rounded-lg p-3"><p className="text-sm text-emerald-300">Remaining</p><p className="text-xl font-bold">{formatSTX(remaining)} STX</p></div>
      </div>
      <p className="text-gray-400 text-sm mb-4">{escrow.description}</p>
      {timeUntilUnlock > 0 && escrow.status === 'active' && <div className="flex items-center gap-2 text-sm text-yellow-400 mb-4"><Clock className="w-4 h-4" />Locked for {formatDuration(timeUntilUnlock)}</div>}
      {escrow.status === 'active' && (
        <div className="flex gap-2">
          {isDepositor && (<><button onClick={() => onRelease(escrow.id)} disabled={txPending} className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-medium disabled:opacity-50">Release Funds</button>{refundable && <button onClick={() => onRefund(escrow.id)} disabled={txPending} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium disabled:opacity-50">Refund</button>}</>)}
          {(isDepositor || isBeneficiary) && <button onClick={() => onDispute(escrow.id)} disabled={txPending} className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Dispute</button>}
        </div>
      )}
    </div>
  );
}

function CreateEscrowModal({ onClose, onSubmit, pending }: { onClose: () => void; onSubmit: (beneficiary: string, amount: number, desc: string, timelock: number) => void; pending: boolean }) {
  const [beneficiary, setBeneficiary] = useState('');
  const [amount, setAmount] = useState(1);
  const [description, setDescription] = useState('');
  const [timelock, setTimelock] = useState(3600);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl p-6 max-w-lg w-full border border-emerald-800">
        <h2 className="text-xl font-bold mb-4">Create Escrow</h2>
        <div className="space-y-4">
          <div><label className="block text-sm text-gray-400 mb-1">Beneficiary Address</label><input type="text" value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} className="w-full px-4 py-2 bg-gray-800 rounded-lg border border-gray-700 focus:border-emerald-500 outline-none" placeholder="SP..." /></div>
          <div><label className="block text-sm text-gray-400 mb-1">Amount (STX)</label><input type="number" step="0.1" value={amount} onChange={(e) => setAmount(parseFloat(e.target.value) || 1)} className="w-full px-4 py-2 bg-gray-800 rounded-lg border border-gray-700 focus:border-emerald-500 outline-none" /></div>
          <div><label className="block text-sm text-gray-400 mb-1">Description</label><input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-4 py-2 bg-gray-800 rounded-lg border border-gray-700 focus:border-emerald-500 outline-none" placeholder="What is this escrow for?" /></div>
          <div><label className="block text-sm text-gray-400 mb-1">Timelock Duration</label><select value={timelock} onChange={(e) => setTimelock(Number(e.target.value))} className="w-full px-4 py-2 bg-gray-800 rounded-lg border border-gray-700 focus:border-emerald-500 outline-none"><option value={3600}>1 hour</option><option value={86400}>1 day</option><option value={259200}>3 days</option><option value={604800}>7 days</option></select></div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg">Cancel</button>
          <button onClick={() => onSubmit(beneficiary, parseSTX(amount), description, timelock)} disabled={!beneficiary || pending} className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50">{pending ? 'Creating...' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}
