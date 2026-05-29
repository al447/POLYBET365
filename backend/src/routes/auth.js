const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { googleAuth, walletAuth, getMe, logout, sendEmailCode, verifyEmailCode, refreshTokenHandler } = require('../controllers/authController');

router.post(
  '/google',
  [body('credential').notEmpty().withMessage('Credential is required')],
  validate,
  googleAuth
);

router.post(
  '/wallet',
  [
    body('walletAddress').notEmpty().withMessage('Wallet address is required'),
    body('signature').notEmpty().withMessage('Signature is required'),
    body('message').notEmpty().withMessage('Message is required'),
  ],
  validate,
  walletAuth
);

router.post(
  '/email/send-code',
  [body('email').isEmail().withMessage('Valid email is required')],
  validate,
  sendEmailCode
);

router.post(
  '/email/verify',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('code').isLength({ min: 6, max: 6 }).isNumeric().withMessage('Code must be 6 digits'),
  ],
  validate,
  verifyEmailCode
);

router.post('/refresh', [body('refreshToken').notEmpty().withMessage('Refresh token required')], validate, refreshTokenHandler);
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);

module.exports = router;
