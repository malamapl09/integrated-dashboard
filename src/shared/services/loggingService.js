const winston = require('winston');
const path = require('path');
const fs = require('fs');

class LoggingService {
    constructor() {
        this.logsDir = path.join(process.cwd(), 'logs');
        this.createLogsDirectory();
        this.initializeLoggers();
        this.metrics = {
            requestCount: 0,
            errorCount: 0,
            dbQueryCount: 0,
            averageResponseTime: 0,
            lastErrors: [],
            systemHealth: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                pid: process.pid
            }
        };
        this.startMetricsCollection();
    }

    createLogsDirectory() {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
    }

    initializeLoggers() {
        // Main application logger
        this.logger = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
                    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
                    if (Object.keys(meta).length > 0) {
                        log += ` | ${JSON.stringify(meta)}`;
                    }
                    if (stack) {
                        log += `\n${stack}`;
                    }
                    return log;
                })
            ),
            defaultMeta: { service: 'integrated-dashboard' },
            transports: [
                // Console output
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    )
                }),
                // Error log file
                new winston.transports.File({
                    filename: path.join(this.logsDir, 'error.log'),
                    level: 'error',
                    maxsize: 10 * 1024 * 1024, // 10MB
                    maxFiles: 5
                }),
                // Combined log file
                new winston.transports.File({
                    filename: path.join(this.logsDir, 'combined.log'),
                    maxsize: 20 * 1024 * 1024, // 20MB
                    maxFiles: 10
                })
            ]
        });

        // Request logger for API calls
        this.requestLogger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    return `${timestamp} [REQUEST]: ${message} | ${JSON.stringify(meta)}`;
                })
            ),
            transports: [
                new winston.transports.File({
                    filename: path.join(this.logsDir, 'requests.log'),
                    maxsize: 50 * 1024 * 1024, // 50MB
                    maxFiles: 5
                })
            ]
        });

        // Performance logger
        this.performanceLogger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    return `${timestamp} [PERFORMANCE]: ${message} | ${JSON.stringify(meta)}`;
                })
            ),
            transports: [
                new winston.transports.File({
                    filename: path.join(this.logsDir, 'performance.log'),
                    maxsize: 20 * 1024 * 1024, // 20MB
                    maxFiles: 3
                })
            ]
        });

        // Database logger
        this.dbLogger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    return `${timestamp} [DATABASE]: ${message} | ${JSON.stringify(meta)}`;
                })
            ),
            transports: [
                new winston.transports.File({
                    filename: path.join(this.logsDir, 'database.log'),
                    maxsize: 20 * 1024 * 1024, // 20MB
                    maxFiles: 3
                })
            ]
        });
    }

    startMetricsCollection() {
        // Update system metrics every 30 seconds
        setInterval(() => {
            this.metrics.systemHealth = {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                pid: process.pid,
                timestamp: new Date().toISOString()
            };
        }, 30000);
    }

    // General logging methods
    info(message, meta = {}) {
        this.logger.info(message, meta);
    }

    warn(message, meta = {}) {
        this.logger.warn(message, meta);
    }

    error(message, error = null, meta = {}) {
        const errorMeta = {
            ...meta,
            ...(error && {
                error: error.message,
                stack: error.stack,
                code: error.code
            })
        };
        
        this.logger.error(message, errorMeta);
        this.metrics.errorCount++;
        
        // Keep track of recent errors
        this.metrics.lastErrors.unshift({
            message,
            error: error ? error.message : null,
            timestamp: new Date().toISOString(),
            meta: errorMeta
        });
        
        // Keep only last 10 errors
        if (this.metrics.lastErrors.length > 10) {
            this.metrics.lastErrors = this.metrics.lastErrors.slice(0, 10);
        }
    }

    debug(message, meta = {}) {
        this.logger.debug(message, meta);
    }

    // Request logging
    logRequest(req, res, responseTime) {
        this.metrics.requestCount++;
        
        // Update average response time
        this.metrics.averageResponseTime = 
            (this.metrics.averageResponseTime * (this.metrics.requestCount - 1) + responseTime) / 
            this.metrics.requestCount;

        const logData = {
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
            responseTime: `${responseTime}ms`,
            userAgent: req.get('User-Agent'),
            ip: req.ip,
            userId: req.user ? req.user.id : null,
            contentLength: res.get('Content-Length') || 0
        };

        this.requestLogger.info(`${req.method} ${req.originalUrl} - ${res.statusCode}`, logData);
        
        // Log slow requests as warnings
        if (responseTime > 2000) {
            this.warn(`Slow request detected`, logData);
        }
    }

    // Performance logging
    logPerformance(operation, duration, meta = {}) {
        const perfData = {
            operation,
            duration: `${duration}ms`,
            ...meta
        };

        this.performanceLogger.info(`${operation} completed`, perfData);
        
        // Log slow operations
        if (duration > 1000) {
            this.warn(`Slow operation detected: ${operation}`, perfData);
        }
    }

    // Database logging
    logDatabaseQuery(query, duration, params = {}) {
        this.metrics.dbQueryCount++;
        
        const queryData = {
            query: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
            duration: `${duration}ms`,
            params: JSON.stringify(params).substring(0, 500)
        };

        this.dbLogger.info('Database query executed', queryData);
        
        // Log slow queries
        if (duration > 1000) {
            this.warn(`Slow database query detected`, queryData);
        }
    }

    logDatabaseError(error, query = '', params = {}) {
        const errorData = {
            error: error.message,
            code: error.code,
            query: query.substring(0, 200),
            params: JSON.stringify(params).substring(0, 200)
        };

        this.dbLogger.error('Database error occurred', errorData);
        this.error('Database operation failed', error, errorData);
    }

    // System monitoring
    logSystemEvent(event, data = {}) {
        this.info(`System event: ${event}`, {
            event,
            ...data,
            timestamp: new Date().toISOString()
        });
    }

    // Authentication logging
    logAuthEvent(event, userId, ip, details = {}) {
        const authData = {
            event,
            userId,
            ip,
            timestamp: new Date().toISOString(),
            ...details
        };

        this.info(`Auth event: ${event}`, authData);
    }

    // Get metrics for monitoring dashboard
    getMetrics() {
        return {
            ...this.metrics,
            systemHealth: {
                ...this.metrics.systemHealth,
                uptime: process.uptime(),
                memory: process.memoryUsage()
            }
        };
    }

    // Get recent logs for monitoring dashboard
    async getRecentLogs(lines = 100, logType = 'combined') {
        return new Promise((resolve, reject) => {
            const logFile = path.join(this.logsDir, `${logType}.log`);
            
            if (!fs.existsSync(logFile)) {
                return resolve([]);
            }

            const spawn = require('child_process').spawn;
            const tail = spawn('tail', ['-n', lines.toString(), logFile]);
            
            let output = '';
            
            tail.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            tail.on('close', (code) => {
                if (code === 0) {
                    const logs = output.split('\n')
                        .filter(line => line.trim())
                        .map(line => {
                            try {
                                // Parse log line to extract timestamp, level, message
                                const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z) \[(\w+)\]: (.+)$/);
                                if (match) {
                                    return {
                                        timestamp: match[1],
                                        level: match[2],
                                        message: match[3],
                                        raw: line
                                    };
                                }
                                return { raw: line, timestamp: new Date().toISOString() };
                            } catch (e) {
                                return { raw: line, timestamp: new Date().toISOString() };
                            }
                        });
                    resolve(logs);
                } else {
                    reject(new Error(`Failed to read log file: ${logFile}`));
                }
            });
        });
    }

    // Cleanup old log files
    cleanupLogs() {
        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
        const now = Date.now();
        
        try {
            const files = fs.readdirSync(this.logsDir);
            
            files.forEach(file => {
                const filePath = path.join(this.logsDir, file);
                const stats = fs.statSync(filePath);
                
                if (now - stats.mtime.getTime() > maxAge) {
                    fs.unlinkSync(filePath);
                    this.info(`Cleaned up old log file: ${file}`);
                }
            });
        } catch (error) {
            this.error('Failed to cleanup old log files', error);
        }
    }
}

// Create singleton instance
const loggingService = new LoggingService();

module.exports = loggingService;