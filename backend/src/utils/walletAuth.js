const { ethers } = require('ethers');

// Max age of a signature before it's considered expired (5 minutes)
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

// In-memory store of used signatures (prevents replay within validity window)
// Auto-cleans entries older than SIGNATURE_MAX_AGE_MS
// ⚠️  SCALE NOTE (M2): This Map is process-local — it is lost on restart and not shared
// across multiple backend instances. For multi-instance deployments, replace with
// Redis: `await redis.set(sig, '1', 'EX', 300)` + `await redis.exists(sig)`.
const usedSignatures = new Map();

const cleanupUsedSignatures = () => {
  const now = Date.now();
  for (const [sig, ts] of usedSignatures.entries()) {
    if (now - ts > SIGNATURE_MAX_AGE_MS) {
      usedSignatures.delete(sig);
    }
  }
};

// Cleanup every minute
setInterval(cleanupUsedSignatures, 60 * 1000);

/**
 * Verify wallet signature with replay protection.
 * Expected message format:
 *   "Sign in to PolyBet365\nAddress: 0x...\nTimestamp: <ms>"
 * 
 * @returns {string|null} recovered address (lowercase) if valid, null otherwise
 */
const verifyWalletSignature = (message, signature) => {
  try {
    // 1. Recover address from signature
    const recoveredAddress = ethers.verifyMessage(message, signature);

    // 2. Extract timestamp from message
    const timestampMatch = message.match(/Timestamp:\s*(\d+)/);
    if (!timestampMatch) {
      console.warn('[WalletAuth] Message missing timestamp');
      return null;
    }

    const timestamp = parseInt(timestampMatch[1], 10);
    const now = Date.now();
    const age = now - timestamp;

    // 3. Reject if timestamp is in the future (clock skew > 30s) or expired
    if (age < -30 * 1000) {
      console.warn('[WalletAuth] Signature timestamp is in the future');
      return null;
    }
    if (age > SIGNATURE_MAX_AGE_MS) {
      console.warn(`[WalletAuth] Signature expired (age: ${Math.floor(age / 1000)}s)`);
      return null;
    }

    // 4. Replay protection - reject if this exact signature was used before
    if (usedSignatures.has(signature)) {
      console.warn('[WalletAuth] Signature replay detected');
      return null;
    }

    // 5. Mark signature as used
    usedSignatures.set(signature, now);

    return recoveredAddress.toLowerCase();
  } catch (error) {
    console.error('[WalletAuth] Signature verification failed:', error.message);
    return null;
  }
};

module.exports = { verifyWalletSignature, SIGNATURE_MAX_AGE_MS };
