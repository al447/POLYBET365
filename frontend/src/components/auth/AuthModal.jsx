import { useState, useRef, useEffect } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { Loader2, ArrowLeft, Gift, Check, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useAuthStore from '../../store/authStore';
import useWallet from '../../hooks/useWallet';
import { authAPI, referralAPI } from '../../services/api';
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

/* ── Email OTP Input ── */
const OtpInput = ({ length = 6, value, onChange }) => {
  const refs = useRef([]);

  const handleChange = (idx, char) => {
    if (!/^\d?$/.test(char)) return;
    const arr = value.split('');
    arr[idx] = char;
    const next = arr.join('').slice(0, length);
    onChange(next);
    if (char && idx < length - 1) refs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !value[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    onChange(text);
    refs.current[Math.min(text.length, length - 1)]?.focus();
  };

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="w-11 h-13 text-center text-xl font-semibold rounded-xl border border-[var(--color-border)] bg-[var(--color-surface2)] text-[var(--color-text)] focus:border-[var(--color-gold)] focus:ring-1 focus:ring-[var(--color-gold)] outline-none transition-colors"
        />
      ))}
    </div>
  );
};

/* ── Auth Modal (Polymarket-style — exact match) ── */
const AuthModal = () => {
  const { isAuthModalOpen, closeAuthModal, setAuth } = useAuthStore();
  const { connectWallet, connectWalletConnect, isConnecting } = useWallet();
  const [view, setView] = useState('main'); // main | email | otp
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState(null); // 'metamask' | 'walletconnect'
  const [referralCode, setReferralCode] = useState('');
  const [referralValid, setReferralValid] = useState(null); // null | { valid, referrerUsername }
  const [validatingReferral, setValidatingReferral] = useState(false);
  const googleBtnRef = useRef(null);
  const [googleBtnWidth, setGoogleBtnWidth] = useState(356);

  // Measure container width for Google button
  useEffect(() => {
    const measure = () => {
      if (googleBtnRef.current) {
        setGoogleBtnWidth(googleBtnRef.current.offsetWidth);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isAuthModalOpen]);

  // Load stored referral code on open
  useEffect(() => {
    if (isAuthModalOpen) {
      const stored = getStoredReferralCode();
      if (stored) {
        setReferralCode(stored);
        validateReferral(stored);
      }
    }
  }, [isAuthModalOpen]);

  // Validate referral code with debounce
  const validateReferral = async (code) => {
    if (!code || code.length < 4) {
      setReferralValid(null);
      return;
    }
    setValidatingReferral(true);
    try {
      const { data } = await referralAPI.validate(code);
      setReferralValid(data);
    } catch (err) {
      setReferralValid({ valid: false, error: err.response?.data?.error });
    }
    setValidatingReferral(false);
  };

  useEffect(() => {
    if (!isAuthModalOpen) {
      setView('main');
      setEmail('');
      setOtp('');
      setIsLoading(false);
      setConnectingWallet(null);
      setReferralCode('');
      setReferralValid(null);
    }
  }, [isAuthModalOpen]);

  const handleGoogleSuccess = async (credentialResponse) => {
    setIsGoogleLoading(true);
    try {
      const { data } = await authAPI.googleAuth(credentialResponse.credential, referralCode);
      if (data.success) {
        setAuth(data.user, data.token);
        toast.success(`Welcome, ${data.user.username || data.user.email}!`);
        clearStoredReferralCode();
        closeAuthModal();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Google sign-in failed');
    }
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
    try {
      const { data } = await authAPI.sendEmailCode(email.trim());
      if (data.success) {
        setView('otp');
        toast.success('Verification code sent to your email');
      } else {
        toast.error(data.error || 'Failed to send code');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send verification code');
    }
    setIsLoading(false);
  };

  const handleOtpVerify = async () => {
    if (otp.length < 6) return;
    setIsLoading(true);
    try {
      const { data } = await authAPI.verifyEmailCode(email.trim(), otp, referralCode);
      if (data.success) {
        setAuth(data.user, data.token);
        toast.success(`Welcome, ${data.user.username || data.user.email}!`);
        clearStoredReferralCode();
        closeAuthModal();
      } else {
        toast.error(data.error || 'Verification failed');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Verification failed');
    }
    setIsLoading(false);
  };

  const handleResendCode = async () => {
    try {
      const { data } = await authAPI.sendEmailCode(email.trim());
      if (data.success) {
        toast.success('New code sent!');
        setOtp('');
      } else {
        toast.error(data.error || 'Failed to resend code');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to resend code');
    }
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
              {view === 'main' && (
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

                  {/* Google — full-width blue button */}
                  <div className="mb-5 w-full" ref={googleBtnRef}>
                    {isGoogleLoading ? (
                      <div className="w-full flex items-center justify-center gap-2 py-3.5 rounded-full bg-[#4285f4] text-white">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm font-medium">Signing in...</span>
                      </div>
                    ) : (
                      <GoogleLogin
                        onSuccess={handleGoogleSuccess}
                        onError={() => toast.error('Google sign-in failed')}
                        theme="filled_blue"
                        shape="pill"
                        text="continue_with"
                        width={googleBtnWidth}
                      />
                    )}
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
                  <p className="text-[11px] text-[var(--color-text-muted)] text-center mb-5 leading-relaxed">
                    <span className="text-[#3B99FC]">WalletConnect:</span> scan the QR with{' '}
                    <span className="text-[var(--color-text)] font-medium">MetaMask, Trust Wallet, or Rainbow</span> mobile app — your phone camera will not work.
                  </p>

                  {/* Referral code input */}
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Gift className="w-4 h-4 text-[var(--color-gold)]" />
                      <span className="text-xs text-[var(--color-text-muted)]">Have a referral code? (Optional)</span>
                    </div>
                    <div className="flex gap-0 rounded-xl border border-[var(--color-border)] overflow-hidden focus-within:border-[var(--color-gold)] focus-within:ring-1 focus-within:ring-[var(--color-gold)] transition-all">
                      <input
                        type="text"
                        value={referralCode}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
                          setReferralCode(val);
                          validateReferral(val);
                        }}
                        placeholder="Enter code (e.g., ABC123)"
                        className="flex-1 px-4 py-2.5 bg-[var(--color-surface2)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none text-sm uppercase"
                      />
                      {validatingReferral ? (
                        <Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-muted)] m-2.5" />
                      ) : referralValid?.valid ? (
                        <div className="flex items-center gap-1 px-3 text-emerald-400">
                          <Check className="w-4 h-4" />
                          <span className="text-xs">Valid</span>
                        </div>
                      ) : referralValid?.valid === false && referralCode.length >= 4 ? (
                        <div className="flex items-center gap-1 px-3 text-red-400">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-xs">Invalid</span>
                        </div>
                      ) : null}
                    </div>
                    {referralValid?.valid && referralValid.referrerUsername && (
                      <p className="text-xs text-emerald-400 mt-1.5">
                        You were invited by {referralValid.referrerUsername}
                      </p>
                    )}
                  </div>

                  {/* Terms + Privacy */}
                  <p className="text-center text-xs text-[var(--color-text-muted)]">
                    <span className="underline cursor-pointer hover:text-[var(--color-text)]">Terms</span>
                    <span className="mx-2">·</span>
                    <span className="underline cursor-pointer hover:text-[var(--color-text)]">Privacy</span>
                  </p>
                </motion.div>
              )}

              {/* ════ OTP VIEW ════ */}
              {view === 'otp' && (
                <motion.div
                  key="otp"
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -40 }}
                  transition={{ duration: 0.15 }}
                  className="p-8"
                >
                  <button
                    onClick={() => { setView('main'); setOtp(''); }}
                    className="flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] mb-6 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>

                  <div className="text-center mb-6">
                    <h2 className="text-lg font-bold text-[var(--color-text)]">Enter verification code</h2>
                    <p className="text-sm text-[var(--color-text-muted)] mt-1">
                      Sent to <span className="text-[var(--color-text)] font-medium">{email}</span>
                    </p>
                  </div>

                  <div className="space-y-5">
                    <OtpInput value={otp} onChange={setOtp} />

                    <button
                      onClick={handleOtpVerify}
                      disabled={isLoading || otp.length < 6}
                      className="w-full py-3 rounded-xl bg-[#4285f4] text-white font-semibold text-sm hover:bg-[#3574d4] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        'Verify'
                      )}
                    </button>

                    <button
                      onClick={handleResendCode}
                      className="w-full text-center text-sm text-[var(--color-text-muted)] hover:text-[#4285f4] transition-colors"
                    >
                      Didn't receive the code? <span className="font-medium underline">Resend</span>
                    </button>
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

export default AuthModal;
