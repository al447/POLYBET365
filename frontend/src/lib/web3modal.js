import { createWeb3Modal, defaultConfig } from '@web3modal/ethers/react';

const CHAIN_ID = parseInt(import.meta.env.VITE_POLYGON_MAINNET_CHAIN_ID || '137', 10);
const POLYGON_RPC = import.meta.env.VITE_POLYGON_RPC || 'https://polygon-rpc.com';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

const metadata = {
  name: 'PolyBet365',
  description: 'Prediction market platform - works on any network',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://polybet365.com',
  icons: [typeof window !== 'undefined' ? `${window.location.origin}/logo.png` : ''],
};

// Polygon Mainnet chain configuration
const polygonMainnet = {
  chainId: CHAIN_ID,
  name: 'Polygon',
  currency: 'MATIC',
  explorerUrl: 'https://polygonscan.com',
  rpcUrl: POLYGON_RPC,
};

// IMPORTANT: Disable injected, coinbase, and email to show ONLY WalletConnect QR
const ethersConfig = defaultConfig({
  metadata,
  enableEIP6963: false,    // Disable browser extension wallets (MetaMask, etc.)
  enableInjected: false,   // Disable window.ethereum detection
  enableCoinbase: false,   // Disable Coinbase wallet
  rpcUrl: POLYGON_RPC,
  defaultChainId: CHAIN_ID,
});

let modal = null;

export function initWeb3Modal() {
  if (modal) return modal;
  if (!projectId || projectId === 'placeholder_walletconnect_project_id') {
    console.warn('[Web3Modal] No WalletConnect project ID configured');
    return null;
  }
  modal = createWeb3Modal({
    ethersConfig,
    chains: [polygonMainnet],
    projectId,
    themeMode: 'dark',
    themeVariables: {
      '--w3m-accent': '#d4a853',
      '--w3m-border-radius-master': '2px',
    },
    // Hide all wallet recommendations - only show WalletConnect QR
    featuredWalletIds: [],
    includeWalletIds: [],
    excludeWalletIds: [],
    allWallets: 'HIDE',           // Hide "All wallets" button
    enableAnalytics: false,
    enableOnramp: false,           // Disable buy crypto
    enableEmail: false,            // Disable email login
    enableSwaps: false,            // Disable swap feature
  });
  console.log('[Web3Modal] Initialized - Polygon Mainnet');
  return modal;
}

export function getWeb3ModalInstance() {
  return modal;
}
