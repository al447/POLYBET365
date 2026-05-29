const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { adminAuth } = require('../middleware/adminAuth');
const {
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
} = require('../controllers/depositController');

// User routes (require normal auth JWT)
router.get('/addresses', protect, getAddresses);
router.post('/claim', protect, claimDeposit);
router.get('/mine', protect, getMyDeposits);

// Admin routes (require admin JWT)
router.get('/admin/list', adminAuth, adminList);
router.get('/admin/stats', adminAuth, adminStats);
router.get('/admin/:id/price-suggestion', adminAuth, priceSuggestion);
router.post('/admin/:id/credit', adminAuth, adminCredit);
router.post('/admin/:id/reject', adminAuth, adminReject);

// MoonPay routes
router.post('/moonpay/sign', protect, moonpaySign);
router.post('/moonpay/simulate-payment', protect, moonpaySimulatePayment);
// Webhook is mounted with raw body parser in server.js

module.exports = router;
