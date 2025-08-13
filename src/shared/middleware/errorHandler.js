const logger = require('../utils/logger');

// Global error handler middleware
function globalErrorHandler(error, req, res, next) {
    // Default error response
    let statusCode = error.statusCode || error.status || 500;
    let message = error.message || 'Internal Server Error';
    let errorCode = error.code || 'INTERNAL_ERROR';

    // Handle specific error types
    if (error.name === 'ValidationError') {
        statusCode = 400;
        errorCode = 'VALIDATION_ERROR';
        message = 'Validation failed';
    } else if (error.name === 'CastError') {
        statusCode = 400;
        errorCode = 'INVALID_DATA';
        message = 'Invalid data format';
    } else if (error.code === 'ETIMEDOUT') {
        statusCode = 504;
        errorCode = 'TIMEOUT';
        message = 'Request timeout';
    } else if (error.code === 'ECONNREFUSED') {
        statusCode = 503;
        errorCode = 'SERVICE_UNAVAILABLE';
        message = 'Service temporarily unavailable';
    } else if (error.name === 'JsonWebTokenError') {
        statusCode = 401;
        errorCode = 'INVALID_TOKEN';
        message = 'Invalid authentication token';
    } else if (error.name === 'TokenExpiredError') {
        statusCode = 401;
        errorCode = 'TOKEN_EXPIRED';
        message = 'Authentication token expired';
    }

    // Log the error
    const logLevel = statusCode >= 500 ? 'error' : 'warn';
    logger.log(logLevel, `${req.method} ${req.url} - ${statusCode} - ${message}`, {
        req,
        error,
        statusCode,
        errorCode,
        stack: error.stack,
        type: 'ERROR_HANDLER'
    });

    // Send error response
    const errorResponse = {
        error: {
            code: errorCode,
            message: message,
            statusCode: statusCode
        },
        timestamp: new Date().toISOString(),
        path: req.url,
        method: req.method
    };

    // Add error details in development
    if (process.env.NODE_ENV === 'development') {
        errorResponse.error.stack = error.stack;
        errorResponse.error.details = error;
    }

    res.status(statusCode).json(errorResponse);
}

// 404 handler
function notFoundHandler(req, res, next) {
    const error = new Error(`Route ${req.method} ${req.url} not found`);
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    
    logger.warn(`404 - Route not found: ${req.method} ${req.url}`, {
        req,
        type: 'NOT_FOUND'
    });
    
    res.status(404).json({
        error: {
            code: 'NOT_FOUND',
            message: `Route ${req.method} ${req.url} not found`,
            statusCode: 404
        },
        timestamp: new Date().toISOString(),
        path: req.url,
        method: req.method
    });
}

// Async error wrapper
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

// Process-level error handlers
function setupProcessErrorHandlers() {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception', {
            error,
            type: 'UNCAUGHT_EXCEPTION'
        });
        
        // Give time for logs to flush before exiting
        setTimeout(() => {
            process.exit(1);
        }, 1000);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Promise Rejection', {
            error: reason,
            promise: promise.toString(),
            type: 'UNHANDLED_REJECTION'
        });
        
        // Don't exit on unhandled rejections in production
        // but log them for debugging
    });

    // Handle SIGTERM gracefully
    process.on('SIGTERM', () => {
        logger.info('SIGTERM received, shutting down gracefully', {
            type: 'SHUTDOWN'
        });
        process.exit(0);
    });

    // Handle SIGINT gracefully
    process.on('SIGINT', () => {
        logger.info('SIGINT received, shutting down gracefully', {
            type: 'SHUTDOWN'
        });
        process.exit(0);
    });
}

// Database error handler
function handleDatabaseError(error, operation = 'database operation') {
    const errorInfo = {
        operation,
        code: error.code,
        errno: error.errno,
        sqlState: error.sqlState,
        message: error.message
    };

    if (error.code === 'ETIMEDOUT') {
        logger.warn(`Database timeout during ${operation}`, {
            error: errorInfo,
            type: 'DATABASE_TIMEOUT'
        });
        throw new Error('Database operation timed out');
    } else if (error.code === 'ECONNREFUSED') {
        logger.error(`Database connection refused during ${operation}`, {
            error: errorInfo,
            type: 'DATABASE_CONNECTION_REFUSED'
        });
        throw new Error('Database connection unavailable');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
        logger.error(`Database access denied during ${operation}`, {
            error: errorInfo,
            type: 'DATABASE_ACCESS_DENIED'
        });
        throw new Error('Database access denied');
    } else {
        logger.error(`Database error during ${operation}`, {
            error: errorInfo,
            type: 'DATABASE_ERROR'
        });
        throw error;
    }
}

// Email error handler
function handleEmailError(error, operation = 'email operation', recipient = null) {
    const errorInfo = {
        operation,
        recipient,
        code: error.code,
        message: error.message
    };

    if (error.code === 'ETIMEDOUT') {
        logger.warn(`Email timeout during ${operation}`, {
            error: errorInfo,
            type: 'EMAIL_TIMEOUT'
        });
        throw new Error('Email service timeout');
    } else if (error.code === 'ECONNREFUSED') {
        logger.error(`Email connection refused during ${operation}`, {
            error: errorInfo,
            type: 'EMAIL_CONNECTION_REFUSED'
        });
        throw new Error('Email service unavailable');
    } else if (error.responseCode >= 500) {
        logger.error(`Email server error during ${operation}`, {
            error: errorInfo,
            type: 'EMAIL_SERVER_ERROR'
        });
        throw new Error('Email server error');
    } else {
        logger.error(`Email error during ${operation}`, {
            error: errorInfo,
            type: 'EMAIL_ERROR'
        });
        throw error;
    }
}

// Validation error handler
function handleValidationError(errors, req = null) {
    const validationErrors = errors.array ? errors.array() : errors;
    
    logger.warn('Validation failed', {
        req,
        errors: validationErrors,
        type: 'VALIDATION_ERROR'
    });
    
    const error = new Error('Validation failed');
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    error.details = validationErrors;
    
    throw error;
}

module.exports = {
    globalErrorHandler,
    notFoundHandler,
    asyncHandler,
    setupProcessErrorHandlers,
    handleDatabaseError,
    handleEmailError,
    handleValidationError
};