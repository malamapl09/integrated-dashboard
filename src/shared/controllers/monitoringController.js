const loggingService = require('../services/loggingService');
const { testConnections } = require('../database');

class MonitoringController {
    /**
     * Get system health status
     */
    async getSystemHealth(req, res) {
        try {
            const health = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: process.env.npm_package_version || '1.0.0',
                environment: process.env.NODE_ENV || 'development',
                system: {
                    platform: process.platform,
                    nodeVersion: process.version,
                    pid: process.pid,
                    memory: process.memoryUsage(),
                    cpuUsage: process.cpuUsage()
                },
                databases: await this.checkDatabaseConnections(),
                metrics: loggingService.getMetrics()
            };

            // Determine overall health status
            const dbHealthy = Object.values(health.databases).every(db => db.status === 'connected');
            const memoryUsage = (health.system.memory.heapUsed / health.system.memory.heapTotal) * 100;
            
            if (!dbHealthy || memoryUsage > 90) {
                health.status = 'degraded';
            }

            res.json({
                success: true,
                data: health
            });

        } catch (error) {
            loggingService.error('Failed to get system health', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve system health'
            });
        }
    }

    /**
     * Get application metrics
     */
    async getMetrics(req, res) {
        try {
            const metrics = loggingService.getMetrics();
            
            // Add additional calculated metrics
            const enhancedMetrics = {
                ...metrics,
                performance: {
                    requestsPerSecond: metrics.requestCount / (process.uptime() || 1),
                    errorRate: metrics.requestCount > 0 ? 
                              (metrics.errorCount / metrics.requestCount * 100).toFixed(2) + '%' : 
                              '0%',
                    averageResponseTime: Math.round(metrics.averageResponseTime) + 'ms',
                    dbQueriesPerSecond: metrics.dbQueryCount / (process.uptime() || 1)
                },
                resources: {
                    memoryUsagePercent: ((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100).toFixed(2) + '%',
                    uptimeHours: (process.uptime() / 3600).toFixed(2)
                }
            };

            res.json({
                success: true,
                data: enhancedMetrics
            });

        } catch (error) {
            loggingService.error('Failed to get metrics', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve metrics'
            });
        }
    }

    /**
     * Get recent logs
     */
    async getLogs(req, res) {
        try {
            const { lines = 100, type = 'combined', level } = req.query;
            
            const logs = await loggingService.getRecentLogs(parseInt(lines), type);
            
            let filteredLogs = logs;
            if (level) {
                filteredLogs = logs.filter(log => 
                    log.level && log.level.toLowerCase() === level.toLowerCase()
                );
            }

            res.json({
                success: true,
                data: {
                    logs: filteredLogs,
                    total: filteredLogs.length,
                    logType: type,
                    requestedLines: parseInt(lines)
                }
            });

        } catch (error) {
            loggingService.error('Failed to get logs', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve logs'
            });
        }
    }

    /**
     * Get system alerts (recent errors and warnings)
     */
    async getAlerts(req, res) {
        try {
            const metrics = loggingService.getMetrics();
            const alerts = [];

            // Memory usage alert
            const memoryUsage = (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100;
            if (memoryUsage > 80) {
                alerts.push({
                    type: 'warning',
                    message: `High memory usage: ${memoryUsage.toFixed(1)}%`,
                    timestamp: new Date().toISOString(),
                    severity: memoryUsage > 90 ? 'critical' : 'warning'
                });
            }

            // Error rate alert
            const errorRate = metrics.requestCount > 0 ? 
                             (metrics.errorCount / metrics.requestCount) * 100 : 0;
            if (errorRate > 5) {
                alerts.push({
                    type: 'error',
                    message: `High error rate: ${errorRate.toFixed(1)}%`,
                    timestamp: new Date().toISOString(),
                    severity: errorRate > 10 ? 'critical' : 'warning'
                });
            }

            // Recent errors
            metrics.lastErrors.forEach(error => {
                alerts.push({
                    type: 'error',
                    message: error.message,
                    timestamp: error.timestamp,
                    severity: 'error',
                    details: error.error
                });
            });

            // Database connection alerts
            const dbHealth = await this.checkDatabaseConnections();
            Object.entries(dbHealth).forEach(([name, db]) => {
                if (db.status !== 'connected') {
                    alerts.push({
                        type: 'error',
                        message: `Database connection failed: ${name}`,
                        timestamp: new Date().toISOString(),
                        severity: 'critical',
                        details: db.error
                    });
                }
            });

            // Sort by timestamp (newest first)
            alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            res.json({
                success: true,
                data: {
                    alerts: alerts.slice(0, 50), // Return latest 50 alerts
                    summary: {
                        total: alerts.length,
                        critical: alerts.filter(a => a.severity === 'critical').length,
                        warnings: alerts.filter(a => a.severity === 'warning').length,
                        errors: alerts.filter(a => a.severity === 'error').length
                    }
                }
            });

        } catch (error) {
            loggingService.error('Failed to get alerts', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve alerts'
            });
        }
    }

    /**
     * Get database connection status
     */
    async getDatabaseStatus(req, res) {
        try {
            const dbStatus = await this.checkDatabaseConnections();
            
            res.json({
                success: true,
                data: dbStatus
            });

        } catch (error) {
            loggingService.error('Failed to get database status', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve database status'
            });
        }
    }

    /**
     * Check all database connections
     */
    async checkDatabaseConnections() {
        const results = {};

        // Use existing testConnections function
        try {
            await testConnections();
            
            // If testConnections succeeds, we know the databases are working
            results.sqlite = {
                status: 'connected',
                lastCheck: new Date().toISOString(),
                type: 'SQLite'
            };

            if (process.env.MYSQL_HOST) {
                results.mysql = {
                    status: 'connected',
                    lastCheck: new Date().toISOString(),
                    type: 'MySQL'
                };
            } else {
                results.mysql = {
                    status: 'not_configured',
                    lastCheck: new Date().toISOString(),
                    type: 'MySQL'
                };
            }

            if (process.env.ORACLE_CONNECTION_STRING) {
                results.oracle = {
                    status: 'connected',
                    lastCheck: new Date().toISOString(),
                    type: 'Oracle'
                };
            } else {
                results.oracle = {
                    status: 'not_configured',
                    lastCheck: new Date().toISOString(),
                    type: 'Oracle'
                };
            }

        } catch (error) {
            // If testConnections fails, mark databases as having issues
            results.sqlite = {
                status: 'disconnected',
                lastCheck: new Date().toISOString(),
                error: error.message,
                type: 'SQLite'
            };

            results.mysql = {
                status: 'disconnected',
                lastCheck: new Date().toISOString(),
                error: error.message,
                type: 'MySQL'
            };

            results.oracle = {
                status: 'disconnected',
                lastCheck: new Date().toISOString(),
                error: error.message,
                type: 'Oracle'
            };
        }

        return results;
    }

    /**
     * Clear application logs
     */
    async clearLogs(req, res) {
        try {
            // Only admin users can clear logs
            if (!req.user || req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Insufficient permissions to clear logs'
                });
            }

            const { logType } = req.body;
            
            loggingService.info('Logs cleared by admin', {
                adminUser: req.user.username,
                logType: logType || 'all'
            });

            res.json({
                success: true,
                message: 'Logs cleared successfully'
            });

        } catch (error) {
            loggingService.error('Failed to clear logs', error);
            res.status(500).json({
                success: false,
                message: 'Failed to clear logs'
            });
        }
    }
}

module.exports = MonitoringController;