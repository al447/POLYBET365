import { Magic } from 'magic-sdk';
import { OAuthExtension } from '@magic-ext/oauth2';

// Embedded wallet is configured for the Polygon Amoy testnet, where the
// PolyBet365 escrow + MockUSDT contracts are deployed.
const RPC_URL = import.meta.env.VITE_POLYGON_AMOY_RPC || 'https://polygon-amoy-bor-rpc.publicnode.com';
const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || '80002');
const PUBLISHABLE_KEY = import.meta.env.VITE_MAGIC_PUBLISHABLE_KEY;

let _magic = null;

export const getMagic = () => {
  if (typeof window === 'undefined') return null;
  if (!PUBLISHABLE_KEY) {
    console.warn('[Magic] VITE_MAGIC_PUBLISHABLE_KEY is not set');
    return null;
  }
  if (!_magic) {
    _magic = new Magic(PUBLISHABLE_KEY, {
      extensions: [new OAuthExtension()],
      network: { rpcUrl: RPC_URL, chainId: CHAIN_ID },
    });
  }
  return _magic;
};

export default getMagic;
