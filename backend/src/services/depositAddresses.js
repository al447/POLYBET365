const { ethers } = require('ethers');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const bs58 = require('bs58');
const User = require('../models/User');

let _mnemonic = null;

const getMnemonic = () => {
  if (_mnemonic) return _mnemonic;
  const m = process.env.DEPOSIT_MASTER_MNEMONIC;
  if (!m) {
    console.warn('[DepositAddresses] DEPOSIT_MASTER_MNEMONIC not set — deposit address derivation disabled');
    return null;
  }
  if (!bip39.validateMnemonic(m)) {
    console.error('[DepositAddresses] DEPOSIT_MASTER_MNEMONIC is not a valid BIP39 mnemonic');
    return null;
  }
  _mnemonic = m;
  return _mnemonic;
};

/**
 * Derive the EVM deposit address for a given user index.
 * Uses BIP44 path m/44'/60'/0'/0/{index}
 */
const deriveEvmAddress = (userIndex) => {
  const mnemonic = getMnemonic();
  if (!mnemonic) return null;
  const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${userIndex}`);
  return wallet.address;
};

/**
 * Derive the Solana deposit address for a given user index.
 * Uses BIP44 path m/44'/501'/{index}'/0'
 */
const deriveSolanaAddress = (userIndex) => {
  const mnemonic = getMnemonic();
  if (!mnemonic) return null;
  try {
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const path = `m/44'/501'/${userIndex}'/0'`;
    const { key } = derivePath(path, seed.toString('hex'));
    // Solana public key from ed25519 private key (first 32 bytes = private, derive pub)
    // ed25519-hd-key returns 64-byte keypair; first 32 are private key
    const { PublicKey } = require('@solana/web3.js');
    const nacl = require('tweetnacl');
    const keypair = nacl.sign.keyPair.fromSeed(key);
    const pubkey = new PublicKey(keypair.publicKey);
    return pubkey.toBase58();
  } catch (err) {
    console.error('[DepositAddresses] Solana derivation failed:', err.message);
    return null;
  }
};

// Platform wallet address from environment (all deposits go here)
const PLATFORM_WALLET = process.env.PLATFORM_WALLET || process.env.EVM_DEPOSIT_ADDRESS || null;

/**
 * Get the platform deposit address for crypto transfers.
 * All users send deposits to the same platform wallet address.
 * Returns { evm, solana } — uses platform wallet for EVM, solana address from env if set.
 */
const ensureUserDepositAddresses = async (user) => {
  // Always return platform wallet address for deposits
  // This simplifies tracking - all funds go to one address
  const evm = PLATFORM_WALLET;
  const solana = process.env.SOLANA_DEPOSIT_ADDRESS || null;

  // If user has stored addresses from before, keep them for backwards compatibility
  // but new deposits should use the platform wallet
  if (user.depositAddresses?.evm && !evm) {
    return { evm: user.depositAddresses.evm, solana: user.depositAddresses.solana || solana };
  }

  return { evm, solana };
};

module.exports = { ensureUserDepositAddresses, deriveEvmAddress, deriveSolanaAddress };
