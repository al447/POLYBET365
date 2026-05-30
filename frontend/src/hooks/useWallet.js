import { useState } from 'react';
import { ethers } from 'ethers';
import { authAPI } from '../services/api';
import useAuthStore from '../store/authStore';
import toast from 'react-hot-toast';

// Shared: detect an injected Web3 provider (MetaMask / Rabby / Phantom EVM)
export const getInjectedProvider = () => {
  if (typeof window === 'undefined') return null;
  if (window.ethereum) return window.ethereum;
  if (window.rabby) return window.rabby;
  if (window.phantom?.ethereum) return window.phantom.ethereum;
  return null;
};

const useWallet = () => {
  const [isConnecting, setIsConnecting] = useState(false);
  const { setAuth } = useAuthStore();

  const connectWallet = async ({ referralCode } = {}) => {
    const injected = getInjectedProvider();
    if (!injected) {
      toast.error('No wallet detected. Please install MetaMask or another Web3 wallet.');
      window.open('https://metamask.io/download/', '_blank');
      return false;
    }
    setIsConnecting(true);
    try {
      // 1. Revoke any existing permissions to force fresh connection
      try {
        await injected.request({
          method: 'wallet_revokePermissions',
          params: [{ eth_accounts: {} }],
        });
      } catch {
        // Older MetaMask versions don't support revoke — ignore
      }

      // 2. Request permissions (forces account picker popup)
      try {
        await injected.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }],
        });
      } catch (permErr) {
        if (permErr.code === 4001) throw permErr; // user rejected
        await injected.request({ method: 'eth_requestAccounts' });
      }

      // 3. Explicitly get the currently selected account (not from cached signer)
      const accounts = await injected.request({ method: 'eth_accounts' });
      if (!accounts?.length) {
        toast.error('No account selected in MetaMask');
        setIsConnecting(false);
        return false;
      }
      const selectedAccount = accounts[0];
      console.log('[Wallet] User selected:', selectedAccount);

      // 4. Create provider
      const provider = new ethers.BrowserProvider(injected);
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();
      console.log('[Wallet] Signer address:', signerAddress);

      // 5. Verify signer matches the selected account (catches stale state)
      if (signerAddress.toLowerCase() !== selectedAccount.toLowerCase()) {
        console.error('[Wallet] Address mismatch!', { selectedAccount, signerAddress });
        toast.error('Account mismatch detected. Please reload and try again.');
        setIsConnecting(false);
        return false;
      }

      const walletAddress = signerAddress;
      const timestamp = Date.now();
      const message = `Sign in to PolyBet365\nAddress: ${walletAddress}\nTimestamp: ${timestamp}`;

      console.log('[Wallet] Requesting signature for', walletAddress);
      const signature = await signer.signMessage(message);
      console.log('[Wallet] Signature received, authenticating...');

      const { data } = await authAPI.walletAuth({ walletAddress, signature, message, referralCode });
      console.log('[Wallet] Auth response:', data.success, data.error || '');

      if (data.success) {
        setAuth(data.user, data.token, data.refreshToken, data.isNewUser === true);
        toast.success('Wallet connected!');
        setIsConnecting(false);
        return true;
      } else {
        toast.error(data.error || 'Authentication failed');
      }
    } catch (err) {
      console.error('[Wallet] Connection error:', err.code, err.message, err);
      if (err.code === 'ACTION_REJECTED' || err.code === 4001 || err?.info?.error?.code === 4001) {
        toast.error('Connection rejected by user');
      } else if (err.code === -32002) {
        toast.error('MetaMask is busy. Please open MetaMask and approve the pending request.');
      } else if (err.response?.data?.error) {
        toast.error(err.response.data.error);
      } else if (err.message?.includes('user rejected')) {
        toast.error('Connection rejected by user');
      } else {
        toast.error(`Wallet error: ${err.shortMessage || err.message || 'Unknown error'}`);
      }
    }
    setIsConnecting(false);
    return false;
  };

  const connectWalletConnect = async ({ referralCode } = {}) => {
    setIsConnecting(true);
    try {
      const { initWeb3Modal, getWeb3ModalInstance } = await import('../lib/web3modal');
      const modal = (await initWeb3Modal()) || getWeb3ModalInstance();
      if (!modal) {
        toast.error('WalletConnect not configured. Set VITE_WALLETCONNECT_PROJECT_ID in .env');
        setIsConnecting(false);
        return false;
      }

      // Open Web3Modal — opens directly to WalletConnect QR since all other wallet types are disabled
      await modal.open();

      // Wait for provider via subscribeProvider (event-driven)
      const walletProvider = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          unsubscribe?.();
          reject(new Error('Connection timeout'));
        }, 180000); // 3 min

        let closeCheck; // store reference for cleanup

        // Wait for modal to actually open before checking for close
        const closeCheckDelay = setTimeout(() => {
          closeCheck = setInterval(() => {
            const state = modal.getState();
            if (!state?.open && !modal.getIsConnected()) {
              clearInterval(closeCheck);
              clearTimeout(timeout);
              unsubscribe?.();
              reject(new Error('Modal closed by user'));
            }
          }, 500);
        }, 1000); // 1 second delay to let modal fully open
        const unsubscribe = modal.subscribeProvider(({ provider, isConnected }) => {
          if (isConnected && provider) {
            clearTimeout(timeout);
            clearTimeout(closeCheckDelay);
            clearInterval(closeCheck);
            unsubscribe?.();
            resolve(provider);
          }
        });

        // Check if already connected
        if (modal.getIsConnected()) {
          const p = modal.getWalletProvider();
          if (p) {
            clearTimeout(timeout);
            clearTimeout(closeCheckDelay);
            clearInterval(closeCheck);
            unsubscribe?.();
            resolve(p);
          }
        }
      });

      if (!walletProvider) {
        toast.error('Failed to get wallet provider. Please try again.');
        setIsConnecting(false);
        return false;
      }

      // Close modal once connected
      try { modal.close(); } catch {}

      // Build ethers provider from WC provider
      const provider = new ethers.BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const walletAddress = await signer.getAddress();
      console.log('[WalletConnect] Connected:', walletAddress);

      // Sign authentication message
      const timestamp = Date.now();
      const message = `Sign in to PolyBet365\nAddress: ${walletAddress}\nTimestamp: ${timestamp}`;

      console.log('[WalletConnect] Requesting signature...');
      const signature = await signer.signMessage(message);
      console.log('[WalletConnect] Signature received, authenticating...');

      const { data } = await authAPI.walletAuth({ walletAddress, signature, message, referralCode });

      if (data.success) {
        setAuth(data.user, data.token, data.refreshToken, data.isNewUser === true);
        toast.success('Wallet connected via WalletConnect!');
        setIsConnecting(false);
        return true;
      } else {
        toast.error(data.error || 'Authentication failed');
      }
    } catch (err) {
      console.error('[WalletConnect] Error:', err);
      if (err.message?.includes('closed by user') || err.message?.includes('Modal closed')) {
        toast.error('Connection cancelled');
      } else if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
        toast.error('Signature rejected by user');
      } else if (err.message?.includes('timeout')) {
        toast.error('Connection timeout. Please try again.');
      } else {
        toast.error(err.shortMessage || err.message || 'WalletConnect failed');
      }
    }
    setIsConnecting(false);
    return false;
  };

  return { connectWallet, connectWalletConnect, isConnecting };
};

export default useWallet;
