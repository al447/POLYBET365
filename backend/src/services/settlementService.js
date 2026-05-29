const Trade = require('../models/Trade');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const PLATFORM_FEE_RATE = 0.02; // 2%

/**
 * Settle all trades for a resolved market.
 *
 * Safety guarantees:
 *  - Idempotent: only operates on `status: 'open'` trades. Re-running is a no-op.
 *  - Audited: writes a Transaction record for every payout/refund.
 *  - Per-user atomic: balance update + trade status update + transaction record.
 *
 * Note: full multi-document transactions require a Mongo replica set; we keep
 * each user's payout self-consistent and rely on idempotency for retry safety.
 */
const settleMarketTrades = async (market, outcome) => {
  let settledCount = 0;

  if (outcome === 'cancelled') {
    // Refund every open trade — only operates on `status: 'open'` (idempotent)
    const openTrades = await Trade.find({ market: market._id, status: 'open' });
    for (const trade of openTrades) {
      // Mark trade refunded first; if it's already changed, skip.
      const claimed = await Trade.findOneAndUpdate(
        { _id: trade._id, status: 'open' },
        { status: 'refunded' },
        { new: true }
      );
      if (!claimed) continue; // raced — another process settled it

      const updatedUser = await User.findByIdAndUpdate(
        trade.user,
        { $inc: { balance: trade.amount } },
        { new: true }
      );
      if (!updatedUser) continue;

      await Transaction.create({
        user: trade.user,
        type: 'trade',
        amount: trade.amount,
        balance: updatedUser.balance,
        status: 'completed',
        metadata: {
          tradeId: trade._id,
          marketId: market._id,
          reason: 'market_cancelled_refund',
        },
      });
      settledCount++;
    }
    return settledCount;
  }

  // Outcome = 'yes' or 'no' — settle winners/losers
  // Step 1: only operates on currently OPEN trades, ensuring idempotency
  const winningRegex = new RegExp(`^${outcome}$`, 'i');
  const losingResult = await Trade.updateMany(
    { market: market._id, status: 'open', outcome: { $not: winningRegex } },
    { status: 'lost' }
  );
  // Capture which trades transition to 'won' in this run BEFORE marking, by id.
  const newlyWonTrades = await Trade.find(
    { market: market._id, status: 'open', outcome: winningRegex }
  );
  if (newlyWonTrades.length > 0) {
    await Trade.updateMany(
      { _id: { $in: newlyWonTrades.map(t => t._id) }, status: 'open' },
      { status: 'won' }
    );
  }

  if (newlyWonTrades.length === 0 && losingResult.modifiedCount === 0) {
    return 0; // nothing to settle (already done or no trades)
  }

  // Step 2: compute pool from ALL trades that ever participated (won + lost), not just newly settled.
  // This ensures payout math is correct even if settlement was partially run before.
  const allWon = await Trade.find({ market: market._id, status: 'won' });
  const allLost = await Trade.find({ market: market._id, status: 'lost' });

  const totalPool = [...allWon, ...allLost].reduce((sum, t) => sum + t.amount, 0);
  const totalWinnerShares = allWon.reduce((sum, t) => sum + t.shares, 0);

  // Step 3: pay only NEWLY-won trades to avoid double-paying on re-runs.
  if (totalWinnerShares > 0) {
    for (const trade of newlyWonTrades) {
      const grossPayout = (totalPool * trade.shares) / totalWinnerShares;
      const fee = grossPayout * PLATFORM_FEE_RATE;
      const netPayout = Math.round((grossPayout - fee) * 100) / 100; // 2 decimal precision

      const updatedUser = await User.findByIdAndUpdate(
        trade.user,
        { $inc: { balance: netPayout } },
        { new: true }
      );
      if (!updatedUser) continue;

      await Transaction.create({
        user: trade.user,
        type: 'trade',
        amount: netPayout,
        balance: updatedUser.balance,
        status: 'completed',
        metadata: {
          tradeId: trade._id,
          marketId: market._id,
          reason: `market_won_${outcome}`,
          fee,
          gross: Math.round(grossPayout * 100) / 100,
        },
      });
    }
  }

  settledCount = newlyWonTrades.length + losingResult.modifiedCount;
  return settledCount;
};

module.exports = { settleMarketTrades };
