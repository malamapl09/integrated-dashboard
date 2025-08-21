const express = require('express');
const { body, query, validationResult } = require('express-validator');
const authService = require('../../../shared/auth/authService');
const { authenticate, authorize, validateOwnership } = require('../../../shared/middleware/authMiddleware');
const { pool } = require('../config/database');
const router = express.Router();

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

// Get all users (admin and manager only)
router.get('/',
  authenticate,
  authorize(['admin', 'manager']),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().isString().trim(),
    query('role').optional().isIn(['admin', 'manager', 'user']),
    query('active').optional().isBoolean().toBoolean()
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const page = req.query.page || 1;
      const limit = req.query.limit || 20;
      const offset = (page - 1) * limit;
      const { search, role, active } = req.query;

      let query = `
        SELECT id, username, email, first_name, last_name, role, active, 
               last_login, created_at, updated_at
        FROM users
        WHERE 1=1
      `;
      let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
      const params = [];
      const countParams = [];

      // Add search filter
      if (search) {
        query += ' AND (username LIKE ? OR email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)';
        countQuery += ' AND (username LIKE ? OR email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
      }

      // Add role filter
      if (role) {
        query += ' AND role = ?';
        countQuery += ' AND role = ?';
        params.push(role);
        countParams.push(role);
      }

      // Add active filter
      if (active !== undefined) {
        query += ' AND active = ?';
        countQuery += ' AND active = ?';
        params.push(active ? 1 : 0);
        countParams.push(active ? 1 : 0);
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      // Get users and total count
      const [users] = await pool.execute(query, params);
      const [countResult] = await pool.execute(countQuery, countParams);
      const total = countResult[0].total;

      const totalPages = Math.ceil(total / limit);

      res.json({
        users: users.map(user => ({
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          active: user.active,
          lastLogin: user.last_login,
          createdAt: user.created_at,
          updatedAt: user.updated_at
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  }
);

// Get user by ID
router.get('/:id',
  authenticate,
  authorize(['admin', 'manager']),
  async (req, res) => {
    try {
      const user = await authService.getUserById(req.params.id);
      
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
          active: user.active,
          lastLogin: user.last_login,
          createdAt: user.created_at
        }
      });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  }
);

// Update user (admin only, or user updating themselves)
router.put('/:id',
  authenticate,
  [
    body('firstName').optional().isLength({ min: 1, max: 50 }).trim(),
    body('lastName').optional().isLength({ min: 1, max: 50 }).trim(),
    body('email').optional().isEmail().normalizeEmail(),
    body('role').optional().isIn(['admin', 'manager', 'user']),
    body('active').optional().isBoolean()
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const targetUserId = parseInt(req.params.id);
      const currentUserId = req.user.id;
      const currentUserRole = req.user.role;

      // Check permissions
      if (currentUserRole !== 'admin' && targetUserId !== currentUserId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Non-admin users cannot change role or active status
      if (currentUserRole !== 'admin') {
        delete req.body.role;
        delete req.body.active;
      }

      const updates = {};
      const allowedFields = ['firstName', 'lastName', 'email', 'role', 'active'];
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updates[field === 'firstName' ? 'first_name' : 
                   field === 'lastName' ? 'last_name' : field] = req.body[field];
        }
      });

      const updatedUser = await authService.updateUser(targetUserId, updates, currentUserId);

      res.json({
        message: 'User updated successfully',
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          firstName: updatedUser.first_name,
          lastName: updatedUser.last_name,
          role: updatedUser.role,
          active: updatedUser.active
        }
      });
    } catch (error) {
      console.error('Update user error:', error);
      res.status(400).json({ 
        error: error.message || 'Failed to update user' 
      });
    }
  }
);

// Deactivate user (admin only)
router.patch('/:id/deactivate',
  authenticate,
  authorize(['admin']),
  async (req, res) => {
    try {
      const userId = parseInt(req.params.id);

      // Prevent admin from deactivating themselves
      if (userId === req.user.id) {
        return res.status(400).json({ error: 'Cannot deactivate your own account' });
      }

      await pool.execute(
        'UPDATE users SET active = 0, updated_at = datetime("now") WHERE id = ?',
        [userId]
      );

      // Logout all sessions for the deactivated user
      await authService.logoutAllSessions(userId);

      res.json({ message: 'User deactivated successfully' });
    } catch (error) {
      console.error('Deactivate user error:', error);
      res.status(500).json({ error: 'Failed to deactivate user' });
    }
  }
);

// Activate user (admin only)
router.patch('/:id/activate',
  authenticate,
  authorize(['admin']),
  async (req, res) => {
    try {
      const userId = parseInt(req.params.id);

      await pool.execute(
        'UPDATE users SET active = 1, updated_at = datetime("now") WHERE id = ?',
        [userId]
      );

      res.json({ message: 'User activated successfully' });
    } catch (error) {
      console.error('Activate user error:', error);
      res.status(500).json({ error: 'Failed to activate user' });
    }
  }
);

// Reset user password (admin only)
router.patch('/:id/reset-password',
  authenticate,
  authorize(['admin']),
  [
    body('newPassword')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must be at least 8 characters with uppercase, lowercase, number, and special character')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { newPassword } = req.body;

      // Hash new password
      const passwordHash = await authService.hashPassword(newPassword);

      // Update password
      await pool.execute(`
        UPDATE users 
        SET password_hash = ?, password_changed_at = datetime("now"), updated_at = datetime("now")
        WHERE id = ?
      `, [passwordHash, userId]);

      // Logout all sessions for security
      await authService.logoutAllSessions(userId);

      res.json({ message: 'Password reset successfully. User will need to log in again.' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  }
);

// Get user's active sessions (admin can see any user, users can see their own)
router.get('/:id/sessions',
  authenticate,
  async (req, res) => {
    try {
      const targetUserId = parseInt(req.params.id);
      const currentUserId = req.user.id;
      const currentUserRole = req.user.role;

      // Check permissions
      if (currentUserRole !== 'admin' && targetUserId !== currentUserId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const [sessions] = await pool.execute(`
        SELECT id, token_id, ip_address, user_agent, expires_at, created_at, active
        FROM user_sessions
        WHERE user_id = ? AND active = 1 AND expires_at > datetime("now")
        ORDER BY created_at DESC
      `, [targetUserId]);

      res.json({
        sessions: sessions.map(session => ({
          id: session.id,
          tokenId: session.token_id,
          ipAddress: session.ip_address,
          userAgent: session.user_agent,
          expiresAt: session.expires_at,
          createdAt: session.created_at,
          active: session.active
        }))
      });
    } catch (error) {
      console.error('Get sessions error:', error);
      res.status(500).json({ error: 'Failed to fetch user sessions' });
    }
  }
);

// Revoke user session (admin can revoke any session, users can revoke their own)
router.delete('/:id/sessions/:sessionId',
  authenticate,
  async (req, res) => {
    try {
      const targetUserId = parseInt(req.params.id);
      const sessionId = parseInt(req.params.sessionId);
      const currentUserId = req.user.id;
      const currentUserRole = req.user.role;

      // Check permissions
      if (currentUserRole !== 'admin' && targetUserId !== currentUserId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const [result] = await pool.execute(
        'UPDATE user_sessions SET active = 0 WHERE id = ? AND user_id = ?',
        [sessionId, targetUserId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json({ message: 'Session revoked successfully' });
    } catch (error) {
      console.error('Revoke session error:', error);
      res.status(500).json({ error: 'Failed to revoke session' });
    }
  }
);

// Create new user (admin only)
router.post('/',
  authenticate,
  authorize(['admin']),
  [
    body('username').isLength({ min: 3, max: 50 }).trim()
      .matches(/^[a-zA-Z0-9_-]+$/).withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
    body('email').isEmail().normalizeEmail(),
    body('password')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must be at least 8 characters with uppercase, lowercase, number, and special character'),
    body('firstName').isLength({ min: 1, max: 50 }).trim(),
    body('lastName').isLength({ min: 1, max: 50 }).trim(),
    body('role').isIn(['admin', 'manager', 'user'])
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { username, email, password, firstName, lastName, role } = req.body;
      
      // Check if username or email already exists
      const [existingUser] = await pool.execute(
        'SELECT id FROM users WHERE username = ? OR email = ?',
        [username, email]
      );

      if (existingUser.length > 0) {
        return res.status(400).json({ error: 'Username or email already exists' });
      }

      // Hash password
      const passwordHash = await authService.hashPassword(password);

      // Create user
      const [result] = await pool.execute(`
        INSERT INTO users (username, email, password_hash, first_name, last_name, role, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [username, email, passwordHash, firstName, lastName, role, req.user.id]);

      const newUser = {
        id: result.insertId,
        username,
        email,
        firstName,
        lastName,
        role,
        active: true,
        createdAt: new Date().toISOString()
      };

      res.status(201).json({
        message: 'User created successfully',
        user: newUser
      });
    } catch (error) {
      console.error('Create user error:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
);

// Get user statistics (admin only)
router.get('/stats/overview',
  authenticate,
  authorize(['admin']),
  async (req, res) => {
    try {
      const [stats] = await pool.execute(`
        SELECT 
          COUNT(*) as totalUsers,
          SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as activeUsers,
          SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as adminUsers,
          SUM(CASE WHEN role = 'manager' THEN 1 ELSE 0 END) as managerUsers,
          SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as regularUsers,
          SUM(CASE WHEN last_login > datetime('now', '-30 days') THEN 1 ELSE 0 END) as recentlyActive
        FROM users
      `);

      const [sessionStats] = await pool.execute(`
        SELECT 
          COUNT(*) as activeSessions,
          COUNT(DISTINCT user_id) as usersWithSessions
        FROM user_sessions 
        WHERE active = 1 AND expires_at > datetime("now")
      `);

      res.json({
        users: stats[0],
        sessions: sessionStats[0]
      });
    } catch (error) {
      console.error('Get user stats error:', error);
      res.status(500).json({ error: 'Failed to fetch user statistics' });
    }
  }
);

module.exports = router;