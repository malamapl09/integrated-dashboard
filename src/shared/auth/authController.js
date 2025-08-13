const AuthService = require('./authService');

class AuthController {
  constructor() {
    this.authService = new AuthService();
  }

  /**
   * User registration
   */
  async register(req, res) {
    try {
      const { username, email, password, firstName, lastName, role } = req.body;

      // Validate required fields
      if (!username || !email || !password || !firstName || !lastName) {
        return res.status(400).json({
          success: false,
          message: 'All fields are required'
        });
      }

      // Validate password strength
      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 8 characters long'
        });
      }

      const user = await this.authService.register({
        username,
        email,
        password,
        firstName,
        lastName,
        role,
        createdBy: req.user?.userId || null
      });

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: user
      });

    } catch (error) {
      console.error('Register error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Registration failed'
      });
    }
  }

  /**
   * User login
   */
  async login(req, res) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          message: 'Username and password are required'
        });
      }

      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('User-Agent');

      const result = await this.authService.login(username, password, ipAddress, userAgent);

      // Update last login
      await this.authService.updateLastLogin(result.user.id);

      res.json({
        success: true,
        message: 'Login successful',
        data: result
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(401).json({
        success: false,
        message: error.message || 'Login failed'
      });
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token is required'
        });
      }

      const tokens = await this.authService.refreshToken(refreshToken);

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: tokens
      });

    } catch (error) {
      console.error('Refresh token error:', error);
      res.status(401).json({
        success: false,
        message: error.message || 'Failed to refresh token'
      });
    }
  }

  /**
   * User logout
   */
  async logout(req, res) {
    try {
      const tokenId = req.user?.tokenId;

      if (!tokenId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid token'
        });
      }

      await this.authService.logout(tokenId);

      res.json({
        success: true,
        message: 'Logged out successfully'
      });

    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Logout failed'
      });
    }
  }

  /**
   * Get current user profile
   */
  async getProfile(req, res) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const user = await this.authService.getUserById(userId);

      res.json({
        success: true,
        data: user
      });

    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get profile'
      });
    }
  }

  /**
   * Change password
   */
  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user?.userId;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Current password and new password are required'
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'New password must be at least 8 characters long'
        });
      }

      const result = await this.authService.changePassword(userId, currentPassword, newPassword);

      res.json({
        success: true,
        message: result.message
      });

    } catch (error) {
      console.error('Change password error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to change password'
      });
    }
  }
}

module.exports = AuthController;