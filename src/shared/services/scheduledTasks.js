const cron = require('node-cron');
const loggingService = require('./loggingService');

class ScheduledTasks {
    constructor() {
        this.tasks = [];
        this.setupTasks();
    }

    setupTasks() {
        // Clean up old log files every day at 2 AM
        const logCleanupTask = cron.schedule('0 2 * * *', () => {
            loggingService.info('Starting scheduled log cleanup');
            loggingService.cleanupLogs();
        }, {
            scheduled: false
        });

        this.tasks.push({
            name: 'Log Cleanup',
            task: logCleanupTask,
            schedule: 'Daily at 2:00 AM'
        });

        // Log system metrics every hour
        const metricsTask = cron.schedule('0 * * * *', () => {
            const metrics = loggingService.getMetrics();
            loggingService.info('Hourly system metrics', {
                requests: metrics.requestCount,
                errors: metrics.errorCount,
                dbQueries: metrics.dbQueryCount,
                averageResponseTime: Math.round(metrics.averageResponseTime) + 'ms',
                uptime: Math.round(process.uptime()) + 's',
                memoryUsage: process.memoryUsage()
            });
        }, {
            scheduled: false
        });

        this.tasks.push({
            name: 'System Metrics',
            task: metricsTask,
            schedule: 'Every hour'
        });
    }

    startAll() {
        this.tasks.forEach(({ name, task }) => {
            task.start();
            loggingService.info(`Started scheduled task: ${name}`);
        });
        
        loggingService.info('All scheduled tasks started', {
            totalTasks: this.tasks.length,
            tasks: this.tasks.map(t => ({ name: t.name, schedule: t.schedule }))
        });
    }

    stopAll() {
        this.tasks.forEach(({ name, task }) => {
            task.stop();
            loggingService.info(`Stopped scheduled task: ${name}`);
        });
        
        loggingService.info('All scheduled tasks stopped');
    }

    getStatus() {
        return this.tasks.map(({ name, schedule, task }) => ({
            name,
            schedule,
            running: task.running || false
        }));
    }
}

// Create singleton instance
const scheduledTasks = new ScheduledTasks();

module.exports = scheduledTasks;