const AuthService = require('../auth/authService');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

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
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 attempts per window
      message: {
        success: false,
        message: 'Too many authentication attempts, please try again later'
      },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: false
    });
  }

  /**
   * Rate limiting for general API endpoints
   */
  apiRateLimit() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // 100 requests per window
      message: {
        success: false,
        message: 'Too many requests, please try again later'
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        // Skip rate limiting for admin users
        return req.user && req.user.role === 'admin';
      }
    });
  }

  /**
   * Security headers middleware
   */
  securityHeaders() {
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", "https:"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      hsts: process.env.NODE_ENV === 'production' ? {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      } : false,
      noSniff: true,
      xssFilter: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    });
  }

  /**
   * Token validation caching middleware
   */
  validateOwnership(resourceType) {
    return async (req, res, next) => {
      try {
        const resourceId = req.params.id;
        const userId = req.user.userId;
        const userRole = req.user.role;

        // Admin can access everything
        if (userRole === 'admin') {
          return next();
        }

        // Check ownership based on resource type
        const { database } = require('../database');
        const db = database.sqlite;
        let query, params;

        switch (resourceType) {
          case 'client':
            query = 'SELECT created_by FROM clients WHERE id = ?';
            params = [resourceId];
            break;
          case 'quote':
            query = 'SELECT created_by FROM quotes WHERE id = ?';
            params = [resourceId];
            break;
          case 'user':
            // Users can only access their own profile (except admins)
            if (resourceId !== userId.toString()) {
              return res.status(403).json({ 
                success: false, 
                message: 'Access denied' 
              });
            }
            return next();
          default:
            return res.status(400).json({ 
              success: false, 
              message: 'Invalid resource type' 
            });
        }

        const [results] = await db.execute(query, params);

        if (results.length === 0) {
          return res.status(404).json({ 
            success: false, 
            message: `${resourceType} not found` 
          });
        }

        const resource = results[0];

        // Check if user owns the resource or is a manager
        if (resource.created_by !== userId && userRole !== 'manager') {
          return res.status(403).json({ 
            success: false, 
            message: 'Access denied' 
          });
        }

        next();
      } catch (error) {
        console.error('Ownership validation error:', error);
        return res.status(500).json({ 
          success: false, 
          message: 'Internal server error' 
        });
      }
    };
  }
}

module.exports = new AuthMiddleware();