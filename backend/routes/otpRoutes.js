const express = require('express');
const router = express.Router();
const { generateOTP, verifyOTP } = require('../controllers/otpController');
const { createRateLimiter } = require('../middleware/rateLimit');

const otpLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 6,
  key: (req) => `${req.ip}:${String(req.body?.phone || '')}`,
});

// Generate and send OTP
router.post('/send-otp', otpLimiter, generateOTP);
router.post('/send', otpLimiter, generateOTP);
router.post('/resend-otp', otpLimiter, generateOTP);
router.post('/resend', otpLimiter, generateOTP);
router.post('/generate', otpLimiter, generateOTP);

// Verify OTP
router.post('/verify-otp', otpLimiter, verifyOTP);
router.post('/verify', otpLimiter, verifyOTP);

module.exports = router;
