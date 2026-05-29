import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Coins, ArrowLeftRight, Server, Check, Loader2, ChevronRight } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import { getInjectedProvider } from '../../hooks/useWallet';
import toast from 'react-hot-toast';

/* ═══════════════════════════════════════════════════════
   Post-auth onboarding modal (exact Polymarket design)
   Step 1: Feature highlights + Next
   Step 2: Complete migration — circle indicators + line
   Step 3: Migration Complete — success icon + Start Trading
   ═══════════════════════════════════════════════════════ */

const FEATURES = [
  { icon: Shield, label: 'Enhanced Security', color: '#4f6ef7' },
  { icon: Coins, label: 'USDT Trading', color: '#00c853' },
  { icon: ArrowLeftRight, label: 'Instant Deposits', color: '#ff9800' },
  { icon: Server, label: 'On-Chain Settlement', color: '#9c27b0' },
];

const MIGRATION_STEPS = [
  { id: 'deploy', title: 'Deploy Wallet', desc: 'Deploy a smart contract wallet to enable trading' },
  { id: 'enable', title: 'Enable Trading', desc: 'Sign a message to generate your API keys' },
  { id: 'approve', title: 'Approve Tokens', desc: 'Approve token spending for trading' },
];

/* ── PolyBet365 logo icon for success screen ── */
const SuccessIcon = () => (
  <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="80" height="80" rx="16" fill="#4f6ef7" fillOpacity="0.1" />
    <path d="M24 30L40 20L56 30V50L40 60L24 50V30Z" stroke="#4f6ef7" strokeWidth="3" fill="none" />
    <path d="M28 44L36 52L54 28" stroke="#4f6ef7" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

const OnboardingModal = () => {
  const { user } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(1); // 1=features, 2=migration, 3=success
  const [completedActions, setCompletedActions] = useState([]);
  const [signingAction, setSigningAction] = useState(null);

  useEffect(() => {
    if (user && user.id) {
      const key = `pb365_onboarded_${user.id}`;
      if (!localStorage.getItem(key)) {
        const timer = setTimeout(() => setIsOpen(true), 600);
        return () => clearTimeout(timer);
      }
    }
  }, [user?.id]);

  const [switchingNetwork, setSwitchingNetwork] = useState(false);

  const handleClose = () => {
    if (user?.id) localStorage.setItem(`pb365_onboarded_${user.id}`, 'true');
    setIsOpen(false);
    setStep(1);
    setCompletedActions([]);
  };

  const handleProceed = async () => {
    setSwitchingNetwork(true);
    // Network switching disabled - proceed directly to step 3
    setStep(3);
    setSwitchingNetwork(false);
  };

  const handleSign = async (actionId) => {
    setSigningAction(actionId);
    try {
      // Try WalletConnect first (for users who logged in via WC on mobile)
      let walletProvider = null;
      let isWalletConnect = false;

      try {
        const { getWeb3ModalInstance } = await import('../../lib/web3modal');
        const modal = getWeb3ModalInstance();
        if (modal && modal.getIsConnected()) {
          walletProvider = modal.getWalletProvider();
          isWalletConnect = true;
          console.log('[Onboarding] Using WalletConnect provider');
        }
      } catch (err) {
        console.warn('[Onboarding] WalletConnect check failed:', err.message);
      }

      // Fall back to injected wallet (browser extension)
      if (!walletProvider) {
        walletProvider = getInjectedProvider();
        if (!walletProvider) {
          toast.error('No wallet detected. Please connect a wallet first.');
          setSigningAction(null);
          return;
        }
        console.log('[Onboarding] Using injected provider');
        await walletProvider.request({ method: 'eth_requestAccounts' });
      }

      const provider = new ethers.BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      if (isWalletConnect) {
        toast('Please approve the signature in your mobile wallet', { icon: '📱', duration: 4000 });
      }
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = completedActions.length;

      // Each step has a unique message that the wallet signs (like Polymarket's ClobAuth)
      const messages = {
        deploy: `This message attests that I control the address ${address} and authorize deploying a smart contract wallet for PolyBet365 trading.\n\nTimestamp: ${timestamp}\nNonce: ${nonce}`,
        enable: `This message attests that I control the address ${address} and authorize enabling trading on PolyBet365.\n\nPrimary type: ClobAuth\nTimestamp: ${timestamp}\nNonce: ${nonce}`,
        approve: `This message attests that I control the address ${address} and approve token spending for PolyBet365 deposits.\n\nTimestamp: ${timestamp}\nNonce: ${nonce}`,
      };

      const message = messages[actionId];
      await signer.signMessage(message);

      setCompletedActions((prev) => [...prev, actionId]);
    } catch (err) {
      console.error('Wallet sign error:', err);
      if (err.code === 'ACTION_REJECTED' || err.code === 4001 || err?.info?.error?.code === 4001) {
        toast.error('Signature rejected. Please approve to continue.');
      } else {
        toast.error('Wallet signing failed. Please try again.');
      }
    }
    setSigningAction(null);
  };

  const allComplete = completedActions.length === MIGRATION_STEPS.length;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-[460px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl z-10 overflow-hidden"
          >
            <AnimatePresence mode="wait">

              {/* ════════ STEP 1: Feature Highlights ════════ */}
              {step === 1 && (
                <motion.div
                  key="features"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="p-8 pb-6">
                    <div className="grid grid-cols-2 gap-3 mb-8">
                      {FEATURES.map((feat) => {
                        const Icon = feat.icon;
                        return (
                          <div key={feat.label} className="flex items-center gap-3 p-3.5 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)]">
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: feat.color + '18' }}>
                              <Icon className="w-5 h-5" style={{ color: feat.color }} />
                            </div>
                            <span className="text-sm font-medium text-[var(--color-text)] leading-tight">{feat.label}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-center mb-6">
                      <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">Welcome to PolyBet365</h2>
                      <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                        Trade on real-world events with USDT. Secure, fast, and transparent prediction markets powered by blockchain.
                      </p>
                    </div>
                  </div>
                  {/* Full-width bottom button */}
                  <div className="px-6 pb-6">
                    <button
                      onClick={() => setStep(2)}
                      className="w-full py-4 rounded-full bg-[#4f6ef7] text-white font-semibold text-base hover:bg-[#4060e0] transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ════════ STEP 2: Complete Migration ════════ */}
              {step === 2 && (
                <motion.div
                  key="migration"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Grid background decoration */}
                  <div className="relative">
                    <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(var(--color-text) 1px, transparent 1px), linear-gradient(90deg, var(--color-text) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

                    <div className="relative px-8 pt-10 pb-6">
                      {/* Title */}
                      <div className="text-center mb-2">
                        <h2 className="text-2xl font-bold text-[var(--color-text)]">Complete migration</h2>
                      </div>
                      <p className="text-center text-sm text-[var(--color-text-muted)] mb-8 max-w-[320px] mx-auto leading-relaxed">
                        To start trading with the upgraded system, approve the migration in your wallet. This is a one-time action.
                      </p>

                      {/* Steps card */}
                      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5">
                        {MIGRATION_STEPS.map((s, idx) => {
                          const isDone = completedActions.includes(s.id);
                          const isSigning = signingAction === s.id;
                          const prevDone = idx === 0 || completedActions.includes(MIGRATION_STEPS[idx - 1].id);
                          const isActive = !isDone && prevDone;
                          const isLocked = !isDone && !prevDone;
                          const isLast = idx === MIGRATION_STEPS.length - 1;

                          return (
                            <div key={s.id} className="flex gap-4">
                              {/* Circle + connector line */}
                              <div className="flex flex-col items-center">
                                <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                  isDone
                                    ? 'border-[#4f6ef7] bg-[#4f6ef7]'
                                    : isActive
                                      ? 'border-[#4f6ef7] bg-transparent'
                                      : 'border-[var(--color-border)] bg-transparent'
                                }`}>
                                  {isDone && <Check className="w-4 h-4 text-white" />}
                                  {isSigning && <Loader2 className="w-4 h-4 animate-spin text-[#4f6ef7]" />}
                                </div>
                                {!isLast && (
                                  <div className={`w-0.5 flex-1 min-h-[32px] transition-colors ${
                                    isDone ? 'bg-[#4f6ef7]' : 'bg-[var(--color-border)]'
                                  }`} />
                                )}
                              </div>

                              {/* Content + Action */}
                              <div className={`flex-1 flex items-start justify-between pb-5 ${isLast ? 'pb-0' : ''}`}>
                                <div className="min-w-0">
                                  <p className={`text-sm font-semibold ${isDone ? 'text-[var(--color-text)]' : 'text-[var(--color-text)]'}`}>
                                    {s.title}
                                  </p>
                                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{s.desc}</p>
                                </div>
                                <div className="flex-shrink-0 ml-3 mt-0.5">
                                  {isDone ? (
                                    <span className="text-sm font-semibold text-[#4f6ef7]">Done</span>
                                  ) : isSigning ? (
                                    <div className="w-10 h-8 rounded-lg bg-[#4f6ef7]/10 flex items-center justify-center">
                                      <Loader2 className="w-4 h-4 animate-spin text-[#4f6ef7]" />
                                    </div>
                                  ) : isActive ? (
                                    <button
                                      onClick={() => handleSign(s.id)}
                                      className="px-4 py-1.5 rounded-lg bg-[#4f6ef7] text-white text-sm font-semibold hover:bg-[#4060e0] transition-colors"
                                    >
                                      Sign
                                    </button>
                                  ) : (
                                    <div className="w-10 h-8 rounded-lg bg-[var(--color-surface2)] border border-[var(--color-border)] flex items-center justify-center">
                                      <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)]" />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Full-width Proceed button */}
                  <div className="px-6 pb-6">
                    <button
                      onClick={handleProceed}
                      disabled={!allComplete || switchingNetwork}
                      className={`w-full py-4 rounded-full font-semibold text-base transition-colors flex items-center justify-center gap-2 ${
                        allComplete && !switchingNetwork
                          ? 'bg-[#4f6ef7] text-white hover:bg-[#4060e0]'
                          : 'bg-[var(--color-surface2)] text-[var(--color-text-muted)] border border-[var(--color-border)] cursor-not-allowed'
                      }`}
                    >
                      {switchingNetwork ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Switching to Polygon Amoy...
                        </>
                      ) : (
                        'Proceed'
                      )}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ════════ STEP 3: Migration Complete ════════ */}
              {step === 3 && (
                <motion.div
                  key="complete"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {/* Grid background top section */}
                  <div className="relative">
                    <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(var(--color-text) 1px, transparent 1px), linear-gradient(90deg, var(--color-text) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                    <div className="relative flex justify-center pt-12 pb-8">
                      <motion.div
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', damping: 15, delay: 0.1 }}
                      >
                        <SuccessIcon />
                      </motion.div>
                    </div>
                    {/* Gradient fade line */}
                    <div className="h-px bg-gradient-to-r from-transparent via-[var(--color-border)] to-transparent" />
                  </div>

                  {/* Text section */}
                  <div className="px-8 pt-8 pb-4 text-center">
                    <motion.h2
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="text-2xl font-bold text-[var(--color-text)] mb-3"
                    >
                      Migration Complete
                    </motion.h2>
                    <motion.p
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="text-sm text-[var(--color-text-muted)] leading-relaxed"
                    >
                      Your balance and positions have been migrated.<br />
                      You're all set.
                    </motion.p>
                  </div>

                  {/* Start Trading button */}
                  <div className="px-6 pb-6 pt-4">
                    <motion.button
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      onClick={handleClose}
                      className="w-full py-4 rounded-full bg-[#4f6ef7] text-white font-semibold text-base hover:bg-[#4060e0] transition-colors"
                    >
                      Start Trading
                    </motion.button>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default OnboardingModal;
