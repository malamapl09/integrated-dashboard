const express = require('express');
const { authenticate, authorize } = require('../../../shared/middleware/authMiddleware');
const logger = require('../utils/logger');
const { pool } = require('../config/database');
const emailService = require('../services/emailService');
const emailQueueService = require('../services/emailQueueService');
const router = express.Router();

// System health check
router.get('/health', authenticate, authorize(['admin']), async (req, res) => {
    const startTime = Date.now();
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {},
        system: {}
    };

    try {
        // Database health
        try {
            const [result] = await pool.execute('SELECT 1 as test');
            health.services.database = {
                status: 'healthy',
                responseTime: Date.now() - startTime,
                details: 'SQLite connection successful'
            };
        } catch (error) {
            health.services.database = {
                status: 'unhealthy',
                error: error.message
            };
            health.status = 'degraded';
        }

        // Email service health
        health.services.email = {
            status: emailService.isConfigured() ? 'healthy' : 'not_configured',
            configured: emailService.isConfigured()
        };

        // Email queue health
        try {
            const queueStats = await emailQueueService.getQueueStats();
            health.services.emailQueue = {
                status: 'healthy',
                stats: queueStats
            };
        } catch (error) {
            health.services.emailQueue = {
                status: 'unhealthy',
                error: error.message
            };
        }

        // System resources
        health.system = {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            node_version: process.version,
            platform: process.platform,
            pid: process.pid
        };

        // Log health check
        logger.healthLogger('system', health.status, {
            responseTime: Date.now() - startTime,
            services: Object.keys(health.services).length
        });

        res.json(health);
    } catch (error) {
        logger.error('Health check failed', { error, req });
        res.status(500).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Get recent logs
router.get('/logs', authenticate, authorize(['admin']), (req, res) => {
    try {
        const { lines = 100, level, type } = req.query;
        let logs = logger.getRecentLogs(parseInt(lines));

        // Filter by level
        if (level) {
            logs = logs.filter(log => log.level === level.toUpperCase());
        }

        // Filter by type
        if (type) {
            logs = logs.filter(log => log.type === type.toUpperCase());
        }

        logger.info('Debug logs accessed', { 
            req, 
            lines: logs.length, 
            filters: { level, type } 
        });

        res.json({
            total: logs.length,
            logs
        });
    } catch (error) {
        logger.error('Failed to retrieve logs', { error, req });
        res.status(500).json({ error: 'Failed to retrieve logs' });
    }
});

// Get log statistics
router.get('/logs/stats', authenticate, authorize(['admin']), (req, res) => {
    try {
        const stats = logger.getLogStats();
        res.json(stats);
    } catch (error) {
        logger.error('Failed to get log statistics', { error, req });
        res.status(500).json({ error: 'Failed to get log statistics' });
    }
});

// Database diagnostics
router.get('/database', authenticate, authorize(['admin']), async (req, res) => {
    const startTime = Date.now();
    
    try {
        const diagnostics = {
            sqlite: {},
            performance: {}
        };

        // SQLite info
        try {
            const [pragmas] = await pool.execute('PRAGMA database_list');
            diagnostics.sqlite.databases = pragmas;

            const [tables] = await pool.execute("SELECT name FROM sqlite_master WHERE type='table'");
            diagnostics.sqlite.tables = tables.map(t => t.name);

            // Get connection pool stats if available
            if (pool.getStats) {
                diagnostics.sqlite.connectionPool = pool.getStats();
            }

            // Performance test
            const perfStart = Date.now();
            await pool.execute('SELECT COUNT(*) as count FROM quotes');
            diagnostics.performance.simpleQuery = Date.now() - perfStart;

        } catch (error) {
            diagnostics.sqlite.error = error.message;
        }

        const totalTime = Date.now() - startTime;
        diagnostics.performance.totalTime = totalTime;

        logger.debug('Database diagnostics accessed', { req, responseTime: totalTime });
        res.json(diagnostics);
    } catch (error) {
        logger.error('Database diagnostics failed', { error, req });
        res.status(500).json({ error: 'Failed to get database diagnostics' });
    }
});

// Environment info
router.get('/environment', authenticate, authorize(['admin']), (req, res) => {
    try {
        const env = {
            node_version: process.version,
            platform: process.platform,
            arch: process.arch,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            pid: process.pid,
            ppid: process.ppid,
            environment: process.env.NODE_ENV,
            port: process.env.PORT,
            log_level: process.env.LOG_LEVEL,
            // Don't expose sensitive data
            config: {
                email_configured: !!process.env.SMTP_HOST,
                database_configured: !!process.env.PIM_DB_HOST,
                jwt_configured: !!process.env.JWT_SECRET
            }
        };

        logger.debug('Environment info accessed', { req });
        res.json(env);
    } catch (error) {
        logger.error('Failed to get environment info', { error, req });
        res.status(500).json({ error: 'Failed to get environment info' });
    }
});

// Test error handling
router.post('/test-error', authenticate, authorize(['admin']), (req, res) => {
    const { type = 'generic' } = req.body;
    
    logger.warn('Test error triggered by admin', { req, errorType: type });

    switch (type) {
        case 'database':
            pool.execute('SELECT * FROM non_existent_table')
                .catch(error => {
                    logger.error('Test database error', { error, req });
                    res.status(500).json({ error: 'Test database error triggered' });
                });
            break;
        
        case 'email':
            emailService.sendTestEmail('invalid-email', 'Test User')
                .catch(error => {
                    logger.error('Test email error', { error, req });
                    res.status(500).json({ error: 'Test email error triggered' });
                });
            break;
        
        case 'javascript':
            // Intentional error
            const obj = null;
            obj.property.access(); // This will throw
            break;
        
        case 'async':
            setTimeout(() => {
                throw new Error('Test async error');
            }, 100);
            res.json({ message: 'Async error will be thrown in 100ms' });
            break;
            
        default:
            throw new Error(`Test error of type: ${type}`);
    }
});

// Performance metrics
router.get('/performance', authenticate, authorize(['admin']), async (req, res) => {
    const startTime = Date.now();
    
    try {
        const metrics = {
            timestamp: new Date().toISOString(),
            system: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage()
            },
            database: {},
            response_times: {}
        };

        // Database performance
        const dbStart = Date.now();
        try {
            await pool.execute('SELECT 1');
            metrics.database.simple_query = Date.now() - dbStart;
            
            const countStart = Date.now();
            const [result] = await pool.execute('SELECT COUNT(*) as count FROM quotes');
            metrics.database.count_query = Date.now() - countStart;
            metrics.database.quote_count = result[0].count;
        } catch (error) {
            metrics.database.error = error.message;
        }

        // Response time for this request
        metrics.response_times.total = Date.now() - startTime;

        logger.performanceLogger('debug_performance_check', Date.now() - startTime, {
            req,
            metrics
        });

        res.json(metrics);
    } catch (error) {
        logger.error('Performance metrics failed', { error, req });
        res.status(500).json({ error: 'Failed to get performance metrics' });
    }
});

// Clear logs (for testing)
router.delete('/logs', authenticate, authorize(['admin']), (req, res) => {
    try {
        const fs = require('fs');
        const logFile = logger.logFile;
        
        if (fs.existsSync(logFile)) {
            fs.writeFileSync(logFile, '');
            logger.info('Debug logs cleared by admin', { req });
        }
        
        res.json({ message: 'Logs cleared successfully' });
    } catch (error) {
        logger.error('Failed to clear logs', { error, req });
        res.status(500).json({ error: 'Failed to clear logs' });
    }
});

// Generate test data for debugging
router.post('/generate-test-data', authenticate, authorize(['admin']), async (req, res) => {
    const { count = 10 } = req.body;
    
    try {
        logger.info(`Generating ${count} test log entries`, { req });
        
        for (let i = 0; i < count; i++) {
            const level = ['info', 'warn', 'error', 'debug'][Math.floor(Math.random() * 4)];
            const message = `Test log entry ${i + 1}`;
            
            logger.log(level, message, {
                type: 'TEST_DATA',
                iteration: i + 1,
                timestamp: new Date().toISOString()
            });
            
            // Small delay to spread timestamps
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        res.json({ message: `Generated ${count} test log entries` });
    } catch (error) {
        logger.error('Failed to generate test data', { error, req });
        res.status(500).json({ error: 'Failed to generate test data' });
    }
});

module.exports = router;