const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { database } = require('../database');

class AuthService {
  constructor() {
    this.db = database.sqlite;
  }

  /**
   * Register a new user
   */
  async register(userData) {
    try {
      const { username, email, password, firstName, lastName, role = 'user', createdBy = null } = userData;

      // Check if user already exists
      const [existingUsers] = await this.db.execute(
        'SELECT id FROM users WHERE username = ? OR email = ?',
        [username, email]
      );

      if (existingUsers.length > 0) {
        throw new Error('User with this username or email already exists');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Insert new user
      const [result] = await this.db.execute(
        `INSERT INTO users (username, email, password_hash, first_name, last_name, role, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [username, email, passwordHash, firstName, lastName, role, createdBy]
      );

      return {
        id: result.insertId,
        username,
        email,
        firstName,
        lastName,
        role
      };

    } catch (error) {
      console.error('Registration error:', error);
      throw new Error(error.message || 'Registration failed');
    }
  }

  /**
   * Login user and generate tokens
   */
  async login(username, password, ipAddress = null, userAgent = null) {
    try {
      // Find user by username or email
      const [users] = await this.db.execute(
        'SELECT * FROM users WHERE (username = ? OR email = ?) AND active = 1',
        [username, username]
      );

      if (users.length === 0) {
        throw new Error('Invalid username or password');
      }

      const user = users[0];

      // Check if user is locked
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        throw new Error('Account is temporarily locked due to failed login attempts');
      }

      // Verify password
      const isValid = await bcrypt.compare(password, user.password_hash);

      if (!isValid) {
        // Increment failed login attempts
        await this.incrementFailedAttempts(user.id);
        throw new Error('Invalid username or password');
      }

      // Reset failed login attempts on successful login
      await this.resetFailedAttempts(user.id);

      // Generate tokens
      const tokens = await this.generateTokens(user, ipAddress, userAgent);

      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role
        },
        tokens
      };

    } catch (error) {
      console.error('Login error:', error);
      throw new Error(error.message || 'Login failed');
    }
  }

  /**
   * Generate access and refresh tokens
   */
  async generateTokens(user, ipAddress = null, userAgent = null) {
    try {
      const tokenId = require('crypto').randomBytes(16).toString('hex');
      const refreshToken = require('crypto').randomBytes(32).toString('hex');

      const accessToken = jwt.sign(
        {
          userId: user.id,
          username: user.username,
          role: user.role,
          tokenId
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
      );

      const expiresAt = new Date(Date.now() + (60 * 60 * 1000)); // 1 hour
      const refreshExpiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)); // 7 days

      // Store session in database
      await this.db.execute(
        `INSERT INTO user_sessions (user_id, token_id, refresh_token, expires_at, refresh_expires_at, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [user.id, tokenId, refreshToken, expiresAt, refreshExpiresAt, ipAddress, userAgent]
      );

      return {
        accessToken,
        refreshToken,
        expiresAt,
        tokenType: 'Bearer'
      };

    } catch (error) {
      console.error('Token generation error:', error);
      throw new Error('Failed to generate tokens');
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken) {
    try {
      const [sessions] = await this.db.execute(
        `SELECT s.*, u.username, u.role 
         FROM user_sessions s 
         JOIN users u ON s.user_id = u.id 
         WHERE s.refresh_token = ? AND s.active = 1 AND s.refresh_expires_at > ?`,
        [refreshToken, new Date()]
      );

      if (sessions.length === 0) {
        throw new Error('Invalid or expired refresh token');
      }

      const session = sessions[0];
      const user = {
        id: session.user_id,
        username: session.username,
        role: session.role
      };

      // Generate new tokens
      const tokens = await this.generateTokens(user, session.ip_address, session.user_agent);

      // Invalidate old session
      await this.db.execute(
        'UPDATE user_sessions SET active = 0 WHERE id = ?',
        [session.id]
      );

      return tokens;

    } catch (error) {
      console.error('Refresh token error:', error);
      throw new Error(error.message || 'Failed to refresh token');
    }
  }

  /**
   * Logout user and invalidate tokens
   */
  async logout(tokenId) {
    try {
      await this.db.execute(
        'UPDATE user_sessions SET active = 0 WHERE token_id = ?',
        [tokenId]
      );

      return { message: 'Logged out successfully' };

    } catch (error) {
      console.error('Logout error:', error);
      throw new Error('Logout failed');
    }
  }

  /**
   * Verify JWT token
   */
  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

      // Check if session is still active
      const [sessions] = await this.db.execute(
        'SELECT id FROM user_sessions WHERE token_id = ? AND active = 1 AND expires_at > ?',
        [decoded.tokenId, new Date()]
      );

      if (sessions.length === 0) {
        throw new Error('Token is invalid or expired');
      }

      return decoded;

    } catch (error) {
      console.error('Token verification error:', error);
      throw new Error('Invalid token');
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId) {
    try {
      const [users] = await this.db.execute(
        'SELECT id, username, email, first_name, last_name, role, active, last_login FROM users WHERE id = ?',
        [userId]
      );

      if (users.length === 0) {
        throw new Error('User not found');
      }

      return users[0];

    } catch (error) {
      console.error('Get user error:', error);
      throw new Error('Failed to get user');
    }
  }

  /**
   * Update user last login
   */
  async updateLastLogin(userId) {
    try {
      await this.db.execute(
        'UPDATE users SET last_login = ? WHERE id = ?',
        [new Date(), userId]
      );
    } catch (error) {
      console.error('Update last login error:', error);
    }
  }

  /**
   * Increment failed login attempts
   */
  async incrementFailedAttempts(userId) {
    try {
      const [result] = await this.db.execute(
        'UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = ?',
        [userId]
      );

      // Get current attempts
      const [users] = await this.db.execute(
        'SELECT failed_login_attempts FROM users WHERE id = ?',
        [userId]
      );

      const attempts = users[0]?.failed_login_attempts || 0;

      // Lock account if too many attempts (5 attempts = 30 min lock)
      if (attempts >= 5) {
        const lockUntil = new Date(Date.now() + (30 * 60 * 1000)); // 30 minutes
        await this.db.execute(
          'UPDATE users SET locked_until = ? WHERE id = ?',
          [lockUntil, userId]
        );
      }

    } catch (error) {
      console.error('Increment failed attempts error:', error);
    }
  }

  /**
   * Reset failed login attempts
   */
  async resetFailedAttempts(userId) {
    try {
      await this.db.execute(
        'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?',
        [userId]
      );
    } catch (error) {
      console.error('Reset failed attempts error:', error);
    }
  }

  /**
   * Change user password
   */
  async changePassword(userId, currentPassword, newPassword) {
    try {
      // Get current password hash
      const [users] = await this.db.execute(
        'SELECT password_hash FROM users WHERE id = ?',
        [userId]
      );

      if (users.length === 0) {
        throw new Error('User not found');
      }

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, users[0].password_hash);
      if (!isValid) {
        throw new Error('Current password is incorrect');
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 12);

      // Update password
      await this.db.execute(
        'UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?',
        [newPasswordHash, new Date(), userId]
      );

      // Invalidate all sessions for this user
      await this.db.execute(
        'UPDATE user_sessions SET active = 0 WHERE user_id = ?',
        [userId]
      );

      return { message: 'Password changed successfully' };

    } catch (error) {
      console.error('Change password error:', error);
      throw new Error(error.message || 'Failed to change password');
    }
  }
}

module.exports = AuthService;