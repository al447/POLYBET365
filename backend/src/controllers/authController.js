const { OAuth2Client } = require('google-auth-library');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const EmailOtp = require('../models/EmailOtp');
const { generateAccessToken, generateRefreshToken, hashRefreshToken } = require('../utils/helpers');
const RefreshToken = require('../models/RefreshToken');

const REFRESH_TOKEN_TTL_DAYS = 7;

const issueTokens = async (userId) => {
  const accessToken = generateAccessToken(userId);
  const rawRefresh = generateRefreshToken();
  const tokenHash = hashRefreshToken(rawRefresh);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await RefreshToken.create({ user: userId, tokenHash, expiresAt });
  return { accessToken, refreshToken: rawRefresh };
};
const { verifyWalletSignature } = require('../utils/walletAuth');
const { sendOtpEmail } = require('../utils/emailService');
const { generateUniqueCode, attributeReferral, getCodeForUser } = require('../services/referralService');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const googleAuth = async (req, res, next) => {
  try {
    const { credential, referralCode } = req.body;
    if (!credential) return res.status(400).json({ success: false, error: 'No credential provided' });

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    let user = await User.findOne({ $or: [{ googleId }, { email }] });
    const isNewUser = !user;
    let referralResult = null;
    
    if (!user) {
      user = await User.create({
        googleId,
        email,
        username: name,
        avatar: picture || '',
        authProvider: 'google',
        balance: parseFloat(process.env.INITIAL_BALANCE) || 10000,
      });
      
      // Generate referral code for new user
      await generateUniqueCode(user._id);
      
      // Handle referral attribution
      if (referralCode) {
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        console.log(`[Referral] Attempting attribution for new Google user ${user._id} with code ${referralCode}`);
        try {
          referralResult = await attributeReferral({ refereeUserId: user._id, code: referralCode, ipAddress });
          if (referralResult.success) {
            console.log(`[Referral] Successfully attributed referral for user ${user._id}`);
          } else {
            console.log(`[Referral] Failed to attribute: ${referralResult.reason}`);
          }
        } catch (err) {
          console.error('[Referral] Google signup attribution error:', err.message);
        }
      }
    } else if (!user.googleId) {
      user.googleId = googleId;
      user.avatar = picture || user.avatar;
      await user.save();
    }
    
    // Ensure user has a referral code
    if (!user.referralCode) {
      await getCodeForUser(user._id);
    }

    const { accessToken, refreshToken } = await issueTokens(user._id);
    res.json({
      success: true,
      token: accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        balance: user.balance,
        authProvider: user.authProvider,
        favorites: user.favorites,
        referralCode: user.referralCode,
      },
      referralAttribution: referralResult ? {
        success: referralResult.success,
        reason: referralResult.reason || null,
      } : null,
    });
  } catch (error) {
    next(error);
  }
};

const walletAuth = async (req, res, next) => {
  try {
    const { walletAddress, signature, message, referralCode } = req.body;
    if (!walletAddress || !signature || !message) {
      return res.status(400).json({ success: false, error: 'Missing wallet auth fields' });
    }

    const recoveredAddress = verifyWalletSignature(message, signature);
    if (!recoveredAddress) {
      return res.status(401).json({ 
        success: false, 
        error: 'Signature verification failed or expired. Please try signing in again.' 
      });
    }
    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(401).json({ success: false, error: 'Signature does not match wallet address' });
    }

    // Check if user is already logged in (Google) - extract from Authorization header
    const authHeader = req.headers.authorization;
    let loggedInUser = null;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        loggedInUser = await User.findById(decoded.userId);
      } catch (e) { /* invalid token, ignore */ }
    }

    // Check if another user already owns this wallet
    const existingWalletUser = await User.findOne({ 
      walletAddress: walletAddress.toLowerCase() 
    });

    let user;
    let isNewUser = false;
    let referralResult = null;
    
    if (loggedInUser) {
      // SCENARIO: Google user signing wallet for the first time
      if (existingWalletUser && existingWalletUser._id.toString() !== loggedInUser._id.toString()) {
        return res.status(409).json({ 
          success: false, 
          error: 'This wallet is already linked to another account' 
        });
      }
      // Link wallet to logged-in account
      loggedInUser.walletAddress = walletAddress.toLowerCase();
      await loggedInUser.save();
      user = loggedInUser;
      isNewUser = false;
    } else if (existingWalletUser) {
      // SCENARIO: Returning wallet user logging in
      user = existingWalletUser;
      isNewUser = false;
    } else {
      // SCENARIO: Brand new wallet user
      user = await User.create({
        walletAddress: walletAddress.toLowerCase(),
        username: `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
        authProvider: 'wallet',
        balance: parseFloat(process.env.INITIAL_BALANCE) || 10000,
      });
      isNewUser = true;
      
      // Generate referral code for new user
      await generateUniqueCode(user._id);
      
      // Handle referral attribution
      if (referralCode) {
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        console.log(`[Referral] Attempting attribution for new wallet user ${user._id} with code ${referralCode}`);
        try {
          referralResult = await attributeReferral({ refereeUserId: user._id, code: referralCode, ipAddress });
          if (referralResult.success) {
            console.log(`[Referral] Successfully attributed referral for user ${user._id}`);
          } else {
            console.log(`[Referral] Failed to attribute: ${referralResult.reason}`);
          }
        } catch (err) {
          console.error('[Referral] Wallet signup attribution error:', err.message);
        }
      }
    }
    
    // Ensure user has a referral code
    if (!user.referralCode) {
      await getCodeForUser(user._id);
    }

    const { accessToken, refreshToken } = await issueTokens(user._id);
    res.json({
      success: true,
      token: accessToken,
      refreshToken,
      user: {
        id: user._id,
        walletAddress: user.walletAddress,
        username: user.username,
        avatar: user.avatar,
        balance: user.balance,
        authProvider: user.authProvider,
        favorites: user.favorites,
        referralCode: user.referralCode,
      },
      referralAttribution: referralResult ? {
        success: referralResult.success,
        reason: referralResult.reason || null,
      } : null,
    });
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-__v');
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
        favorites: user.favorites,
        createdAt: user.createdAt,
        referralCode: user.referralCode,
      },
    });
  } catch (error) {
    next(error);
  }
};

const OTP_TTL_MIN = () => Number(process.env.OTP_TTL_MINUTES) || 10;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const sendEmailCode = async (req, res, next) => {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

    // Rate-limit: reject if a recent OTP exists (< 60s old)
    const existing = await EmailOtp.findOne({ email }).sort({ createdAt: -1 });
    if (existing && Date.now() - existing.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - existing.createdAt.getTime())) / 1000);
      return res.status(429).json({ success: false, error: `Please wait ${wait}s before requesting another code` });
    }

    // Generate 6-digit code
    const code = String(crypto.randomInt(100000, 1000000));
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MIN() * 60 * 1000);

    // Replace any existing OTP for this email
    await EmailOtp.deleteMany({ email });
    await EmailOtp.create({ email, codeHash, expiresAt });

    // Send email
    await sendOtpEmail(email, code);

    res.json({ success: true, message: 'Verification code sent' });
  } catch (error) {
    console.error('[sendEmailCode] error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to send verification code' });
  }
};

const verifyEmailCode = async (req, res, next) => {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    const code = String(req.body.code || '').trim();
    const referralCode = req.body.referralCode;
    if (!email || !code) return res.status(400).json({ success: false, error: 'Email and code are required' });

    const record = await EmailOtp.findOne({ email }).sort({ createdAt: -1 });
    if (!record) return res.status(400).json({ success: false, error: 'Code expired or not found. Please request a new one.' });
    if (record.expiresAt < new Date()) {
      await EmailOtp.deleteOne({ _id: record._id });
      return res.status(400).json({ success: false, error: 'Code expired. Please request a new one.' });
    }

    record.attempts += 1;
    if (record.attempts > MAX_ATTEMPTS) {
      await EmailOtp.deleteOne({ _id: record._id });
      return res.status(429).json({ success: false, error: 'Too many attempts. Please request a new code.' });
    }

    const isValid = await bcrypt.compare(code, record.codeHash);
    if (!isValid) {
      await record.save();
      return res.status(400).json({ success: false, error: 'Invalid code' });
    }

    // Success — delete OTP
    await EmailOtp.deleteOne({ _id: record._id });

    // Find or create user
    let user = await User.findOne({ email });
    const isNewUser = !user;
    
    if (!user) {
      user = await User.create({
        email,
        username: email.split('@')[0],
        authProvider: 'email',
        balance: parseFloat(process.env.INITIAL_BALANCE) || 10000,
      });
      
      // Generate referral code for new user
      await generateUniqueCode(user._id);
      
      // Handle referral attribution
      if (referralCode) {
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        await attributeReferral({ refereeUserId: user._id, code: referralCode, ipAddress }).catch(err => {
          console.error('[Referral] Email signup attribution error:', err.message);
        });
      }
    }
    
    // Ensure user has a referral code
    if (!user.referralCode) {
      await getCodeForUser(user._id);
    }

    const { accessToken, refreshToken } = await issueTokens(user._id);
    res.json({
      success: true,
      token: accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        balance: user.balance,
        authProvider: user.authProvider,
        favorites: user.favorites,
        referralCode: user.referralCode,
      },
    });
  } catch (error) {
    next(error);
  }
};

const refreshTokenHandler = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ success: false, error: 'Refresh token required' });

    const tokenHash = hashRefreshToken(refreshToken);
    const stored = await RefreshToken.findOne({ tokenHash, revoked: false });
    if (!stored || stored.expiresAt < new Date()) {
      return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
    }

    const user = await User.findById(stored.user).select('_id isActive');
    if (!user || user.isActive === false) {
      return res.status(401).json({ success: false, error: 'User not found or suspended' });
    }

    // Rotate: revoke old token and issue new pair
    stored.revoked = true;
    await stored.save();

    const { accessToken, refreshToken: newRefreshToken } = await issueTokens(user._id);
    res.json({ success: true, token: accessToken, refreshToken: newRefreshToken });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      await RefreshToken.updateOne({ tokenHash }, { revoked: true });
    }
    res.clearCookie('token');
    res.json({ success: true, message: 'Logged out' });
  } catch (error) {
    next(error);
  }
};

module.exports = { googleAuth, walletAuth, getMe, logout, sendEmailCode, verifyEmailCode, refreshTokenHandler };
