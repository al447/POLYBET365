import { useState } from 'react';
import { getMagic } from '../lib/magic';
import { authAPI } from '../services/api';
import useAuthStore from '../store/authStore';
import { clearStoredReferralCode, getStoredReferralCode } from '../lib/referralCapture';
import toast from 'react-hot-toast';

const useMagic = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { setAuth } = useAuthStore();

  // Exchange a Magic DID token for our own JWT session
  const authenticateWithBackend = async (didToken, referralCode) => {
    const { data } = await authAPI.magicAuth(didToken, referralCode);
    if (data.success) {
      setAuth(data.user, data.token, data.refreshToken, data.isNewUser === true);
      toast.success(`Welcome, ${data.user.username || data.user.email}!`);
      clearStoredReferralCode();
      return true;
    }
    toast.error(data.error || 'Authentication failed');
    return false;
  };

  // Email login — Magic renders its own secure OTP UI
  const loginWithEmail = async (email, { referralCode } = {}) => {
    const magic = getMagic();
    if (!magic) {
      toast.error('Magic is not configured. Set VITE_MAGIC_PUBLISHABLE_KEY.');
      return false;
    }
    setIsLoading(true);
    try {
      await magic.auth.loginWithEmailOTP({ email });
      const didToken = await magic.user.getIdToken();
      const ok = await authenticateWithBackend(didToken, referralCode);
      setIsLoading(false);
      return ok;
    } catch (err) {
      console.error('[Magic] Email login error:', err);
      if (err?.code === -32603 || /user.*denied|cancel/i.test(err?.message || '')) {
        toast.error('Login cancelled');
      } else {
        toast.error(err?.message || 'Email login failed');
      }
      setIsLoading(false);
      return false;
    }
  };

  // Google social login — redirect-based OAuth
  const loginWithGoogle = async () => {
    const magic = getMagic();
    if (!magic) {
      toast.error('Magic is not configured. Set VITE_MAGIC_PUBLISHABLE_KEY.');
      return false;
    }
    try {
      // Persist referral code before redirect so it survives the OAuth round-trip
      const pendingRef = getStoredReferralCode();
      if (pendingRef) sessionStorage.setItem('pb365_pending_referral', pendingRef);

      await magic.oauth2.loginWithRedirect({
        provider: 'google',
        redirectURI: window.location.origin,
      });
      return true; // browser redirects away
    } catch (err) {
      console.error('[Magic] Google login error:', err);
      toast.error(err?.message || 'Google login failed');
      return false;
    }
  };

  // Complete OAuth flow after redirect back to the app
  const handleOAuthRedirect = async () => {
    const magic = getMagic();
    if (!magic) return false;
    try {
      const result = await magic.oauth2.getRedirectResult();
      const didToken = result?.magic?.idToken;
      if (!didToken) return false;
      // Recover any referral code saved before the OAuth redirect
      const referralCode = sessionStorage.getItem('pb365_pending_referral') || undefined;
      sessionStorage.removeItem('pb365_pending_referral');
      return await authenticateWithBackend(didToken, referralCode);
    } catch {
      // No pending OAuth redirect — normal page load
      return false;
    }
  };

  const logoutMagic = async () => {
    const magic = getMagic();
    if (!magic) return;
    try {
      const isLoggedIn = await magic.user.isLoggedIn();
      if (isLoggedIn) await magic.user.logout();
    } catch {
      /* ignore */
    }
  };

  return { isLoading, loginWithEmail, loginWithGoogle, handleOAuthRedirect, logoutMagic };
};

export default useMagic;
