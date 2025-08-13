const authService = require('../services/authService');
const rateLimit = require('express-rate-limit');

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const token = authHeader.substring(7);

    // Verify JWT token
    const decoded = authService.verifyToken(token);
    
    // Validate session in database
    const session = await authService.validateSession(decoded.tokenId);
    
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    // Add user info to request
    req.user = {
      id: session.id,
      username: session.username,
      email: session.email,
      role: session.role,
      tokenId: decoded.tokenId
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Authorization middleware (role-based)
const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // If no roles specified, just check if authenticated
    if (roles.length === 0) {
      return next();
    }

    // Check if user has required role
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: roles,
        current: req.user.role
      });
    }

    next();
  };
};

// Optional authentication (for endpoints that work with or without auth)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = authService.verifyToken(token);
    const session = await authService.validateSession(decoded.tokenId);
    
    if (session) {
      req.user = {
        id: session.id,
        username: session.username,
        email: session.email,
        role: session.role,
        tokenId: decoded.tokenId
      };
    }

    next();
  } catch (error) {
    // Ignore auth errors for optional auth
    next();
  }
};

// Rate limiting for authentication endpoints
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    error: 'Too many authentication attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false
});

// Rate limiting for general API endpoints
const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    error: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for admin users
    return req.user && req.user.role === 'admin';
  }
});

// Validation middleware for user ownership
const validateOwnership = (resourceType) => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params.id;
      const userId = req.user.id;
      const userRole = req.user.role;

      // Admin can access everything
      if (userRole === 'admin') {
        return next();
      }

      // Check ownership based on resource type
      const { pool } = require('../config/database');
      let query;
      let params;

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
            return res.status(403).json({ error: 'Access denied' });
          }
          return next();
        default:
          return res.status(400).json({ error: 'Invalid resource type' });
      }

      const [results] = await pool.execute(query, params);

      if (results.length === 0) {
        return res.status(404).json({ error: `${resourceType} not found` });
      }

      const resource = results[0];

      // Check if user owns the resource or is a manager
      if (resource.created_by !== userId && userRole !== 'manager') {
        return res.status(403).json({ error: 'Access denied' });
      }

      next();
    } catch (error) {
      console.error('Ownership validation error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
};

// Security headers middleware
const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  if (req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
};

module.exports = {
  authenticate,
  authorize,
  optionalAuth,
  authRateLimit,
  apiRateLimit,
  validateOwnership,
  securityHeaders
};