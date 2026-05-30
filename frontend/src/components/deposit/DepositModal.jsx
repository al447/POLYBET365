import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, QrCode, Building2, Copy, Check, ChevronDown, ChevronUp, Info, Droplets } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import useDepositModalStore from '../../store/depositModalStore';
import useAuthStore from '../../store/authStore';
import { depositAPI } from '../../services/api';
import {
  CHAINS, TOKENS, TOKEN_CHAINS, chainsForToken, getDepositAddress, getTokenById, getChainById,
} from '../../lib/depositChains';

// Default to first chain (Sepolia testnet when enabled, else Ethereum)
const DEFAULT_CHAIN = CHAINS[0]?.id || 'ethereum';
import Dropdown from './Dropdown';
import DepositReceiptForm from './DepositReceiptForm';
import {
  CashMethodList,
  CashAmountStep,
  CashPayStep,
  CashSuccessStep,
} from './cash';
import { MOONPAY_METHODS } from '../../lib/moonpay';

/* ── Token icon cluster shown on action row ── */
const TokenCluster = ({ ids }) => (
  <div className="flex -space-x-1.5">
    {ids.slice(0, 7).map((id) => {
      const t = TOKENS.find((x) => x.id === id);
      if (!t) return null;
      return (
        <div
          key={id}
          style={{ background: t.color, width: 22, height: 22 }}
          className="rounded-full border-2 border-[var(--color-surface)] flex items-center justify-center text-white font-bold"
          title={t.label}
        >
          <span style={{ fontSize: 8 }}>{t.label[0]}</span>
        </div>
      );
    })}
  </div>
);

/* ── Chain icon cluster for Connect Exchange row ── */
const ExchangeCluster = () => {
  const EXCHANGES = [
    { label: 'CB', color: '#1652F0' },
    { label: 'BN', color: '#F3BA2F' },
    { label: 'KR', color: '#5B47FB' },
    { label: 'OK', color: '#000000' },
  ];
  return (
    <div className="flex -space-x-1.5">
      {EXCHANGES.map((ex) => (
        <div
          key={ex.label}
          style={{ background: ex.color, width: 22, height: 22 }}
          className="rounded-full border-2 border-[var(--color-surface)] flex items-center justify-center text-white font-bold"
          title={ex.label}
        >
          <span style={{ fontSize: 8 }}>{ex.label[0]}</span>
        </div>
      ))}
    </div>
  );
};

/* ── Chain colored badge ── */
const ChainBadge = ({ chain }) => (
  <div className="flex items-center gap-1.5">
    <div
      style={{ background: '#627EEA', width: 16, height: 16 }}
      className="rounded-full flex items-center justify-center text-white font-bold"
    >
      <span style={{ fontSize: 7 }}>{chain?.name?.[0] || 'E'}</span>
    </div>
    <span className="text-sm text-[var(--color-text)]">{chain?.name}</span>
  </div>
);

const DepositModal = () => {
  const { isOpen, closeDepositModal } = useDepositModalStore();
  const { user } = useAuthStore();

  /* ── FSM ── */
  const [view, setView] = useState('main'); // 'main' | 'transfer' | 'cash-amount' | 'cash-pay' | 'cash-success'
  const [tab, setTab] = useState('crypto'); // 'crypto' | 'cash'
  const [selectedToken, setSelectedToken] = useState('USDC');
  const [selectedChainId, setSelectedChainId] = useState(DEFAULT_CHAIN);
  const [showReceipt, setShowReceipt] = useState(false);
  const [priceImpactOpen, setPriceImpactOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [userAddresses, setUserAddresses] = useState(null);
  const [loadingAddresses, setLoadingAddresses] = useState(false);

  /* ── Cash Flow State ── */
  const [cashMethod, setCashMethod] = useState(null);
  const [cashPaymentData, setCashPaymentData] = useState(null);

  /* ── Fetch per-user deposit addresses on first open ── */
  const fetchAddresses = useCallback(async () => {
    if (!user || userAddresses) return;
    setLoadingAddresses(true);
    try {
      const { data } = await depositAPI.getAddresses();
      if (data.success) setUserAddresses(data.addresses);
    } catch {
      // silently fallback to EVM_DEPOSIT_ADDRESS (static)
    } finally {
      setLoadingAddresses(false);
    }
  }, [user, userAddresses]);

  useEffect(() => {
    if (isOpen && user) fetchAddresses();
  }, [isOpen, user, fetchAddresses]);

  /* ── Reset on close ── */
  useEffect(() => {
    if (!isOpen) {
      setView('main');
      setTab('crypto');
      setSelectedToken('USDC');
      setSelectedChainId(DEFAULT_CHAIN);
      setShowReceipt(false);
      setPriceImpactOpen(false);
      setCopied(false);
      setCashMethod(null);
      setCashPaymentData(null);
    }
  }, [isOpen]);

  /* ── ESC key ── */
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') closeDepositModal(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, closeDepositModal]);

  /* ── Body scroll lock ── */
  useEffect(() => {
    if (isOpen) { document.body.style.overflow = 'hidden'; }
    else { document.body.style.overflow = ''; }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  /* ── Token ↔ Chain compatibility ── */
  const validChains = chainsForToken(selectedToken);
  const validChainIds = validChains.map((c) => c.id);

  const handleTokenChange = (tokenId) => {
    setSelectedToken(tokenId);
    const chains = chainsForToken(tokenId);
    if (chains.length && !chains.find((c) => c.id === selectedChainId)) {
      setSelectedChainId(chains[0].id);
    }
  };

  const selectedChain = getChainById(selectedChainId);
  const tokenObj = getTokenById(selectedToken);
  const depositAddress = getDepositAddress(selectedChain, userAddresses);
  const [minting, setMinting] = useState(false);

  // Testnet faucet - only for Polygon Amoy MockUSDT
  const isTestnetFaucetAvailable = selectedChainId === 'polygon-amoy' && selectedToken === 'USDT';

  const handleMintFaucet = async () => {
    if (!window.ethereum) {
      toast.error('No wallet detected. Please install MetaMask.');
      return;
    }
    setMinting(true);
    try {
      const amoyChainId = parseInt(import.meta.env.VITE_CHAIN_ID || '80002', 10);
      const chainHex = `0x${amoyChainId.toString(16)}`;
      try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainHex }] });
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: chainHex,
              chainName: 'Polygon Amoy Testnet',
              nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
              rpcUrls: [import.meta.env.VITE_POLYGON_AMOY_RPC || 'https://polygon-amoy-bor-rpc.publicnode.com'],
              blockExplorerUrls: [import.meta.env.VITE_BLOCK_EXPLORER || 'https://amoy.polygonscan.com'],
            }],
          });
        }
      }
      await new Promise(r => setTimeout(r, 500));

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // Minimal ERC20 ABI for MockUSDT faucet
      const MockUSDT_ABI = [
        'function faucet() public',
        'function balanceOf(address owner) view returns (uint256)',
        'function decimals() view returns (uint8)',
      ];

      const MOCK_USDT_ADDRESS = import.meta.env.VITE_USDT_ADDRESS || '0x820D4ceFa26416dba1d91D63412154433148f835';
      const usdt = new ethers.Contract(MOCK_USDT_ADDRESS, MockUSDT_ABI, signer);

      toast.loading('Minting 10,000 test USDT...', { id: 'faucet' });
      const tx = await usdt.faucet();
      await tx.wait();
      toast.success('10,000 USDT minted to your wallet!', { id: 'faucet' });
    } catch (err) {
      toast.dismiss('faucet');
      if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
        toast.error('Transaction rejected');
      } else {
        toast.error('Mint failed: ' + (err.shortMessage || err.message));
      }
    } finally {
      setMinting(false);
    }
  };

  /* ── Copy address ── */
  const handleCopy = async () => {
    if (!depositAddress) return;
    try {
      await navigator.clipboard.writeText(depositAddress);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = depositAddress;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    toast.success('Address copied!');
    setTimeout(() => setCopied(false), 2500);
  };

  /* ── Chain dropdown items ── */
  const chainDropdownItems = validChains.map((c) => ({
    id: c.id,
    label: c.name,
    color: c.id === 'ethereum' ? '#627EEA'
      : c.id === 'solana'   ? '#9945FF'
      : c.id === 'bsc'      ? '#F3BA2F'
      : c.id === 'base'     ? '#0052FF'
      : c.id === 'polygon'  ? '#8247E5'
      : c.id === 'arbitrum' ? '#28A0F0'
      : '#888',
  }));

  const tokenDropdownItems = TOKENS.map((t) => ({ id: t.id, label: t.label, color: t.color }));

  /* ── Is Solana with no address configured ── */
  const isSolanaNoAddress = selectedChain?.kind === 'sol' && !depositAddress;

  const balanceDisplay = user?.balance != null
    ? `$${user.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '$0.00';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeDepositModal}
          />

          {/* Card */}
          <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="relative w-full max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl z-10 overflow-hidden"
          >
            {/* ═══ HEADER ═══ */}
            <div className="flex items-center px-5 pt-5 pb-4 relative">
              {/* Back button for transfer and cash views */}
              {(view === 'transfer' || view.startsWith('cash-')) && view !== 'cash-success' && (
                <button
                  onClick={() => {
                    if (view === 'transfer') {
                      setView('main');
                      setShowReceipt(false);
                    } else if (view === 'cash-amount') {
                      setView('main');
                      setCashMethod(null);
                    } else if (view === 'cash-pay') {
                      setView('cash-amount');
                    }
                  }}
                  className="absolute left-5 p-1 rounded-lg hover:bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              <div className="flex-1 text-center">
                <h2 className="text-base font-bold text-[var(--color-text)]">
                  {view === 'transfer'
                    ? 'Transfer Crypto'
                    : view === 'cash-amount'
                    ? 'Deposit · Total'
                    : view === 'cash-pay'
                    ? `Pay with ${cashPaymentData?.methodLabel || ''}`
                    : view === 'cash-success'
                    ? 'Deposit Complete'
                    : 'Deposit'}
                </h2>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  PolyBet365 Balance: {balanceDisplay}
                </p>
              </div>
              <button
                onClick={closeDepositModal}
                className="absolute right-5 p-1 rounded-lg hover:bg-[var(--color-surface2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ═══ BODY ═══ */}
            <AnimatePresence mode="wait">
              {view === 'main' && (
                <motion.div
                  key="main"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.18 }}
                  className="px-5 pb-5"
                >
                  {/* Tab switcher */}
                  <div className="flex p-1 bg-[var(--color-surface2)] rounded-xl mb-4 border border-[var(--color-border)]">
                    {[
                      { id: 'crypto', label: 'Use Crypto', icon: '₿' },
                      { id: 'cash',   label: 'Use Cash',   icon: '$' },
                    ].map(({ id, label, icon }) => (
                      <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                          tab === id
                            ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold ${tab === id ? 'bg-[var(--color-text)]' : 'bg-[var(--color-text-muted)]'}`}>
                          {icon}
                        </span>
                        {label}
                      </button>
                    ))}
                  </div>

                  {tab === 'crypto' ? (
                    <div className="space-y-2">
                      {/* Transfer Crypto row */}
                      <button
                        onClick={() => setView('transfer')}
                        className="w-full flex items-center gap-3.5 p-4 rounded-xl border border-[var(--color-border)] hover:border-[#4f6ef7]/50 hover:bg-[var(--color-surface2)]/40 transition-all group"
                      >
                        <div className="w-10 h-10 rounded-xl bg-[#4f6ef7]/10 flex items-center justify-center flex-shrink-0">
                          <QrCode className="w-5 h-5 text-[#4f6ef7]" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-semibold text-[var(--color-text)]">Transfer Crypto</p>
                          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">No limit · Instant</p>
                        </div>
                        <TokenCluster ids={['USDC', 'ETH', 'BNB', 'MATIC', 'SOL', 'ARB', 'DAI']} />
                      </button>

                      {/* Connect Exchange row */}
                      <button
                        onClick={() => toast('Connect Exchange — coming soon', { icon: '🏦' })}
                        className="w-full flex items-center gap-3.5 p-4 rounded-xl border border-[var(--color-border)] hover:border-[#4f6ef7]/50 hover:bg-[var(--color-surface2)]/40 transition-all"
                      >
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-semibold text-[var(--color-text)]">Connect Exchange</p>
                          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">No limit · 2 min</p>
                        </div>
                        <ExchangeCluster />
                      </button>
                    </div>
                  ) : (
                    <CashMethodList
                      onSelect={(methodId) => {
                        setCashMethod(methodId);
                        setView('cash-amount');
                      }}
                    />
                  )}
                </motion.div>
              )}

              {view === 'transfer' && (
                <motion.div
                  key="transfer"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.18 }}
                  className="px-5 pb-5"
                >
                  {/* Token + Chain selectors */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <Dropdown
                      label="Tokens"
                      items={tokenDropdownItems}
                      value={selectedToken}
                      onChange={handleTokenChange}
                    />
                    <Dropdown
                      label="Chains"
                      rightLabel={`Min $${selectedChain?.minUsd ?? 3} ⓘ`}
                      items={chainDropdownItems}
                      value={selectedChainId}
                      onChange={setSelectedChainId}
                    />
                  </div>

                  {/* Testnet Faucet Button */}
                  {isTestnetFaucetAvailable && (
                    <button
                      onClick={handleMintFaucet}
                      disabled={minting}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-[#4f6ef7]/20 to-emerald-500/20 border border-[#4f6ef7]/30 text-sm font-medium text-[#4f6ef7] hover:bg-[#4f6ef7]/10 transition-colors mb-4"
                    >
                      {minting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-[#4f6ef7] border-t-transparent rounded-full animate-spin" />
                          Minting...
                        </>
                      ) : (
                        <>
                          <Droplets className="w-4 h-4" />
                          + Mint 10,000 Test USDT
                        </>
                      )}
                    </button>
                  )}

                  {/* QR Code area */}
                  {isSolanaNoAddress ? (
                    <div className="flex flex-col items-center py-8 text-center">
                      <Info className="w-10 h-10 text-[var(--color-text-muted)] mb-2" />
                      <p className="text-sm font-medium text-[var(--color-text)]">Solana deposits not yet configured</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">Please contact support or use an EVM chain.</p>
                    </div>
                  ) : loadingAddresses ? (
                    <div className="flex justify-center py-10">
                      <div className="w-8 h-8 border-2 border-[#4f6ef7] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <>
                      {/* QR */}
                      <div className="flex justify-center my-4">
                        <div className="relative p-3 bg-white rounded-2xl shadow-sm">
                          <QRCodeSVG
                            value={depositAddress || ''}
                            size={180}
                            bgColor="#ffffff"
                            fgColor="#000000"
                            level="M"
                          />
                          {/* Token icon overlay */}
                          <div
                            className="absolute inset-0 flex items-center justify-center pointer-events-none"
                          >
                            <div
                              style={{ background: tokenObj?.color || '#4f6ef7', width: 36, height: 36 }}
                              className="rounded-full border-4 border-white flex items-center justify-center"
                            >
                              <span className="text-white font-bold text-xs">
                                {tokenObj?.label?.[0] || 'T'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Address */}
                      <div className="mb-2">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                            <span>Send to this address</span>
                            <Info className="w-3 h-3" />
                          </div>
                          {/* <a
                            href="https://polybet365.com/terms"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[#4f6ef7] hover:underline"
                          >
                            Terms apply
                          </a> */}
                        </div>
                        <div className="px-3 py-3 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)]">
                          <p className="text-xs font-mono text-[var(--color-text)] break-all leading-relaxed">
                            {depositAddress}
                          </p>
                        </div>
                      </div>

                      {/* Copy button */}
                      <button
                        onClick={handleCopy}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--color-border)] text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface2)] transition-colors mb-3"
                      >
                        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        {copied ? 'Copied!' : 'Copy address'}
                      </button>

                      {/* Price impact collapsible */}
                      <button
                        type="button"
                        onClick={() => setPriceImpactOpen((o) => !o)}
                        className="w-full flex items-center justify-between text-xs text-[var(--color-text-muted)] py-2 px-1"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-[var(--color-surface2)] flex items-center justify-center text-[8px]">$</span>
                          <span>Price impact: 0.00%</span>
                          <Info className="w-3 h-3" />
                        </div>
                        {priceImpactOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      {priceImpactOpen && (
                        <div className="mt-1 px-3 py-3 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] space-y-1.5">
                          <div className="flex justify-between"><span>Network fee</span><span>&lt; $0.01</span></div>
                          <div className="flex justify-between"><span>Platform fee</span><span>0.00%</span></div>
                          <div className="flex justify-between font-medium text-[var(--color-text)]"><span>You receive</span><span>100% of deposit</span></div>
                        </div>
                      )}

                      {/* Already sent deposit? */}
                      <div className="mt-2 text-center">
                        <button
                          onClick={() => setShowReceipt((s) => !s)}
                          className="text-xs text-[#4f6ef7] hover:underline"
                        >
                          {showReceipt ? 'Hide form' : 'Already sent a deposit? Submit transaction hash →'}
                        </button>
                      </div>

                      {showReceipt && (
                        <DepositReceiptForm
                          defaultChain={selectedChainId}
                          defaultToken={selectedToken}
                          onSubmitted={() => setShowReceipt(false)}
                        />
                      )}
                    </>
                  )}
                </motion.div>
              )}

              {/* ─── CASH FLOW VIEWS ─── */}
              {view === 'cash-amount' && cashMethod && (
                <motion.div
                  key="cash-amount"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.18 }}
                  className="px-5 pb-5"
                >
                  <CashAmountStep
                    methodId={cashMethod}
                    onBack={() => {
                      setView('main');
                      setCashMethod(null);
                    }}
                    onContinue={(data) => {
                      const method = MOONPAY_METHODS.find((m) => m.id === cashMethod);
                      setCashPaymentData({
                        ...data,
                        methodLabel: method?.label,
                        walletAddress: userAddresses?.evm,
                      });
                      setView('cash-pay');
                    }}
                  />
                </motion.div>
              )}

              {view === 'cash-pay' && cashPaymentData && (
                <motion.div
                  key="cash-pay"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.18 }}
                  className="px-5 pb-5"
                >
                  <CashPayStep
                    paymentData={cashPaymentData}
                    onBack={() => setView('cash-amount')}
                    onSuccess={() => setView('cash-success')}
                    onFailure={() => setView('cash-amount')}
                  />
                </motion.div>
              )}

              {view === 'cash-success' && cashPaymentData && (
                <motion.div
                  key="cash-success"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.18 }}
                  className="px-5 pb-5"
                >
                  <CashSuccessStep
                    paymentData={cashPaymentData}
                    onClose={closeDepositModal}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default DepositModal;
