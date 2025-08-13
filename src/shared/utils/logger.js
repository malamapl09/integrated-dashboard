const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.logFile = process.env.LOG_FILE || './logs/app.log';
        this.maxFileSize = 10 * 1024 * 1024; // 10MB
        this.maxFiles = 5;
        
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3,
            trace: 4
        };
        
        this.colors = {
            error: '\x1b[31m', // Red
            warn: '\x1b[33m',  // Yellow
            info: '\x1b[36m',  // Cyan
            debug: '\x1b[35m', // Magenta
            trace: '\x1b[37m', // White
            reset: '\x1b[0m'
        };
        
        this.ensureLogDirectory();
    }

    ensureLogDirectory() {
        const logDir = path.dirname(this.logFile);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    }

    shouldLog(level) {
        return this.levels[level] <= this.levels[this.logLevel];
    }

    formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const pid = process.pid;
        
        // Create base log object
        const logObj = {
            timestamp,
            level: level.toUpperCase(),
            pid,
            message,
            ...meta
        };

        // Add request context if available
        if (meta.req) {
            logObj.request = {
                method: meta.req.method,
                url: meta.req.url,
                ip: meta.req.ip || meta.req.connection.remoteAddress,
                userAgent: meta.req.get('User-Agent'),
                userId: meta.req.user?.id,
                username: meta.req.user?.username
            };
            delete logObj.req; // Remove the original req object
        }

        // Add error details if present
        if (meta.error) {
            logObj.error = {
                name: meta.error.name,
                message: meta.error.message,
                stack: meta.error.stack,
                code: meta.error.code,
                statusCode: meta.error.statusCode
            };
            delete logObj.error; // Remove the original error object
        }

        return logObj;
    }

    log(level, message, meta = {}) {
        if (!this.shouldLog(level)) return;

        const logObj = this.formatMessage(level, message, meta);
        
        // Console output with colors
        const color = this.colors[level] || this.colors.reset;
        const consoleMessage = `${color}[${logObj.timestamp}] ${logObj.level}${this.colors.reset}: ${message}`;
        
        if (level === 'error') {
            console.error(consoleMessage);
            if (meta.error) {
                console.error(meta.error.stack);
            }
        } else {
            console.log(consoleMessage);
        }

        // File output as JSON
        try {
            this.rotateLogFile();
            const logLine = JSON.stringify(logObj) + '\n';
            fs.appendFileSync(this.logFile, logLine);
        } catch (error) {
            console.error('Failed to write to log file:', error.message);
        }
    }

    rotateLogFile() {
        try {
            if (!fs.existsSync(this.logFile)) return;
            
            const stats = fs.statSync(this.logFile);
            if (stats.size < this.maxFileSize) return;

            // Rotate log files
            for (let i = this.maxFiles - 1; i > 0; i--) {
                const oldFile = `${this.logFile}.${i}`;
                const newFile = `${this.logFile}.${i + 1}`;
                
                if (fs.existsSync(oldFile)) {
                    if (i === this.maxFiles - 1) {
                        fs.unlinkSync(oldFile); // Delete oldest
                    } else {
                        fs.renameSync(oldFile, newFile);
                    }
                }
            }
            
            // Move current log to .1
            fs.renameSync(this.logFile, `${this.logFile}.1`);
        } catch (error) {
            console.error('Log rotation failed:', error.message);
        }
    }

    // Convenience methods
    error(message, meta = {}) {
        this.log('error', message, meta);
    }

    warn(message, meta = {}) {
        this.log('warn', message, meta);
    }

    info(message, meta = {}) {
        this.log('info', message, meta);
    }

    debug(message, meta = {}) {
        this.log('debug', message, meta);
    }

    trace(message, meta = {}) {
        this.log('trace', message, meta);
    }

    // Express middleware for request logging
    requestLogger() {
        return (req, res, next) => {
            const start = Date.now();
            
            // Log request start
            this.info(`${req.method} ${req.url}`, {
                req,
                type: 'REQUEST_START'
            });

            // Override res.end to log response
            const originalEnd = res.end;
            res.end = (...args) => {
                const duration = Date.now() - start;
                const level = res.statusCode >= 400 ? 'warn' : 'info';
                
                this.log(level, `${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`, {
                    req,
                    type: 'REQUEST_END',
                    statusCode: res.statusCode,
                    duration,
                    contentLength: res.get('Content-Length')
                });

                return originalEnd.apply(res, args);
            };

            next();
        };
    }

    // Database query logger
    queryLogger(query, params = [], duration = 0, error = null) {
        const level = error ? 'error' : (duration > 1000 ? 'warn' : 'debug');
        const message = error ? `Database query failed: ${query}` : `Database query executed: ${query}`;
        
        this.log(level, message, {
            type: 'DATABASE_QUERY',
            query: query.length > 500 ? query.substring(0, 500) + '...' : query,
            params: params.length > 0 ? params : undefined,
            duration,
            error
        });
    }

    // Email logger
    emailLogger(type, data, error = null) {
        const level = error ? 'error' : 'info';
        const message = error ? `Email ${type} failed` : `Email ${type} successful`;
        
        this.log(level, message, {
            type: 'EMAIL',
            emailType: type,
            recipient: data.recipient,
            subject: data.subject,
            messageId: data.messageId,
            error
        });
    }

    // Authentication logger
    authLogger(type, username, success = true, error = null, req = null) {
        const level = success ? 'info' : 'warn';
        const message = `Authentication ${type}: ${username} - ${success ? 'SUCCESS' : 'FAILED'}`;
        
        this.log(level, message, {
            req,
            type: 'AUTHENTICATION',
            authType: type,
            username,
            success,
            error
        });
    }

    // Performance logger
    performanceLogger(operation, duration, metadata = {}) {
        const level = duration > 5000 ? 'warn' : duration > 1000 ? 'info' : 'debug';
        const message = `Performance: ${operation} completed in ${duration}ms`;
        
        this.log(level, message, {
            type: 'PERFORMANCE',
            operation,
            duration,
            ...metadata
        });
    }

    // System health logger
    healthLogger(component, status, details = {}) {
        const level = status === 'healthy' ? 'info' : 'warn';
        const message = `Health check: ${component} is ${status}`;
        
        this.log(level, message, {
            type: 'HEALTH_CHECK',
            component,
            status,
            ...details
        });
    }

    // Get recent logs (for debugging endpoints)
    getRecentLogs(lines = 100) {
        try {
            if (!fs.existsSync(this.logFile)) return [];
            
            const data = fs.readFileSync(this.logFile, 'utf8');
            const logLines = data.trim().split('\n');
            
            return logLines
                .slice(-lines)
                .map(line => {
                    try {
                        return JSON.parse(line);
                    } catch (e) {
                        return { message: line, level: 'UNKNOWN', timestamp: new Date().toISOString() };
                    }
                })
                .reverse(); // Most recent first
        } catch (error) {
            this.error('Failed to read log file', { error });
            return [];
        }
    }

    // Get log statistics
    getLogStats() {
        try {
            const logs = this.getRecentLogs(1000); // Last 1000 logs
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            
            const recentLogs = logs.filter(log => new Date(log.timestamp) > oneHourAgo);
            
            const stats = {
                total: logs.length,
                lastHour: recentLogs.length,
                levels: {},
                types: {},
                errors: []
            };

            logs.forEach(log => {
                // Count by level
                stats.levels[log.level] = (stats.levels[log.level] || 0) + 1;
                
                // Count by type
                if (log.type) {
                    stats.types[log.type] = (stats.types[log.type] || 0) + 1;
                }
                
                // Collect recent errors
                if (log.level === 'ERROR' && stats.errors.length < 10) {
                    stats.errors.push({
                        timestamp: log.timestamp,
                        message: log.message,
                        error: log.error
                    });
                }
            });

            return stats;
        } catch (error) {
            this.error('Failed to generate log statistics', { error });
            return null;
        }
    }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;