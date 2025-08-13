const AuthService = require('../auth/authService');

class AuthMiddleware {
  constructor() {
    this.authService = new AuthService();
  }

  /**
   * Authenticate JWT token middleware
   */
  authenticate() {
    return async (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            success: false,
            message: 'Authorization token required'
          });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        const decoded = await this.authService.verifyToken(token);
        req.user = decoded;

        next();
      } catch (error) {
        console.error('Authentication error:', error);
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired token'
        });
      }
    };
  }

  /**
   * Authorize user roles middleware
   */
  authorize(roles = []) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // If no roles specified, allow any authenticated user
      if (roles.length === 0) {
        return next();
      }

      // Check if user role is in allowed roles
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }

      next();
    };
  }

  /**
   * Optional authentication middleware (doesn't fail if no token)
   */
  optionalAuth() {
    return async (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const decoded = await this.authService.verifyToken(token);
          req.user = decoded;
        }

        next();
      } catch (error) {
        // Don't fail, just continue without user
        next();
      }
    };
  }

  /**
   * Check if user is admin
   */
  requireAdmin() {
    return this.authorize(['admin']);
  }

  /**
   * Check if user is admin or manager
   */
  requireManager() {
    return this.authorize(['admin', 'manager']);
  }

  /**
   * Rate limiting middleware for authentication endpoints
   */
  authRateLimit() {
    const rateLimit = require('express-rate-limit');
    
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // Limit each IP to 5 requests per windowMs for auth endpoints
      message: {
        success: false,
        message: 'Too many authentication attempts, please try again later.'
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
  }

  /**
   * Security headers middleware
   */
  securityHeaders() {
    const helmet = require('helmet');
    
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://unpkg.com", "https://cdn.jsdelivr.net"],
          scriptSrcAttr: ["'unsafe-inline'"],  // Allow inline event handlers for development
          fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"]
        },
      },
      hsts: false  // Disable HSTS for local development
    });
  }
}

module.exports = new AuthMiddleware();