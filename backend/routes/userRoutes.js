const express = require('express');
const router = express.Router();
const { getUserProfile, updateUserProfile } = require('../controllers/userController');
const { requireAuth, requireSelfParam } = require('../middleware/auth');

router.use(requireAuth);

// Get user profile
router.get('/profile/:userId', requireSelfParam('userId'), getUserProfile);

// Update user profile
router.put('/profile/:userId', requireSelfParam('userId'), updateUserProfile);

module.exports = router;
