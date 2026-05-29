const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getProfile, getPositions, toggleFavorite, getFavorites, deposit, withdraw, getTransactions } = require('../controllers/userController');

router.get('/profile', protect, getProfile);
router.get('/positions', protect, getPositions);
router.post('/favorites/:marketId', protect, toggleFavorite);
router.get('/favorites', protect, getFavorites);
router.post('/deposit', protect, deposit);
router.post('/withdraw', protect, withdraw);
router.get('/transactions', protect, getTransactions);

module.exports = router;
