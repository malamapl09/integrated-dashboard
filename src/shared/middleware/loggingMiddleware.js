const loggingService = require('../services/loggingService');

/**
 * Request logging middleware
 * Tracks all API requests with timing, user info, and response details
 */
const requestLogger = (req, res, next) => {
    const startTime = Date.now();
    const originalUrl = req.originalUrl;
    const method = req.method;
    
    // Skip logging for static files and health checks
    if (originalUrl.includes('/public') || 
        originalUrl.includes('/favicon.ico') || 
        originalUrl.includes('/static') ||
        originalUrl === '/api/health') {
        return next();
    }

    // Log request start
    loggingService.debug(`Incoming request: ${method} ${originalUrl}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        contentType: req.get('Content-Type'),
        userId: req.user ? req.user.id : null
    });

    // Override res.end to capture response details
    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        // Log the completed request
        loggingService.logRequest(req, res, responseTime);
        
        // Call original end function
        originalEnd.call(res, chunk, encoding);
    };

    next();
};

/**
 * Error logging middleware
 * Captures and logs all Express errors
 */
const errorLogger = (err, req, res, next) => {
    const errorInfo = {
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user ? req.user.id : null,
        body: req.method === 'POST' || req.method === 'PUT' ? 
              JSON.stringify(req.body).substring(0, 500) : null
    };

    loggingService.error(`API Error: ${err.message}`, err, errorInfo);
    
    // Don't expose internal errors to client in production
    if (process.env.NODE_ENV === 'production') {
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    } else {
        res.status(err.status || 500).json({
            success: false,
            message: err.message,
            stack: err.stack
        });
    }
};

/**
 * Authentication event logger
 * Logs authentication-related events
 */
const authLogger = {
    logLogin: (userId, ip, success, details = {}) => {
        loggingService.logAuthEvent(
            success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED',
            userId,
            ip,
            details
        );
    },

    logLogout: (userId, ip) => {
        loggingService.logAuthEvent('LOGOUT', userId, ip);
    },

    logTokenRefresh: (userId, ip) => {
        loggingService.logAuthEvent('TOKEN_REFRESH', userId, ip);
    },

    logPasswordChange: (userId, ip) => {
        loggingService.logAuthEvent('PASSWORD_CHANGE', userId, ip);
    },

    logAccountLocked: (userId, ip, reason) => {
        loggingService.logAuthEvent('ACCOUNT_LOCKED', userId, ip, { reason });
    },

    logUnauthorizedAccess: (userId, ip, resource) => {
        loggingService.logAuthEvent('UNAUTHORIZED_ACCESS', userId, ip, { resource });
    }
};

/**
 * Database operation logger
 * Wraps database operations with performance and error logging
 */
const dbLogger = {
    wrapQuery: async (queryFn, query, params = {}) => {
        const startTime = Date.now();
        
        try {
            const result = await queryFn();
            const duration = Date.now() - startTime;
            
            loggingService.logDatabaseQuery(query, duration, params);
            
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            
            loggingService.logDatabaseError(error, query, params);
            throw error;
        }
    },

    logConnectionEvent: (database, event, details = {}) => {
        loggingService.info(`Database connection event: ${database} - ${event}`, {
            database,
            event,
            ...details
        });
    },

    logConnectionError: (database, error) => {
        loggingService.error(`Database connection failed: ${database}`, error, {
            database: database
        });
    }
};

/**
 * System monitoring middleware
 * Tracks system health and performance metrics
 */
const systemMonitor = {
    logSystemStart: () => {
        loggingService.logSystemEvent('APPLICATION_START', {
            nodeVersion: process.version,
            platform: process.platform,
            pid: process.pid,
            environment: process.env.NODE_ENV || 'development'
        });
    },

    logSystemShutdown: () => {
        loggingService.logSystemEvent('APPLICATION_SHUTDOWN', {
            uptime: process.uptime()
        });
    },

    logMemoryUsage: () => {
        const memory = process.memoryUsage();
        if (memory.heapUsed / memory.heapTotal > 0.9) {
            loggingService.warn('High memory usage detected', {
                heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
                heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)}MB`,
                usage: `${Math.round((memory.heapUsed / memory.heapTotal) * 100)}%`
            });
        }
    },

    startHealthChecks: () => {
        // Check memory usage every 5 minutes
        setInterval(() => {
            systemMonitor.logMemoryUsage();
        }, 5 * 60 * 1000);

        // Log system stats every hour
        setInterval(() => {
            const metrics = loggingService.getMetrics();
            loggingService.info('Hourly system report', {
                requests: metrics.requestCount,
                errors: metrics.errorCount,
                dbQueries: metrics.dbQueryCount,
                avgResponseTime: `${Math.round(metrics.averageResponseTime)}ms`,
                uptime: `${Math.round(process.uptime())}s`
            });
        }, 60 * 60 * 1000);
    }
};

/**
 * Rate limiting logger
 * Logs rate limiting events
 */
const rateLimitLogger = (req, res, next) => {
    // This will be called by express-rate-limit when limit is hit
    loggingService.warn('Rate limit exceeded', {
        ip: req.ip,
        url: req.originalUrl,
        userAgent: req.get('User-Agent'),
        userId: req.user ? req.user.id : null
    });
    
    res.status(429).json({
        success: false,
        message: 'Too many requests, please try again later'
    });
};

module.exports = {
    requestLogger,
    errorLogger,
    authLogger,
    dbLogger,
    systemMonitor,
    rateLimitLogger
};