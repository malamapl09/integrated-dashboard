const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../config/database');

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '1h';
    this.refreshTokenExpiresIn = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
    this.saltRounds = 12;
    this.maxLoginAttempts = 5;
    this.lockoutDuration = 15 * 60 * 1000; // 15 minutes
  }

  // Hash password
  async hashPassword(password) {
    return await bcrypt.hash(password, this.saltRounds);
  }

  // Verify password
  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  // Generate JWT tokens
  generateTokens(user) {
    const tokenId = crypto.randomUUID();
    const refreshToken = crypto.randomUUID();

    const payload = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      tokenId
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
      issuer: 'cotizador-app',
      audience: 'cotizador-users'
    });

    return {
      accessToken,
      refreshToken,
      tokenId,
      expiresIn: this.jwtExpiresIn
    };
  }

  // Verify JWT token
  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret, {
        issuer: 'cotizador-app',
        audience: 'cotizador-users'
      });
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  // Register new user
  async register(userData, createdBy = null) {
    const { username, email, password, firstName, lastName, role = 'user' } = userData;

    // Check if user already exists
    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existingUsers.length > 0) {
      throw new Error('Username or email already exists');
    }

    // Hash password
    const passwordHash = await this.hashPassword(password);

    // Create user
    const [result] = await pool.execute(`
      INSERT INTO users (username, email, password_hash, first_name, last_name, role, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [username, email, passwordHash, firstName, lastName, role, createdBy]);

    // Get created user (without password)
    const [newUser] = await pool.execute(`
      SELECT id, username, email, first_name, last_name, role, active, created_at
      FROM users WHERE id = ?
    `, [result.insertId]);

    return newUser[0];
  }

  // Login user
  async login(username, password, ipAddress, userAgent) {
    // Get user with login attempt info
    const [users] = await pool.execute(`
      SELECT id, username, email, password_hash, first_name, last_name, role, active,
             failed_login_attempts, locked_until, last_login
      FROM users 
      WHERE (username = ? OR email = ?) AND active = 1
    `, [username, username]);

    if (users.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = users[0];

    // Check if account is locked
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      throw new Error('Account is temporarily locked due to too many failed login attempts');
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(password, user.password_hash);

    if (!isValidPassword) {
      // Increment failed login attempts
      await this.handleFailedLogin(user.id);
      throw new Error('Invalid credentials');
    }

    // Reset failed login attempts on successful login
    await this.resetFailedLoginAttempts(user.id);

    // Generate tokens
    const tokens = this.generateTokens(user);

    // Store session
    await this.createSession(user.id, tokens, ipAddress, userAgent);

    // Update last login
    await pool.execute(
      'UPDATE users SET last_login = datetime("now") WHERE id = ?',
      [user.id]
    );

    // Return user info and tokens (without password)
    const { password_hash, failed_login_attempts, locked_until, ...userInfo } = user;
    
    return {
      user: userInfo,
      ...tokens
    };
  }

  // Handle failed login
  async handleFailedLogin(userId) {
    const [result] = await pool.execute(
      'UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = ?',
      [userId]
    );

    // Check if we should lock the account
    const [user] = await pool.execute(
      'SELECT failed_login_attempts FROM users WHERE id = ?',
      [userId]
    );

    if (user[0].failed_login_attempts >= this.maxLoginAttempts) {
      const lockUntil = new Date(Date.now() + this.lockoutDuration).toISOString();
      await pool.execute(
        'UPDATE users SET locked_until = ? WHERE id = ?',
        [lockUntil, userId]
      );
    }
  }

  // Reset failed login attempts
  async resetFailedLoginAttempts(userId) {
    await pool.execute(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?',
      [userId]
    );
  }

  // Create session
  async createSession(userId, tokens, ipAddress, userAgent) {
    const expiresAt = new Date(Date.now() + this.parseExpiration(this.jwtExpiresIn));
    const refreshExpiresAt = new Date(Date.now() + this.parseExpiration(this.refreshTokenExpiresIn));

    await pool.execute(`
      INSERT INTO user_sessions (user_id, token_id, refresh_token, expires_at, refresh_expires_at, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [userId, tokens.tokenId, tokens.refreshToken, expiresAt.toISOString(), 
        refreshExpiresAt.toISOString(), ipAddress, userAgent]);
  }

  // Refresh token
  async refreshToken(refreshToken, ipAddress, userAgent) {
    // Find active session
    const [sessions] = await pool.execute(`
      SELECT us.*, u.id, u.username, u.email, u.role, u.active
      FROM user_sessions us
      JOIN users u ON us.user_id = u.id
      WHERE us.refresh_token = ? AND us.active = 1 AND us.refresh_expires_at > datetime("now")
    `, [refreshToken]);

    if (sessions.length === 0) {
      throw new Error('Invalid or expired refresh token');
    }

    const session = sessions[0];

    if (!session.active) {
      throw new Error('User account is inactive');
    }

    // Generate new tokens
    const tokens = this.generateTokens({
      id: session.id,
      username: session.username,
      email: session.email,
      role: session.role
    });

    // Update session
    const expiresAt = new Date(Date.now() + this.parseExpiration(this.jwtExpiresIn));
    const refreshExpiresAt = new Date(Date.now() + this.parseExpiration(this.refreshTokenExpiresIn));

    await pool.execute(`
      UPDATE user_sessions 
      SET token_id = ?, refresh_token = ?, expires_at = ?, refresh_expires_at = ?, ip_address = ?, user_agent = ?
      WHERE id = ?
    `, [tokens.tokenId, tokens.refreshToken, expiresAt.toISOString(), 
        refreshExpiresAt.toISOString(), ipAddress, userAgent, session.id]);

    return tokens;
  }

  // Logout (invalidate session)
  async logout(tokenId) {
    await pool.execute(
      'UPDATE user_sessions SET active = 0 WHERE token_id = ?',
      [tokenId]
    );
  }

  // Logout all sessions for user
  async logoutAllSessions(userId) {
    await pool.execute(
      'UPDATE user_sessions SET active = 0 WHERE user_id = ?',
      [userId]
    );
  }

  // Validate session
  async validateSession(tokenId) {
    const [sessions] = await pool.execute(`
      SELECT us.*, u.id, u.username, u.email, u.role, u.active
      FROM user_sessions us
      JOIN users u ON us.user_id = u.id
      WHERE us.token_id = ? AND us.active = 1 AND us.expires_at > datetime("now")
    `, [tokenId]);

    if (sessions.length === 0 || !sessions[0].active) {
      return null;
    }

    return sessions[0];
  }

  // Get user by ID
  async getUserById(userId) {
    const [users] = await pool.execute(`
      SELECT id, username, email, first_name, last_name, role, active, last_login, created_at
      FROM users WHERE id = ? AND active = 1
    `, [userId]);

    return users[0] || null;
  }

  // Update user
  async updateUser(userId, updates, updatedBy) {
    const allowedFields = ['first_name', 'last_name', 'email', 'role'];
    const validUpdates = {};
    
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        validUpdates[key] = updates[key];
      }
    });

    if (Object.keys(validUpdates).length === 0) {
      throw new Error('No valid fields to update');
    }

    const fields = Object.keys(validUpdates).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(validUpdates), userId];

    await pool.execute(`
      UPDATE users SET ${fields}, updated_at = datetime("now") WHERE id = ?
    `, values);

    return await this.getUserById(userId);
  }

  // Change password
  async changePassword(userId, currentPassword, newPassword) {
    // Get current password hash
    const [users] = await pool.execute(
      'SELECT password_hash FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValidPassword = await this.verifyPassword(currentPassword, users[0].password_hash);
    if (!isValidPassword) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await this.hashPassword(newPassword);

    // Update password
    await pool.execute(`
      UPDATE users 
      SET password_hash = ?, password_changed_at = datetime("now")
      WHERE id = ?
    `, [newPasswordHash, userId]);

    // Invalidate all sessions for security
    await this.logoutAllSessions(userId);
  }

  // Parse expiration string to milliseconds
  parseExpiration(expiration) {
    const units = {
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000
    };

    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error('Invalid expiration format');
    }

    const [, number, unit] = match;
    return parseInt(number) * units[unit];
  }

  // Cleanup expired sessions
  async cleanupExpiredSessions() {
    const [result] = await pool.execute(
      'DELETE FROM user_sessions WHERE refresh_expires_at < datetime("now")'
    );
    
    return result.affectedRows;
  }
}

module.exports = new AuthService();