const mongoose = require('mongoose');

const outcomeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  probability: { type: Number, min: 0, max: 100, default: 50 },
  price: { type: Number, min: 0, max: 100, default: 50 },
});

const newsLinkSchema = new mongoose.Schema({
  source: { type: String },
  title: { type: String },
  url: { type: String, default: '#' },
  timestamp: { type: String },
});

const marketSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    categorySlug: { type: String, required: true, lowercase: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    status: { type: String, enum: ['draft', 'active', 'closed', 'resolved'], default: 'active' },
    outcomes: [outcomeSchema],
    volume: { type: Number, default: 0 },
    tradeCount: { type: Number, default: 0 },
    liquidity: { type: Number, default: 0 },
    endDate: { type: Date },
    resolution: { type: String, default: null },
    resolvedOutcome: { type: String, enum: ['yes', 'no', 'cancelled', null], default: null },
    polymarketTokenId: { type: String, default: null }, // For real CLOB orderbook data
    conditionId: { type: String, default: null },       // Polymarket condition ID
    image: { type: String, default: '📊' },
    tags: [{ type: String }],
    featured: { type: Boolean, default: false },
    isNewMarket: { type: Boolean, default: false },
    rewards: { type: Number, default: 0 },
    newsLinks: [newsLinkSchema],
    rules: { type: String, default: '' },
    sourceOfTruth: { type: String, default: '' },
    closeDate: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

marketSchema.index({ categorySlug: 1 });
marketSchema.index({ featured: 1 });
marketSchema.index({ volume: -1 });
marketSchema.index({ createdAt: -1 });
marketSchema.index({ title: 'text' });

module.exports = mongoose.model('Market', marketSchema);
