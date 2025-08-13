const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const emailQueueService = require('../services/emailQueueService');
const emailService = require('../services/emailService');
const router = express.Router();

// Get email queue statistics
router.get('/queue/stats', authenticate, authorize(['admin', 'manager']), async (req, res) => {
    try {
        const stats = await emailQueueService.getQueueStats();
        res.json(stats);
    } catch (error) {
        console.error('Error getting queue stats:', error);
        res.status(500).json({ error: 'Failed to get queue statistics' });
    }
});

// Get email logs with filtering
router.get('/logs', authenticate, authorize(['admin', 'manager']), async (req, res) => {
    try {
        const { limit = 50, status, recipient, dateFrom, dateTo } = req.query;
        
        const filters = {};
        if (status) filters.status = status;
        if (recipient) filters.recipient = recipient;
        if (dateFrom) filters.dateFrom = dateFrom;
        if (dateTo) filters.dateTo = dateTo;

        const logs = await emailQueueService.getEmailLogs(parseInt(limit), filters);
        res.json(logs);
    } catch (error) {
        console.error('Error getting email logs:', error);
        res.status(500).json({ error: 'Failed to get email logs' });
    }
});

// Get queue items
router.get('/queue', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const { limit = 50, status = 'all' } = req.query;
        
        let query = 'SELECT * FROM email_queue WHERE 1=1';
        const params = [];
        
        if (status !== 'all') {
            query += ' AND status = ?';
            params.push(status);
        }
        
        query += ' ORDER BY created_at DESC LIMIT ?';
        params.push(parseInt(limit));
        
        const { pool } = require('../config/database');
        const [rows] = await pool.execute(query, params);
        
        res.json(rows);
    } catch (error) {
        console.error('Error getting queue items:', error);
        res.status(500).json({ error: 'Failed to get queue items' });
    }
});

// Retry failed email
router.post('/queue/:id/retry', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const queueId = req.params.id;
        
        const { pool } = require('../config/database');
        await pool.execute(`
            UPDATE email_queue 
            SET status = 'pending', attempts = 0, scheduled_at = datetime('now'), updated_at = datetime('now')
            WHERE id = ?
        `, [queueId]);
        
        res.json({ success: true, message: 'Email scheduled for retry' });
    } catch (error) {
        console.error('Error retrying email:', error);
        res.status(500).json({ error: 'Failed to retry email' });
    }
});

// Delete queue item
router.delete('/queue/:id', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const queueId = req.params.id;
        
        const { pool } = require('../config/database');
        await pool.execute('DELETE FROM email_queue WHERE id = ?', [queueId]);
        
        res.json({ success: true, message: 'Queue item deleted' });
    } catch (error) {
        console.error('Error deleting queue item:', error);
        res.status(500).json({ error: 'Failed to delete queue item' });
    }
});

// Get email configuration status
router.get('/config', authenticate, authorize(['admin']), (req, res) => {
    try {
        const config = {
            isConfigured: emailService.isConfigured(),
            smtpHost: process.env.SMTP_HOST ? '***configured***' : null,
            smtpPort: process.env.SMTP_PORT || null,
            smtpUser: process.env.SMTP_USER ? '***configured***' : null,
            smtpFrom: process.env.SMTP_FROM || process.env.SMTP_USER || null,
            companyName: process.env.COMPANY_NAME || null,
            companyPhone: process.env.COMPANY_PHONE || null,
        };
        
        res.json(config);
    } catch (error) {
        console.error('Error getting email config:', error);
        res.status(500).json({ error: 'Failed to get email configuration' });
    }
});

// Update email configuration (environment variables)
router.put('/config', 
    authenticate, 
    authorize(['admin']),
    [
        body('smtpHost').optional().isString().withMessage('SMTP host must be a string'),
        body('smtpPort').optional().isInt({ min: 1, max: 65535 }).withMessage('SMTP port must be between 1 and 65535'),
        body('smtpUser').optional().isEmail().withMessage('SMTP user must be a valid email'),
        body('companyName').optional().isString().withMessage('Company name must be a string'),
        body('companyPhone').optional().isString().withMessage('Company phone must be a string')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            // Note: In a production environment, you would typically update a configuration file
            // or use a configuration management system rather than environment variables directly
            res.json({
                success: false,
                message: 'Configuration updates require server restart and environment variable changes',
                note: 'Please update the .env file and restart the server'
            });
        } catch (error) {
            console.error('Error updating email config:', error);
            res.status(500).json({ error: 'Failed to update email configuration' });
        }
    }
);

// Test email configuration
router.post('/test', 
    authenticate, 
    authorize(['admin']),
    [
        body('testEmail').isEmail().withMessage('Valid test email is required'),
        body('useQueue').optional().isBoolean().withMessage('useQueue must be boolean')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const { testEmail, useQueue = false } = req.body;

            if (!emailService.isConfigured()) {
                return res.status(503).json({
                    error: 'Email service not configured',
                    message: 'Email service is not configured. Check SMTP settings.'
                });
            }

            const result = await emailService.sendTestEmail(
                testEmail, 
                `${req.user.firstName} ${req.user.lastName}`,
                useQueue
            );

            res.json({
                success: true,
                message: useQueue ? 'Test email queued for delivery' : 'Test email sent successfully',
                details: result
            });

        } catch (error) {
            console.error('Error sending test email:', error);
            res.status(500).json({
                error: 'Failed to send test email',
                message: error.message
            });
        }
    }
);

// Email delivery webhook (for future integration with email providers)
router.post('/webhook/delivery', async (req, res) => {
    try {
        // This would typically verify webhook signature from email provider
        await emailQueueService.handleDeliveryWebhook(req.body);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error handling delivery webhook:', error);
        res.status(500).json({ error: 'Failed to handle webhook' });
    }
});

// Email analytics endpoint
router.get('/analytics', authenticate, authorize(['admin', 'manager']), async (req, res) => {
    try {
        const { days = 7 } = req.query;
        
        const { pool } = require('../config/database');
        
        // Get email statistics for the specified period
        const [stats] = await pool.execute(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as total_emails,
                SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN delivery_status = 'delivered' THEN 1 ELSE 0 END) as delivered,
                SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
                SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicked
            FROM email_logs 
            WHERE created_at >= datetime('now', '-${parseInt(days)} days')
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `);
        
        // Get overall stats
        const [overall] = await pool.execute(`
            SELECT 
                COUNT(*) as total_emails,
                SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN delivery_status = 'delivered' THEN 1 ELSE 0 END) as delivered,
                SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
                SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicked,
                ROUND(AVG(CASE WHEN opened_at IS NOT NULL AND sent_at IS NOT NULL 
                    THEN (julianday(opened_at) - julianday(sent_at)) * 24 * 60 
                    ELSE NULL END), 2) as avg_open_time_minutes
            FROM email_logs 
            WHERE created_at >= datetime('now', '-${parseInt(days)} days')
        `);
        
        res.json({
            period: `${days} days`,
            daily: stats,
            overall: overall[0] || {}
        });
        
    } catch (error) {
        console.error('Error getting email analytics:', error);
        res.status(500).json({ error: 'Failed to get email analytics' });
    }
});

module.exports = router;