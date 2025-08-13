const express = require('express');
const { body, validationResult } = require('express-validator');
const authService = require('../services/authService');
const { authenticate, authorize, authRateLimit } = require('../middleware/auth');
const router = express.Router();

// Validation middleware
const validateRegistration = [
  body('username')
    .isLength({ min: 3, max: 30 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username must be 3-30 characters and contain only letters, numbers, and underscores'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Must be a valid email address'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must be at least 8 characters with uppercase, lowercase, number, and special character'),
  body('firstName')
    .isLength({ min: 1, max: 50 })
    .trim()
    .withMessage('First name is required and must be less than 50 characters'),
  body('lastName')
    .isLength({ min: 1, max: 50 })
    .trim()
    .withMessage('Last name is required and must be less than 50 characters'),
  body('role')
    .optional()
    .isIn(['admin', 'manager', 'user'])
    .withMessage('Role must be admin, manager, or user')
];

const validateLogin = [
  body('username')
    .notEmpty()
    .withMessage('Username or email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

const validatePasswordChange = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must be at least 8 characters with uppercase, lowercase, number, and special character')
];

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Get client IP helper
const getClientIP = (req) => {
  return req.headers['x-forwarded-for'] || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         req.ip;
};

// Register new user (admin only)
router.post('/register', 
  authRateLimit,
  authenticate,
  authorize(['admin']),
  validateRegistration,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { username, email, password, firstName, lastName, role } = req.body;
      
      const user = await authService.register({
        username,
        email, 
        password,
        firstName,
        lastName,
        role: role || 'user'
      }, req.user.id);

      res.status(201).json({
        message: 'User registered successfully',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          createdAt: user.created_at
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(400).json({ 
        error: error.message || 'Registration failed' 
      });
    }
  }
);

// Login
router.post('/login',
  authRateLimit,
  validateLogin,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { username, password } = req.body;
      const ipAddress = getClientIP(req);
      const userAgent = req.headers['user-agent'];

      const result = await authService.login(username, password, ipAddress, userAgent);

      res.json({
        message: 'Login successful',
        user: {
          id: result.user.id,
          username: result.user.username,
          email: result.user.email,
          firstName: result.user.first_name,
          lastName: result.user.last_name,
          role: result.user.role,
          lastLogin: result.user.last_login
        },
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(401).json({ 
        error: error.message || 'Login failed' 
      });
    }
  }
);

// Refresh token
router.post('/refresh',
  authRateLimit,
  async (req, res) => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token required' });
      }

      const ipAddress = getClientIP(req);
      const userAgent = req.headers['user-agent'];

      const tokens = await authService.refreshToken(refreshToken, ipAddress, userAgent);

      res.json({
        message: 'Token refreshed successfully',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(401).json({ 
        error: error.message || 'Token refresh failed' 
      });
    }
  }
);

// Logout
router.post('/logout',
  authenticate,
  async (req, res) => {
    try {
      await authService.logout(req.user.tokenId);
      res.json({ message: 'Logout successful' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  }
);

// Logout all sessions
router.post('/logout-all',
  authenticate,
  async (req, res) => {
    try {
      await authService.logoutAllSessions(req.user.id);
      res.json({ message: 'All sessions logged out successfully' });
    } catch (error) {
      console.error('Logout all error:', error);
      res.status(500).json({ error: 'Logout all failed' });
    }
  }
);

// Get current user profile
router.get('/profile',
  authenticate,
  async (req, res) => {
    try {
      const user = await authService.getUserById(req.user.id);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          lastLogin: user.last_login,
          createdAt: user.created_at
        }
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Failed to get user profile' });
    }
  }
);

// Update user profile
router.put('/profile',
  authenticate,
  [
    body('firstName').optional().isLength({ min: 1, max: 50 }).trim(),
    body('lastName').optional().isLength({ min: 1, max: 50 }).trim(),
    body('email').optional().isEmail().normalizeEmail()
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const updates = {};
      const allowedFields = ['firstName', 'lastName', 'email'];
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updates[field === 'firstName' ? 'first_name' : 
                   field === 'lastName' ? 'last_name' : field] = req.body[field];
        }
      });

      const updatedUser = await authService.updateUser(req.user.id, updates, req.user.id);

      res.json({
        message: 'Profile updated successfully',
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          firstName: updatedUser.first_name,
          lastName: updatedUser.last_name,
          role: updatedUser.role
        }
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(400).json({ 
        error: error.message || 'Failed to update profile' 
      });
    }
  }
);

// Change password
router.put('/change-password',
  authenticate,
  validatePasswordChange,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      await authService.changePassword(req.user.id, currentPassword, newPassword);
      
      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(400).json({ 
        error: error.message || 'Password change failed' 
      });
    }
  }
);

// Verify token (for frontend to check if user is still authenticated)
router.get('/verify',
  authenticate,
  (req, res) => {
    res.json({
      valid: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role
      }
    });
  }
);

module.exports = router;