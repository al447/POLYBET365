const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    googleId: { type: String, unique: true, sparse: true },
    walletAddress: { type: String, unique: true, sparse: true, lowercase: true },
    username: { type: String, trim: true },
    avatar: { type: String, default: '' },
    balance: { type: Number, default: 10000 },
    authProvider: { type: String, enum: ['google', 'wallet', 'email'], required: true },
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Market' }],
    role: { type: String, enum: ['user', 'admin'], default: 'user', index: true },
    password: { type: String, select: false },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
    // Referral system fields
    referralCode: { type: String, index: true, sparse: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    referralCodeUsed: { type: String, default: null },
    pendingReferralBalance: { type: Number, default: 0 },
    referralStats: {
      totalEarned: { type: Number, default: 0 },
      totalReferred: { type: Number, default: 0 },
      pendingReferred: { type: Number, default: 0 },
    },
    referralBannedFromProgram: { type: Boolean, default: false },
    // Deposit system: per-user HD-derived addresses
    depositIndex: { type: Number, unique: true, sparse: true },
    depositAddresses: {
      evm: { type: String, default: null },
      solana: { type: String, default: null },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
