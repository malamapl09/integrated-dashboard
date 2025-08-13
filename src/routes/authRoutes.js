const express = require('express');
const AuthController = require('../shared/auth/authController');
const authMiddleware = require('../shared/middleware/authMiddleware');

const router = express.Router();
const authController = new AuthController();

// Public authentication routes
router.post('/login', authMiddleware.authRateLimit(), authController.login.bind(authController));
router.post('/register', authMiddleware.authRateLimit(), authController.register.bind(authController));
router.post('/refresh', authController.refreshToken.bind(authController));

// Protected authentication routes
router.post('/logout', authMiddleware.authenticate(), authController.logout.bind(authController));
router.get('/profile', authMiddleware.authenticate(), authController.getProfile.bind(authController));
router.put('/password', authMiddleware.authenticate(), authController.changePassword.bind(authController));

module.exports = router;