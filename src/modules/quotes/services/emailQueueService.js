const { pool } = require('../config/database');
const emailService = require('./emailService');

class EmailQueueService {
    constructor() {
        this.isProcessing = false;
        this.processingInterval = null;
        this.retryDelays = [
            1 * 60 * 1000,    // 1 minute
            5 * 60 * 1000,    // 5 minutes
            15 * 60 * 1000,   // 15 minutes
            60 * 60 * 1000,   // 1 hour
            24 * 60 * 60 * 1000 // 24 hours
        ];
        
        this.startProcessing();
    }

    async addToQueue(emailData, priority = 0, scheduledAt = null) {
        try {
            const scheduledTime = scheduledAt || new Date().toISOString();
            
            const [result] = await pool.execute(`
                INSERT INTO email_queue (
                    quote_id, recipient_email, sender_user_id, email_data, 
                    priority, scheduled_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            `, [
                emailData.quoteId || null,
                emailData.recipientEmail,
                emailData.senderUserId,
                JSON.stringify(emailData),
                priority,
                scheduledTime
            ]);

            console.log(`Email queued with ID: ${result.insertId}`);
            return result.insertId;
        } catch (error) {
            console.error('Error adding email to queue:', error);
            throw error;
        }
    }

    async getQueuedEmails(limit = 10) {
        try {
            const [rows] = await pool.execute(`
                SELECT * FROM email_queue 
                WHERE status = 'pending' 
                AND scheduled_at <= datetime('now')
                AND (attempts < max_attempts OR attempts IS NULL)
                ORDER BY priority DESC, scheduled_at ASC 
                LIMIT ?
            `, [limit]);

            return rows;
        } catch (error) {
            console.error('Error fetching queued emails:', error);
            return [];
        }
    }

    async updateQueueStatus(queueId, status, errorMessage = null) {
        try {
            await pool.execute(`
                UPDATE email_queue 
                SET status = ?, error_message = ?, updated_at = datetime('now')
                WHERE id = ?
            `, [status, errorMessage, queueId]);
        } catch (error) {
            console.error('Error updating queue status:', error);
        }
    }

    async incrementAttempts(queueId) {
        try {
            await pool.execute(`
                UPDATE email_queue 
                SET attempts = attempts + 1, last_attempt_at = datetime('now'), updated_at = datetime('now')
                WHERE id = ?
            `, [queueId]);
        } catch (error) {
            console.error('Error incrementing attempts:', error);
        }
    }

    async scheduleRetry(queueId, attempts) {
        try {
            const delayIndex = Math.min(attempts - 1, this.retryDelays.length - 1);
            const delay = this.retryDelays[delayIndex];
            const nextAttempt = new Date(Date.now() + delay).toISOString();
            
            await pool.execute(`
                UPDATE email_queue 
                SET scheduled_at = ?, status = 'pending', updated_at = datetime('now')
                WHERE id = ?
            `, [nextAttempt, queueId]);
            
            console.log(`Email ${queueId} scheduled for retry in ${delay / 1000 / 60} minutes`);
        } catch (error) {
            console.error('Error scheduling retry:', error);
        }
    }

    async logEmailSent(emailData, messageId, status = 'sent') {
        try {
            const [result] = await pool.execute(`
                INSERT INTO email_logs (
                    quote_id, recipient_email, sender_user_id, subject, 
                    message_id, status, sent_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
            `, [
                emailData.quoteId || null,
                emailData.recipientEmail,
                emailData.senderUserId,
                emailData.subject || null,
                messageId,
                status
            ]);

            return result.insertId;
        } catch (error) {
            console.error('Error logging email:', error);
        }
    }

    async updateEmailLog(logId, updates) {
        try {
            const fields = [];
            const values = [];
            
            Object.keys(updates).forEach(key => {
                fields.push(`${key} = ?`);
                values.push(updates[key]);
            });
            
            if (fields.length > 0) {
                fields.push('updated_at = datetime(\'now\')');
                values.push(logId);
                
                await pool.execute(`
                    UPDATE email_logs 
                    SET ${fields.join(', ')}
                    WHERE id = ?
                `, values);
            }
        } catch (error) {
            console.error('Error updating email log:', error);
        }
    }

    async processQueue() {
        if (this.isProcessing) {
            return;
        }

        this.isProcessing = true;
        
        try {
            const queuedEmails = await this.getQueuedEmails();
            
            if (queuedEmails.length === 0) {
                return;
            }

            console.log(`Processing ${queuedEmails.length} queued emails...`);
            
            for (const queueItem of queuedEmails) {
                await this.processQueueItem(queueItem);
            }
        } catch (error) {
            console.error('Error processing email queue:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    async processQueueItem(queueItem) {
        try {
            await this.incrementAttempts(queueItem.id);
            
            const emailData = JSON.parse(queueItem.email_data);
            
            // Check if email service is configured
            if (!emailService.isConfigured()) {
                throw new Error('Email service not configured');
            }

            let result;
            
            if (emailData.type === 'quote') {
                // Send quote email
                result = await emailService.sendQuoteEmail(
                    emailData.quote,
                    emailData.clientData,
                    emailData.senderData,
                    emailData.pdfBuffer,
                    emailData.options
                );
            } else if (emailData.type === 'test') {
                // Send test email
                result = await emailService.sendTestEmail(
                    emailData.recipientEmail,
                    emailData.senderName
                );
            } else {
                throw new Error(`Unknown email type: ${emailData.type}`);
            }

            // Log successful send
            await this.logEmailSent(emailData, result.messageId, 'sent');
            
            // Mark as completed
            await this.updateQueueStatus(queueItem.id, 'completed');
            
            console.log(`Email sent successfully: ${queueItem.id}`);

        } catch (error) {
            console.error(`Error sending email ${queueItem.id}:`, error.message);
            
            // Check if we should retry
            if (queueItem.attempts < queueItem.max_attempts) {
                await this.scheduleRetry(queueItem.id, queueItem.attempts + 1);
            } else {
                // Max attempts reached, mark as failed
                await this.updateQueueStatus(queueItem.id, 'failed', error.message);
                
                // Log the failed attempt
                await this.logEmailSent({
                    ...JSON.parse(queueItem.email_data),
                    quoteId: queueItem.quote_id,
                    recipientEmail: queueItem.recipient_email,
                    senderUserId: queueItem.sender_user_id
                }, null, 'failed');
            }
        }
    }

    startProcessing() {
        // Process queue every 30 seconds
        this.processingInterval = setInterval(() => {
            this.processQueue();
        }, 30000);

        // Also process immediately
        setTimeout(() => this.processQueue(), 1000);
        
        console.log('Email queue processor started');
    }

    stopProcessing() {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
            console.log('Email queue processor stopped');
        }
    }

    async getQueueStats() {
        try {
            const [stats] = await pool.execute(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                    SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing
                FROM email_queue
            `);

            const [recentActivity] = await pool.execute(`
                SELECT 
                    COUNT(*) as emails_last_hour,
                    AVG(attempts) as avg_attempts
                FROM email_queue 
                WHERE created_at >= datetime('now', '-1 hour')
            `);

            return {
                queue: stats[0] || { total: 0, pending: 0, completed: 0, failed: 0, processing: 0 },
                activity: recentActivity[0] || { emails_last_hour: 0, avg_attempts: 0 }
            };
        } catch (error) {
            console.error('Error getting queue stats:', error);
            return null;
        }
    }

    async getEmailLogs(limit = 50, filters = {}) {
        try {
            let query = `
                SELECT el.*, q.quote_number, u.username as sender_username
                FROM email_logs el
                LEFT JOIN quotes q ON el.quote_id = q.id
                LEFT JOIN users u ON el.sender_user_id = u.id
                WHERE 1=1
            `;
            const params = [];

            if (filters.status) {
                query += ' AND el.status = ?';
                params.push(filters.status);
            }

            if (filters.recipient) {
                query += ' AND el.recipient_email LIKE ?';
                params.push(`%${filters.recipient}%`);
            }

            if (filters.dateFrom) {
                query += ' AND el.created_at >= ?';
                params.push(filters.dateFrom);
            }

            if (filters.dateTo) {
                query += ' AND el.created_at <= ?';
                params.push(filters.dateTo);
            }

            query += ' ORDER BY el.created_at DESC LIMIT ?';
            params.push(limit);

            const [rows] = await pool.execute(query, params);
            return rows;
        } catch (error) {
            console.error('Error getting email logs:', error);
            return [];
        }
    }

    // Email tracking webhook endpoints (for future integration with email providers)
    async handleDeliveryWebhook(data) {
        try {
            const { messageId, event, timestamp } = data;
            
            // Find email log by message ID
            const [logs] = await pool.execute(
                'SELECT id FROM email_logs WHERE message_id = ?',
                [messageId]
            );

            if (logs.length === 0) {
                console.log(`No email log found for message ID: ${messageId}`);
                return;
            }

            const logId = logs[0].id;
            const updates = {};

            switch (event) {
                case 'delivered':
                    updates.delivery_status = 'delivered';
                    updates.delivered_at = timestamp;
                    break;
                case 'opened':
                    updates.opened_at = timestamp;
                    break;
                case 'clicked':
                    updates.clicked_at = timestamp;
                    break;
                case 'bounced':
                    updates.delivery_status = 'bounced';
                    updates.bounced_at = timestamp;
                    break;
                case 'spam':
                    updates.delivery_status = 'spam';
                    break;
            }

            if (Object.keys(updates).length > 0) {
                await this.updateEmailLog(logId, updates);
                console.log(`Updated email log ${logId} with event: ${event}`);
            }
        } catch (error) {
            console.error('Error handling delivery webhook:', error);
        }
    }
}

module.exports = new EmailQueueService();