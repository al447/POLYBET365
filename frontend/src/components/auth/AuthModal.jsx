import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useAuthStore from '../../store/authStore';
import useWallet from '../../hooks/useWallet';
import useMagic from '../../hooks/useMagic';
import { getStoredReferralCode, clearStoredReferralCode } from '../../lib/referralCapture';
import toast from 'react-hot-toast';

/* ── MetaMask fox icon (full color SVG) ── */
const MetaMaskIcon = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 256 240" xmlns="http://www.w3.org/2000/svg">
    <polygon fill="#E17726" points="250.07 0 140.73 81.23 160.67 33.33"/>
    <polygon fill="#E27625" points="5.93 0 114.26 81.93 95.33 33.33"/>
    <polygon fill="#E27625" points="213.14 174.56 184.44 220.17 244.44 236.89 261.78 175.44"/>
    <polygon fill="#E27625" points="-5.78 175.44 11.33 236.89 71.11 220.17 42.67 174.56"/>
    <polygon fill="#E27625" points="68.18 104.93 51.56 130 111.11 132.67 109.33 68.44"/>
    <polygon fill="#E27625" points="187.82 104.93 146.18 67.78 145.11 132.67 204.44 130"/>
    <polygon fill="#E27625" points="71.11 220.17 107.78 202.44 76 175.89"/>
    <polygon fill="#E27625" points="148.22 202.44 184.44 220.17 180 175.89"/>
    <polygon fill="#D5BFB2" points="184.44 220.17 148.22 202.44 151.11 226.67 150.78 236.22"/>
    <polygon fill="#D5BFB2" points="71.11 220.17 105.22 236.22 105 226.67 107.78 202.44"/>
    <polygon fill="#233447" points="105.78 162.67 74.89 153.33 96.44 143.11"/>
    <polygon fill="#233447" points="150.22 162.67 159.56 143.11 181.33 153.33"/>
    <polygon fill="#CD6116" points="71.11 220.17 76.44 174.56 42.67 175.44"/>
    <polygon fill="#CD6116" points="179.56 174.56 184.44 220.17 213.14 175.44"/>
    <polygon fill="#CD6116" points="204.44 130 145.11 132.67 150.22 162.67 159.56 143.11 181.33 153.33"/>
    <polygon fill="#CD6116" points="74.89 153.33 96.44 143.11 105.78 162.67 111.11 132.67 51.56 130"/>
    <polygon fill="#E4751F" points="51.56 130 76 175.89 74.89 153.33"/>
    <polygon fill="#E4751F" points="181.33 153.33 180 175.89 204.44 130"/>
    <polygon fill="#E4751F" points="111.11 132.67 105.78 162.67 112.44 197.33 114.26 149.33"/>
    <polygon fill="#E4751F" points="145.11 132.67 141.78 149.11 143.56 197.33 150.22 162.67"/>
    <polygon fill="#F6851B" points="150.22 162.67 143.56 197.33 148.22 202.44 180 175.89 181.33 153.33"/>
    <polygon fill="#F6851B" points="74.89 153.33 76 175.89 107.78 202.44 112.44 197.33 105.78 162.67"/>
    <polygon fill="#C0AD9E" points="150.78 236.22 151.11 226.67 148.44 224.33 107.56 224.33 105 226.67 105.22 236.22 71.11 220.17 83.11 230 107.11 247.33 148.89 247.33 173.11 230 184.44 220.17"/>
    <polygon fill="#161616" points="148.22 202.44 143.56 197.33 112.44 197.33 107.78 202.44 105 226.67 107.56 224.33 148.44 224.33 151.11 226.67"/>
    <polygon fill="#763D16" points="255.78 85.33 264 41.33 250.07 0 148.22 60.44 187.82 104.93 243.11 121.33 256.22 106 250.67 102 260.44 93.11 253.56 87.78 263.33 80.22"/>
    <polygon fill="#763D16" points="-8 41.33 0.22 85.33 -7.33 80.22 2.44 87.78 -4.44 93.11 5.33 102 -0.22 106 12.89 121.33 68.18 104.93 107.78 60.44 5.93 0"/>
    <polygon fill="#F6851B" points="243.11 121.33 187.82 104.93 204.44 130 180 175.89 213.14 175.44 261.78 175.44"/>
    <polygon fill="#F6851B" points="68.18 104.93 12.89 121.33 -5.78 175.44 42.67 175.44 76 175.89 51.56 130"/>
    <polygon fill="#F6851B" points="145.11 132.67 148.22 60.44 160.67 33.33 95.33 33.33 107.78 60.44 111.11 132.67 112.22 149.56 112.44 197.33 143.56 197.33 143.78 149.56"/>
  </svg>
);

/* ── WalletConnect icon (blue W) ── */
const WalletConnectIcon = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 480 332" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M126.6 93.9c62.6-61.3 164.1-61.3 226.8 0l7.5 7.4c3.1 3.1 3.1 8 0 11.1l-25.8 25.3c-1.6 1.5-4.1 1.5-5.7 0l-10.4-10.2c-43.7-42.8-114.5-42.8-158.2 0l-11.1 10.9c-1.6 1.5-4.1 1.5-5.7 0l-25.8-25.3c-3.1-3.1-3.1-8 0-11.1l8.4-8.1zm280.2 52.2 23 22.5c3.1 3.1 3.1 8 0 11.1l-103.5 101.5c-3.1 3.1-8.2 3.1-11.3 0l-73.5-72c-.8-.8-2-.8-2.8 0l-73.5 72c-3.1 3.1-8.2 3.1-11.3 0L50.3 179.7c-3.1-3.1-3.1-8 0-11.1l23-22.5c3.1-3.1 8.2-3.1 11.3 0l73.5 72c.8.8 2 .8 2.8 0l73.5-72c3.1-3.1 8.2-3.1 11.3 0l73.5 72c.8.8 2 .8 2.8 0l73.5-72c3.2-3 8.3-3 11.3 0z"
      fill="#3B99FC"
    />
  </svg>
);

/* ── Auth Modal (Polymarket-style — email OTP + Google + wallets) ── */
const AuthModal = () => {
  const { isAuthModalOpen, closeAuthModal } = useAuthStore();
  const { connectWallet, connectWalletConnect } = useWallet();
  const { loginWithEmail, loginWithGoogle } = useMagic();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState(null); // 'metamask' | 'walletconnect'

  // Silently capture any stored referral code from URL — passed to backend on signup
  const referralCode = isAuthModalOpen ? (getStoredReferralCode() || '') : '';

  useEffect(() => {
    if (!isAuthModalOpen) {
      setEmail('');
      setIsLoading(false);
      setConnectingWallet(null);
    }
  }, [isAuthModalOpen]);

  const handleGoogle = async () => {
    setIsGoogleLoading(true);
    // Magic redirects the browser to Google; on return the redirect handler completes login
    await loginWithGoogle();
    setIsGoogleLoading(false);
  };

  const handleMetaMask = async () => {
    setConnectingWallet('metamask');
    const success = await connectWallet({ referralCode });
    if (success) {
      clearStoredReferralCode();
      closeAuthModal();
    }
    setConnectingWallet(null);
  };

  const handleWalletConnect = async () => {
    setConnectingWallet('walletconnect');
    const success = await connectWalletConnect({ referralCode });
    if (success) {
      clearStoredReferralCode();
      closeAuthModal();
    }
    setConnectingWallet(null);
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsLoading(true);
    // Magic renders its own secure OTP UI in an overlay
    const ok = await loginWithEmail(email.trim(), { referralCode });
    setIsLoading(false);
    if (ok) closeAuthModal();
  };

  if (!isAuthModalOpen) return null;

  return (
    <AnimatePresence>
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeAuthModal}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-[420px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl z-10 overflow-hidden mx-2"
          >
            <AnimatePresence mode="wait">
              {/* ════ MAIN VIEW ════ */}
              {(
                <motion.div
                  key="main"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, x: -40 }}
                  transition={{ duration: 0.15 }}
                  className="p-5 sm:p-8"
                >
                  {/* Title */}
                  <h2 className="text-2xl font-bold text-center text-[var(--color-text)] mb-7">
                    Welcome to PolyBet365
                  </h2>

                  {/* Google — full-width button (via Magic OAuth) */}
                  <div className="mb-5 w-full">
                    <button
                      type="button"
                      onClick={handleGoogle}
                      disabled={isGoogleLoading}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-full bg-[#4285f4] text-white text-sm font-medium hover:bg-[#3574d4] disabled:opacity-50 transition-colors"
                    >
                      {isGoogleLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Signing in...</span>
                        </>
                      ) : (
                        <>
                          <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
                            <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
                            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
                            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
                          </svg>
                          <span>Continue with Google</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* OR divider */}
                  <div className="relative mb-5">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-[var(--color-border)]" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-[var(--color-surface)] px-4 text-sm text-[var(--color-text-muted)] font-medium">
                        OR
                      </span>
                    </div>
                  </div>

                  {/* Email input + Continue */}
                  <form onSubmit={handleEmailSubmit} className="mb-5">
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-0 sm:rounded-xl sm:border sm:border-[var(--color-border)] sm:overflow-hidden sm:focus-within:border-[var(--color-gold)] sm:focus-within:ring-1 sm:focus-within:ring-[var(--color-gold)] sm:transition-all">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email address"
                        className="flex-1 w-full px-4 py-3 rounded-xl sm:rounded-none border border-[var(--color-border)] sm:border-0 bg-[var(--color-surface2)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none text-sm focus:border-[var(--color-gold)] sm:focus:border-0 transition-colors"
                      />
                      <button
                        type="submit"
                        disabled={isLoading || !email.trim()}
                        className="w-full sm:w-auto px-5 py-3 rounded-xl sm:rounded-none bg-[#4285f4] text-white text-sm font-semibold hover:bg-[#3574d4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0 flex items-center justify-center gap-2"
                      >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Continue'}
                      </button>
                    </div>
                  </form>

                  {/* Wallet icons grid — MetaMask + WalletConnect only */}
                  <div className="grid grid-cols-2 gap-3 mb-6">
                    <button
                      onClick={handleMetaMask}
                      disabled={!!connectingWallet}
                      className="flex items-center justify-center h-14 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface2)] hover:border-[var(--color-gold)]/50 hover:bg-[var(--color-surface2)]/80 transition-all disabled:opacity-50"
                      title="MetaMask"
                    >
                      {connectingWallet === 'metamask' ? (
                        <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
                      ) : (
                        <MetaMaskIcon size={32} />
                      )}
                    </button>
                    <button
                      onClick={handleWalletConnect}
                      disabled={!!connectingWallet}
                      className="flex items-center justify-center h-14 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface2)] hover:border-[#3B99FC]/50 hover:bg-[var(--color-surface2)]/80 transition-all disabled:opacity-50"
                      title="WalletConnect — scan with a wallet app, not phone camera"
                    >
                      {connectingWallet === 'walletconnect' ? (
                        <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
                      ) : (
                        <WalletConnectIcon size={32} />
                      )}
                    </button>
                  </div>

                  {/* WalletConnect scan hint */}
                  <p className="text-[11px] text-[var(--color-text-muted)] text-center mb-6 leading-relaxed">
                    <span className="text-[#3B99FC]">WalletConnect:</span> scan the QR with{' '}
                    <span className="text-[var(--color-text)] font-medium">MetaMask, Trust Wallet, or Rainbow</span> — not your phone camera.
                  </p>

                  {/* Terms + Privacy */}
                  <p className="text-center text-xs text-[var(--color-text-muted)]">
                    By continuing you agree to our{' '}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--color-text)]">Terms</a>
                    <span className="mx-1.5">·</span>
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--color-text)]">Privacy</a>
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AuthModal;
