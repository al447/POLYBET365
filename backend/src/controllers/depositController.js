const User = require('../models/User');
const PendingDeposit = require('../models/PendingDeposit');
const { ensureUserDepositAddresses } = require('../services/depositAddresses');
const { getUsdPrice } = require('../services/priceFeed');
const indexer = require('../services/depositIndexer');
const moonpay = require('../services/moonpay');
const { verifyDepositTx, verifyDepositTxAutoDetect } = require('../services/txVerifier');

/* ─────────────────────────────────────────────
   GET /api/deposits/addresses
   Returns { evm, solana } for the authenticated user.
   Lazy-derives and persists if not yet assigned.
───────────────────────────────────────────── */
const getAddresses = async (req, res, next) => {
  try {
    const addresses = await ensureUserDepositAddresses(req.user);
    res.json({ success: true, addresses });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────
   POST /api/deposits/claim
   Body: { chain, token, txHash, amount? }
   Creates a PendingDeposit. If indexer resolves the tx, auto-credits.
───────────────────────────────────────────── */
const claimDeposit = async (req, res, next) => {
  try {
    const { chain, token, txHash, amount } = req.body;
    if (!chain || !token || !txHash) {
      return res.status(400).json({ success: false, error: 'chain, token, and txHash are required' });
    }

    // Prevent duplicate claims on same txHash (case-insensitive)
    const normalizedTxHash = txHash.toLowerCase();
    const existing = await PendingDeposit.findOne({ txHash: normalizedTxHash });
    if (existing) {
      // Allow retry if the previous attempt was rejected
      if (existing.status === 'rejected') {
        await PendingDeposit.deleteOne({ _id: existing._id });
        console.log(`[Deposit] Removed previous rejected attempt for tx ${normalizedTxHash}`);
      } else {
        return res.status(409).json({ 
          success: false, 
          error: existing.status === 'credited' 
            ? 'This deposit has already been credited to your account' 
            : 'This transaction has already been submitted'
        });
      }
    }

    // Get platform deposit address (where funds should have been sent)
    const addresses = await ensureUserDepositAddresses(req.user);
    const expectedRecipient = addresses.evm;
    if (!expectedRecipient) {
      return res.status(500).json({ success: false, error: 'Platform deposit address not configured' });
    }

    // Verify the transaction on-chain
    let verification = await verifyDepositTx({
      chain,
      token,
      txHash: normalizedTxHash,
      expectedRecipient,
    });

    // Fallback: If failed because tx not found on selected chain, try auto-detect
    if (!verification.verified && verification.error?.includes('not found')) {
      console.log(`[Deposit] Tx not found on ${chain}, trying auto-detect...`);
      const autoResult = await verifyDepositTxAutoDetect({
        token,
        txHash: normalizedTxHash,
        expectedRecipient,
      });
      if (autoResult.verified) {
        verification = autoResult;
        console.log(`[Deposit] Auto-detected on chain: ${autoResult.chain}`);
      }
    }

    if (!verification.verified) {
      // Save as rejected with reason
      await PendingDeposit.create({
        user: req.user._id,
        chain,
        token,
        txHash: normalizedTxHash,
        claimedAmountUsd: amount ? parseFloat(amount) : null,
        status: 'rejected',
        source: 'manual',
        notes: verification.error,
      });
      return res.status(400).json({ 
        success: false, 
        error: verification.error || 'Transaction verification failed' 
      });
    }

    // Convert verified amount to USD using price feed
    const price = await getUsdPrice(token);
    const creditedAmountUsd = price ? price * verification.amount : null;

    if (!creditedAmountUsd || creditedAmountUsd <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Could not determine USD value of deposit. Please try again later.' 
      });
    }

    // Atomic credit + record creation (use verified chain in case auto-detect changed it)
    const verifiedChain = verification.chain || chain;
    const deposit = await PendingDeposit.create({
      user: req.user._id,
      chain: verifiedChain,
      token,
      txHash: normalizedTxHash,
      claimedAmountUsd: verification.amount,
      sender: verification.sender,
      status: 'credited',
      creditedAmountUsd,
      source: 'auto-verified',
      reviewedAt: new Date(),
      notes: `Verified on-chain (${verifiedChain}). Block: ${verification.blockNumber}, Confirmations: ${verification.confirmations}`,
    });

    // Credit user balance
    await User.findByIdAndUpdate(req.user._id, { $inc: { balance: creditedAmountUsd } });

    // Write Transaction audit record if model exists
    try {
      const Transaction = require('../models/Transaction');
      await Transaction.create({
        user: req.user._id,
        type: 'deposit',
        amount: creditedAmountUsd,
        method: `${token} on ${chain}`,
        txHash: normalizedTxHash,
        status: 'completed',
      });
    } catch {
      // Transaction model may not exist — non-fatal
    }

    res.json({
      success: true,
      deposit,
      autoCredited: true,
      creditedAmountUsd,
      message: `Deposit verified and credited: ${verification.amount} ${token} (~$${creditedAmountUsd.toFixed(2)})`,
    });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────
   GET /api/deposits/mine
   Returns the authenticated user's deposit history.
───────────────────────────────────────────── */
const getMyDeposits = async (req, res, next) => {
  try {
    const deposits = await PendingDeposit.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ success: true, deposits });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────
   GET /api/deposits/admin/list?status=pending&page=1&limit=20
───────────────────────────────────────────── */
const adminList = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;

    const total = await PendingDeposit.countDocuments(filter);
    const deposits = await PendingDeposit.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('user', 'username email walletAddress')
      .populate('reviewedBy', 'username')
      .lean();

    res.json({ success: true, deposits, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────
   GET /api/deposits/admin/stats
───────────────────────────────────────────── */
const adminStats = async (req, res, next) => {
  try {
    const [pending, credited24h, allCredited] = await Promise.all([
      PendingDeposit.countDocuments({ status: 'pending' }),
      PendingDeposit.countDocuments({
        status: 'credited',
        reviewedAt: { $gte: new Date(Date.now() - 86400_000) },
      }),
      PendingDeposit.aggregate([
        { $match: { status: 'credited' } },
        { $group: { _id: null, total: { $sum: '$creditedAmountUsd' } } },
      ]),
    ]);

    res.json({
      success: true,
      stats: {
        pending,
        credited24h,
        totalCredited: allCredited[0]?.total || 0,
      },
    });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────
   GET /api/deposits/admin/:id/price-suggestion
   Returns a CoinGecko-based suggested USD value.
───────────────────────────────────────────── */
const priceSuggestion = async (req, res, next) => {
  try {
    const deposit = await PendingDeposit.findById(req.params.id);
    if (!deposit) return res.status(404).json({ success: false, error: 'Deposit not found' });

    const price = await getUsdPrice(deposit.token);
    const suggestedUsd = price && deposit.claimedAmountUsd ? price * deposit.claimedAmountUsd : null;

    res.json({ success: true, tokenPrice: price, suggestedUsd, claimedAmountUsd: deposit.claimedAmountUsd });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────
   POST /api/deposits/admin/:id/credit
   Body: { amountUsd }
───────────────────────────────────────────── */
const adminCredit = async (req, res, next) => {
  try {
    const { amountUsd } = req.body;
    if (!amountUsd || isNaN(amountUsd) || amountUsd <= 0) {
      return res.status(400).json({ success: false, error: 'Valid amountUsd is required' });
    }

    const deposit = await PendingDeposit.findById(req.params.id).populate('user');
    if (!deposit) return res.status(404).json({ success: false, error: 'Deposit not found' });
    if (deposit.status === 'credited') return res.status(409).json({ success: false, error: 'Already credited' });

    // Credit user balance
    const creditAmount = parseFloat(amountUsd);
    await User.findByIdAndUpdate(deposit.user._id, { $inc: { balance: creditAmount } });

    // Update deposit record
    deposit.status = 'credited';
    deposit.creditedAmountUsd = creditAmount;
    deposit.reviewedBy = req.user._id;
    deposit.reviewedAt = new Date();
    await deposit.save();

    // Write Transaction audit record if model exists
    try {
      const Transaction = require('../models/Transaction');
      await Transaction.create({
        user: deposit.user._id,
        type: 'deposit',
        amount: creditAmount,
        method: `${deposit.token} on ${deposit.chain}`,
        txHash: deposit.txHash || null,
        status: 'completed',
      });
    } catch {
      // Transaction model may not exist — non-fatal
    }

    res.json({ success: true, deposit, newBalance: deposit.user.balance + creditAmount });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────
   POST /api/deposits/admin/:id/reject
   Body: { reason }
───────────────────────────────────────────── */
const adminReject = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const deposit = await PendingDeposit.findById(req.params.id);
    if (!deposit) return res.status(404).json({ success: false, error: 'Deposit not found' });
    if (deposit.status === 'credited') return res.status(409).json({ success: false, error: 'Already credited — cannot reject' });

    deposit.status = 'rejected';
    deposit.notes = reason || '';
    deposit.reviewedBy = req.user._id;
    deposit.reviewedAt = new Date();
    await deposit.save();

    res.json({ success: true, deposit });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────
   POST /api/deposits/moonpay/sign
   Body: { amountUsd, paymentMethod }
   Returns signed/unsigned MoonPay widget URL
───────────────────────────────────────────── */
const moonpaySign = async (req, res, next) => {
  try {
    const { amountUsd, paymentMethod } = req.body;

    if (!amountUsd || isNaN(amountUsd) || amountUsd < 20) {
      return res.status(400).json({ success: false, error: 'Minimum deposit is $20' });
    }

    const validMethods = ['credit_debit_card', 'apple_pay', 'google_pay', 'revolut_pay'];
    if (!validMethods.includes(paymentMethod)) {
      return res.status(400).json({ success: false, error: 'Invalid payment method' });
    }

    // Ensure user has deposit addresses
    const user = req.user;
    if (!user.depositAddresses?.evm) {
      await ensureUserDepositAddresses(user);
    }

    const { url, signed, externalTxId } = moonpay.buildBuyUrl({
      user,
      amountUsd: parseFloat(amountUsd),
      paymentMethod,
    });

    // Pre-create pending deposit record (status: waitingPayment)
    await PendingDeposit.create({
      user: user._id,
      chain: 'polygon',
      token: 'USDC',
      claimedAmountUsd: parseFloat(amountUsd),
      provider: 'moonpay',
      providerTxId: externalTxId,
      providerStatus: 'waitingPayment',
      status: 'pending',
      source: 'moonpay',
    });

    res.json({ success: true, url, signed, externalTxId });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────
   POST /api/deposits/moonpay/webhook
   Raw body, HMAC verified
   Handles transaction_updated / transaction_completed
───────────────────────────────────────────── */
const moonpayWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['moonpay-signature-v2'];
    const rawBody = req.rawBody;

    // Verify signature
    if (!moonpay.verifyWebhookSignature(rawBody, signature)) {
      console.warn('MoonPay webhook signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    const { data } = payload;

    if (!data || !data.externalTransactionId) {
      return res.status(400).json({ error: 'Missing externalTransactionId' });
    }

    // Find pending deposit by providerTxId
    const deposit = await PendingDeposit.findOne({
      providerTxId: data.externalTransactionId,
    });

    if (!deposit) {
      console.warn('MoonPay webhook: no matching deposit', data.externalTransactionId);
      return res.status(200).json({ received: true, matched: false });
    }

    // Update provider status and payload
    deposit.providerStatus = data.status;
    deposit.providerPayload = payload;

    // On completion, credit user balance
    if (data.status === 'completed' && deposit.status !== 'credited') {
      const usdcAmount = data.quoteCurrencyAmount || deposit.claimedAmountUsd;
      deposit.creditedAmountUsd = usdcAmount;
      deposit.status = 'credited';
      deposit.reviewedAt = new Date();

      // Credit user balance atomically
      await User.findByIdAndUpdate(deposit.user, {
        $inc: { balance: usdcAmount },
      });

      // Write Transaction audit record if model exists
      try {
        const Transaction = require('../models/Transaction');
        await Transaction.create({
          user: deposit.user,
          type: 'deposit',
          amount: usdcAmount,
          method: 'MoonPay USDC on Polygon',
          txHash: data.cryptoTransactionId || null,
          status: 'completed',
        });
      } catch {
        // Transaction model may not exist — non-fatal
      }
    }

    // On failure/rejection
    if (['failed', 'rejected'].includes(data.status) && deposit.status === 'pending') {
      deposit.status = 'rejected';
      deposit.notes = data.failureReason || 'MoonPay transaction failed';
    }

    await deposit.save();

    res.json({ received: true, matched: true, credited: deposit.status === 'credited' });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────
   POST /api/deposits/moonpay/simulate-payment
   Test mode only - Simulates a successful MoonPay payment
   Body: { externalTxId, cardNumber, expiry, cvc }
   Completes the deposit and credits user balance
───────────────────────────────────────────── */
const moonpaySimulatePayment = async (req, res, next) => {
  try {
    // Only allow in sandbox mode
    if (process.env.MOONPAY_ENV !== 'sandbox') {
      return res.status(403).json({ success: false, error: 'Simulation only available in sandbox mode' });
    }

    const { externalTxId, cardNumber, expiry, cvc } = req.body;

    if (!externalTxId) {
      return res.status(400).json({ success: false, error: 'Missing externalTxId' });
    }

    // Basic card validation
    const cardNum = cardNumber?.replace(/\s/g, '');
    if (!cardNum || cardNum.length < 13) {
      return res.status(400).json({ success: false, error: 'Invalid card number' });
    }

    // Find the pending deposit
    const deposit = await PendingDeposit.findOne({
      providerTxId: externalTxId,
      user: req.user._id,
    });

    if (!deposit) {
      return res.status(404).json({ success: false, error: 'Deposit not found. Please restart the payment flow.' });
    }

    if (deposit.status === 'credited') {
      return res.status(400).json({ success: false, error: 'Payment already processed' });
    }

    // Simulate processing delay (like real MoonPay)
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Calculate USDC amount (approximate fee deduction)
    const feePercent = 4.5;
    const feeUsd = (deposit.claimedAmountUsd * feePercent) / 100;
    const usdcAmount = Math.max(0, deposit.claimedAmountUsd - feeUsd);

    // Update deposit as completed
    deposit.providerStatus = 'completed';
    deposit.creditedAmountUsd = usdcAmount;
    deposit.status = 'credited';
    deposit.reviewedAt = new Date();
    deposit.providerPayload = {
      simulation: true,
      cardLast4: cardNum.slice(-4),
      processedAt: new Date().toISOString(),
    };
    await deposit.save();

    // Credit user balance
    await User.findByIdAndUpdate(deposit.user, {
      $inc: { balance: usdcAmount },
    });

    // Create transaction record
    try {
      const Transaction = require('../models/Transaction');
      await Transaction.create({
        user: deposit.user,
        type: 'deposit',
        amount: usdcAmount,
        method: 'MoonPay Card (Test)',
        status: 'completed',
        metadata: {
          externalTxId,
          originalAmount: deposit.claimedAmountUsd,
          fee: feeUsd,
        },
      });
    } catch {
      // Transaction model may not exist — non-fatal
    }

    res.json({
      success: true,
      message: 'Test payment successful',
      deposit: {
        id: deposit._id,
        amountUsd: deposit.claimedAmountUsd,
        usdcReceived: usdcAmount,
        fee: feeUsd,
        status: 'credited',
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAddresses,
  claimDeposit,
  getMyDeposits,
  adminList,
  adminStats,
  priceSuggestion,
  adminCredit,
  adminReject,
  moonpaySign,
  moonpayWebhook,
  moonpaySimulatePayment,
};
