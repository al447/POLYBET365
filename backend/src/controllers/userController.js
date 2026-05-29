const User = require('../models/User');
const Trade = require('../models/Trade');
const Market = require('../models/Market');
const PendingDeposit = require('../models/PendingDeposit');

const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-__v');
    const tradeCount = await Trade.countDocuments({ user: req.user._id });
    const openTrades = await Trade.find({ user: req.user._id, status: 'open' })
      .populate('market', 'outcomes');

    let portfolioValue = 0;
    let totalInvested = 0;
    openTrades.forEach((trade) => {
      if (trade.market && trade.market.outcomes) {
        const outcomeObj = trade.market.outcomes.find(
          (o) => o.name.toLowerCase() === trade.outcome.toLowerCase()
        );
        if (outcomeObj) {
          portfolioValue += trade.shares * (outcomeObj.price / 100);
        }
      }
      totalInvested += trade.amount;
    });

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        walletAddress: user.walletAddress,
        username: user.username,
        avatar: user.avatar,
        balance: user.balance,
        authProvider: user.authProvider,
        createdAt: user.createdAt,
      },
      stats: {
        tradeCount,
        portfolioValue: Math.round(portfolioValue),
        totalInvested,
        totalPnL: Math.round(portfolioValue - totalInvested),
        openPositions: openTrades.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getPositions = async (req, res, next) => {
  try {
    const trades = await Trade.find({ user: req.user._id, status: 'open' })
      .populate('market', 'title slug outcomes categorySlug');

    const positionsMap = {};
    trades.forEach((trade) => {
      const key = `${trade.market._id}-${trade.outcome}`;
      if (!positionsMap[key]) {
        positionsMap[key] = {
          market: trade.market,
          outcome: trade.outcome,
          totalShares: 0,
          totalAmount: 0,
          avgPrice: 0,
          currentPrice: 0,
          currentValue: 0,
          unrealizedPnL: 0,
        };
      }
      positionsMap[key].totalShares += trade.shares;
      positionsMap[key].totalAmount += trade.amount;
    });

    const positions = Object.values(positionsMap).map((pos) => {
      const outcomeObj = pos.market.outcomes?.find(
        (o) => o.name.toLowerCase() === pos.outcome.toLowerCase()
      );
      pos.avgPrice = pos.totalShares > 0 ? pos.totalAmount / pos.totalShares : 0;
      pos.currentPrice = outcomeObj ? outcomeObj.price : 0;
      pos.currentValue = pos.totalShares * (pos.currentPrice / 100);
      pos.unrealizedPnL = pos.currentValue - pos.totalAmount;
      return pos;
    });

    res.json({ success: true, positions });
  } catch (error) {
    next(error);
  }
};

const toggleFavorite = async (req, res, next) => {
  try {
    const { marketId } = req.params;
    const user = await User.findById(req.user._id);
    const market = await Market.findById(marketId);
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });

    const idx = user.favorites.indexOf(marketId);
    let isFavorited;
    if (idx === -1) {
      user.favorites.push(marketId);
      isFavorited = true;
    } else {
      user.favorites.splice(idx, 1);
      isFavorited = false;
    }
    await user.save();
    res.json({ success: true, isFavorited, favorites: user.favorites });
  } catch (error) {
    next(error);
  }
};

const getFavorites = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'favorites',
      populate: { path: 'category', select: 'name slug icon' },
    });
    res.json({ success: true, favorites: user.favorites });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/users/deposit
 * Verify on-chain USDT transfer from user to platform wallet, then credit balance.
 * Frontend sends txHash after user confirms MetaMask transfer.
 */
const deposit = async (req, res, next) => {
  try {
    const { amount, txHash } = req.body;
    const depositAmount = parseFloat(amount);
    if (!depositAmount || depositAmount < 1 || depositAmount > 100000) {
      return res.status(400).json({ success: false, error: 'Amount must be between $1 and $100,000' });
    }

    if (!txHash) {
      return res.status(400).json({ success: false, error: 'Transaction hash is required' });
    }

    // CRITICAL: Reject duplicate txHash — prevents double-credit replay attacks
    const existingDeposit = await PendingDeposit.findOne({ txHash });
    if (existingDeposit) {
      return res.status(409).json({ success: false, error: 'This transaction has already been credited' });
    }

    const user = await User.findById(req.user._id);

    // CRITICAL: Verify the actual USDT transfer on-chain
    let verified = false;
    try {
      const { ethers } = require('ethers');
      // Inline minimal ERC20 ABI (Transfer event) — no external file dependency
      const UsdtABI = [
        'event Transfer(address indexed from, address indexed to, uint256 value)',
        'function balanceOf(address owner) view returns (uint256)',
        'function decimals() view returns (uint8)',
      ];

      const provider = new ethers.JsonRpcProvider(process.env.POLYGON_AMOY_RPC_URL);
      const receipt = await provider.getTransactionReceipt(txHash);
      
      if (!receipt) {
        return res.status(400).json({ success: false, error: 'Transaction not found' });
      }
      
      if (receipt.status !== 1) {
        return res.status(400).json({ success: false, error: 'Transaction failed' });
      }

      // Get the transaction to verify it's a USDT transfer
      const tx = await provider.getTransaction(txHash);
      if (!tx) {
        return res.status(400).json({ success: false, error: 'Transaction details not found' });
      }

      // Verify it's a transfer to the correct USDT contract
      if (tx.to.toLowerCase() !== process.env.MOCK_USDT_ADDRESS.toLowerCase()) {
        return res.status(400).json({ success: false, error: 'Invalid transaction: not a USDT transfer' });
      }

      // Decode the transfer event to verify amount and recipient
      const usdtContract = new ethers.Contract(process.env.MOCK_USDT_ADDRESS, UsdtABI, provider);
      const transferLogs = receipt.logs.filter(log => {
        try {
          const parsed = usdtContract.interface.parseLog(log);
          return parsed.name === 'Transfer';
        } catch {
          return false;
        }
      });

      if (transferLogs.length === 0) {
        console.log('[Deposit] No Transfer events found in logs');
        return res.status(400).json({ success: false, error: 'No USDT transfer found in transaction' });
      }

      // Verify the transfer went to the platform wallet
      const transferLog = transferLogs[0];
      const parsedLog = usdtContract.interface.parseLog(transferLog);
      const from = parsedLog.args[0];
      const to = parsedLog.args[1];
      const value = parsedLog.args[2];

      console.log(`[Deposit] Transfer parsed: from=${from}, to=${to}, value=${value.toString()}`);
      console.log(`[Deposit] Expected platform wallet: ${process.env.PLATFORM_WALLET}`);

      if (!to) {
        console.log('[Deposit] Error: Transfer recipient (to) is undefined');
        return res.status(400).json({ success: false, error: 'Invalid transfer event: recipient undefined' });
      }

      if (!process.env.PLATFORM_WALLET) {
        console.log('[Deposit] Error: PLATFORM_WALLET environment variable not set');
        return res.status(500).json({ success: false, error: 'Server configuration error' });
      }

      if (to.toLowerCase() !== process.env.PLATFORM_WALLET.toLowerCase()) {
        console.log(`[Deposit] Error: Transfer recipient mismatch. Got ${to}, expected ${process.env.PLATFORM_WALLET}`);
        return res.status(400).json({ success: false, error: 'Invalid transfer recipient' });
      }

      // Verify the transfer amount matches (USDT has 6 decimals)
      const expectedAmount = BigInt(Math.floor(depositAmount * 1e6));
      if (value !== expectedAmount) {
        return res.status(400).json({ 
          success: false, 
          error: `Transfer amount mismatch. Expected: ${depositAmount} USDT, Got: ${(Number(value) / 1e6).toFixed(6)} USDT` 
        });
      }

      // Verify the sender is the user (if they have a wallet address linked)
      if (user.walletAddress && from.toLowerCase() !== user.walletAddress.toLowerCase()) {
        return res.status(400).json({ success: false, error: 'Transfer sender does not match your wallet address' });
      }

      verified = true;
      console.log(`[Deposit] Verified USDT transfer: ${depositAmount} USDT from ${from} to ${to}, tx: ${txHash}`);
      
    } catch (e) {
      console.error('[Deposit] Verification error:', e);
      return res.status(400).json({ success: false, error: 'Transaction verification failed: ' + e.message });
    }

    if (!verified) {
      return res.status(400).json({ success: false, error: 'Transaction could not be verified' });
    }

    // Only credit balance after successful verification
    const netAmount = Math.round(depositAmount * 100) / 100;
    user.balance += netAmount;
    await user.save();

    // Record deposit to permanently block txHash replay
    await PendingDeposit.create({
      user: user._id,
      chain: 'polygon',
      token: 'USDT',
      txHash,
      claimedAmountUsd: netAmount,
      status: 'credited',
      source: 'auto-verified',
      creditedAmountUsd: netAmount,
    });

    res.json({
      success: true,
      deposit: {
        amount: depositAmount,
        fee: 0,
        net: netAmount,
        method: 'crypto',
        currency: 'USDT',
        status: 'verified',
        txHash: txHash,
        timestamp: new Date().toISOString(),
      },
      newBalance: user.balance,
    });
  } catch (error) {
    console.error('[Deposit] Error:', error);
    next(error);
  }
};

// Minimal ERC20 ABI — inline so we don't depend on the (deleted) MockUSDT.json file
const ERC20_MIN_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
];

/**
 * POST /api/users/withdraw
 * Transfer USDT from platform wallet to user's wallet address on-chain.
 *
 * Safety design:
 *   1. Atomic balance deduction FIRST (with concurrency guard). User's balance can
 *      never be over-drawn, even with concurrent calls.
 *   2. Pending Transaction record created BEFORE on-chain tx (audit trail).
 *   3. On-chain transfer executed.
 *   4. On success → mark Transaction completed.
 *   5. On failure → refund balance and mark Transaction failed.
 */
const withdraw = async (req, res, next) => {
  try {
    const { amount } = req.body;
    const withdrawAmount = parseFloat(amount);
    if (!withdrawAmount || withdrawAmount < 1) {
      return res.status(400).json({ success: false, error: 'Minimum withdrawal is $1' });
    }
    if (withdrawAmount > 100000) {
      return res.status(400).json({ success: false, error: 'Maximum withdrawal is $100,000' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    if (!user.walletAddress) {
      return res.status(400).json({ success: false, error: 'No wallet address linked to your account' });
    }

    // STEP 1: Atomic balance deduction with concurrency guard.
    // findOneAndUpdate is atomic in Mongo — prevents race conditions on concurrent calls.
    const debited = await User.findOneAndUpdate(
      { _id: user._id, balance: { $gte: withdrawAmount } },
      { $inc: { balance: -withdrawAmount } },
      { new: true }
    );
    if (!debited) {
      return res.status(400).json({
        success: false,
        error: `Insufficient balance. You have $${user.balance.toFixed(2)}`,
      });
    }

    // STEP 2: Create pending Transaction record (audit trail).
    const Transaction = require('../models/Transaction');
    const txRecord = await Transaction.create({
      user: user._id,
      type: 'withdrawal',
      amount: -withdrawAmount,
      balance: debited.balance,
      status: 'pending',
      metadata: { toAddress: user.walletAddress },
    });

    // STEP 3: Attempt on-chain transfer.
    try {
      const { ethers } = require('ethers');

      const rpcUrl = process.env.WITHDRAW_RPC_URL || process.env.POLYGON_AMOY_RPC_URL;
      const tokenAddress = process.env.WITHDRAW_TOKEN_ADDRESS || process.env.MOCK_USDT_ADDRESS;
      const privateKey = process.env.PLATFORM_WALLET_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;

      if (!rpcUrl || !tokenAddress || !privateKey) {
        throw new Error('Withdrawal not configured (missing RPC / token / signer key)');
      }

      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const platformWallet = new ethers.Wallet(privateKey, provider);
      const token = new ethers.Contract(tokenAddress, ERC20_MIN_ABI, platformWallet);

      // Detect token decimals (USDT/USDC = 6, most others = 18)
      let decimals = 6;
      try { decimals = Number(await token.decimals()); } catch { /* fall back to 6 */ }
      const amountWei = ethers.parseUnits(withdrawAmount.toFixed(decimals), decimals);

      // Verify platform liquidity
      const platformBalance = await token.balanceOf(platformWallet.address);
      if (platformBalance < amountWei) {
        throw new Error('Platform liquidity insufficient. Please try a smaller amount or contact support.');
      }

      const tx = await token.transfer(user.walletAddress, amountWei);
      const receipt = await tx.wait();

      // STEP 4: Mark transaction completed.
      txRecord.status = 'completed';
      txRecord.metadata = { ...txRecord.metadata, txHash: receipt.hash };
      await txRecord.save();

      console.log(`[Withdraw] $${withdrawAmount} → ${user.walletAddress}, tx: ${receipt.hash}`);

      return res.json({
        success: true,
        withdrawal: {
          amount: withdrawAmount,
          fee: 0,
          net: withdrawAmount,
          currency: 'USDT',
          toAddress: user.walletAddress,
          txHash: receipt.hash,
          status: 'completed',
          timestamp: new Date().toISOString(),
        },
        newBalance: debited.balance,
      });
    } catch (chainErr) {
      // STEP 5: On-chain failed — REFUND balance and mark transaction failed.
      console.error('[Withdraw] On-chain transfer failed, refunding:', chainErr.message);
      const refunded = await User.findByIdAndUpdate(
        user._id,
        { $inc: { balance: withdrawAmount } },
        { new: true }
      );
      txRecord.status = 'failed';
      txRecord.metadata = { ...txRecord.metadata, error: chainErr.message };
      await txRecord.save();

      const userMsg = chainErr.code === 'INSUFFICIENT_FUNDS'
        ? 'Platform wallet needs gas. Contact admin.'
        : chainErr.message || 'On-chain transfer failed';
      return res.status(500).json({
        success: false,
        error: userMsg,
        newBalance: refunded?.balance ?? debited.balance,
      });
    }
  } catch (error) {
    console.error('[Withdraw] Unexpected error:', error);
    next(error);
  }
};

const getTransactions = async (req, res, next) => {
  try {
    const trades = await Trade.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('market', 'title slug');

    res.json({ success: true, transactions: trades });
  } catch (error) {
    next(error);
  }
};

module.exports = { getProfile, getPositions, toggleFavorite, getFavorites, deposit, withdraw, getTransactions };
