const { pool } = require('../config/database');
const logger = require('../utils/logger');
const emailQueueService = require('./emailQueueService');
const crypto = require('crypto');

class QuoteWorkflowService {
    constructor() {
        this.validStatuses = [
            'draft',
            'pending_approval',
            'approved',
            'sent',
            'viewed',
            'accepted',
            'rejected',
            'expired',
            'converted',
            'cancelled'
        ];

        this.statusTransitions = {
            'draft': ['pending_approval', 'sent', 'cancelled'],
            'pending_approval': ['approved', 'rejected', 'cancelled'],
            'approved': ['sent', 'cancelled'],
            'sent': ['viewed', 'expired', 'cancelled'],
            'viewed': ['accepted', 'rejected', 'expired'],
            'accepted': ['converted', 'expired'],
            'rejected': ['sent', 'expired'],
            'expired': ['sent'],
            'converted': [],
            'cancelled': []
        };
    }

    // Update quote status with validation and history tracking
    async updateQuoteStatus(quoteId, newStatus, userId, options = {}) {
        const { reason, notes, skipApproval = false, metadata = {} } = options;

        try {
            await pool.beginTransaction();

            // Get current quote details
            const [currentQuote] = await pool.execute(
                'SELECT * FROM quotes WHERE id = ?',
                [quoteId]
            );

            if (!currentQuote.length) {
                throw new Error('Quote not found');
            }

            const quote = currentQuote[0];
            const previousStatus = quote.status;

            // Validate status transition
            if (!this.isValidStatusTransition(previousStatus, newStatus)) {
                throw new Error(`Invalid status transition from ${previousStatus} to ${newStatus}`);
            }

            // Check if approval is required for high-value quotes
            if (!skipApproval && await this.requiresApproval(quote, newStatus)) {
                // Create approval request instead of directly updating status
                await this.createApprovalRequest(quoteId, userId, quote.total);
                await pool.commit();
                return { status: 'pending_approval', requiresApproval: true };
            }

            // Update quote status
            await pool.execute(
                'UPDATE quotes SET status = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ?',
                [newStatus, userId, quoteId]
            );

            // Record status change in history
            await this.recordStatusChange(quoteId, previousStatus, newStatus, userId, reason, notes, metadata);

            // Handle status-specific actions
            await this.handleStatusActions(quote, newStatus, userId, metadata);

            await pool.commit();

            logger.info(`Quote ${quoteId} status changed from ${previousStatus} to ${newStatus}`, {
                type: 'QUOTE_STATUS_CHANGE',
                quoteId,
                previousStatus,
                newStatus,
                userId,
                reason
            });

            return { status: newStatus, previousStatus };
        } catch (error) {
            await pool.rollback();
            logger.error('Failed to update quote status', {
                error,
                quoteId,
                newStatus,
                userId,
                type: 'QUOTE_STATUS_ERROR'
            });
            throw error;
        }
    }

    // Check if status transition is valid
    isValidStatusTransition(currentStatus, newStatus) {
        if (!this.validStatuses.includes(newStatus)) {
            return false;
        }
        
        return this.statusTransitions[currentStatus]?.includes(newStatus) || false;
    }

    // Check if quote requires approval based on amount and workflow settings
    async requiresApproval(quote, newStatus) {
        if (newStatus !== 'sent' && newStatus !== 'approved') {
            return false;
        }

        const [settings] = await pool.execute(
            'SELECT setting_value FROM quote_workflow_settings WHERE setting_key = ?',
            ['require_approval_above_threshold']
        );

        if (!settings.length || settings[0].setting_value !== 'true') {
            return false;
        }

        // Get approval thresholds
        const [managerThreshold] = await pool.execute(
            'SELECT setting_value FROM quote_workflow_settings WHERE setting_key = ?',
            ['approval_threshold_manager']
        );

        if (managerThreshold.length && parseFloat(quote.total) >= parseFloat(managerThreshold[0].setting_value)) {
            return true;
        }

        return false;
    }

    // Create approval request
    async createApprovalRequest(quoteId, requesterId, amount) {
        // Get appropriate approvers based on amount
        const approvers = await this.getRequiredApprovers(amount);
        
        for (const approver of approvers) {
            await pool.execute(`
                INSERT INTO quote_approvals (
                    quote_id, approver_id, approval_level, required_amount_threshold,
                    expires_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, datetime('now', '+7 days'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `, [quoteId, approver.userId, approver.level, amount]);
        }

        // Update quote status to pending_approval
        await pool.execute(
            'UPDATE quotes SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['pending_approval', quoteId]
        );

        // Send approval notifications
        await this.sendApprovalNotifications(quoteId, approvers);
    }

    // Get required approvers based on amount
    async getRequiredApprovers(amount) {
        const [managerThreshold] = await pool.execute(
            'SELECT setting_value FROM quote_workflow_settings WHERE setting_key = ?',
            ['approval_threshold_manager']
        );
        
        const [adminThreshold] = await pool.execute(
            'SELECT setting_value FROM quote_workflow_settings WHERE setting_key = ?',
            ['approval_threshold_admin']
        );

        const approvers = [];

        if (managerThreshold.length && amount >= parseFloat(managerThreshold[0].setting_value)) {
            // Get managers
            const [managers] = await pool.execute(
                'SELECT id as userId FROM users WHERE role IN (?, ?) AND active = 1',
                ['manager', 'admin']
            );
            
            managers.forEach(manager => {
                approvers.push({ userId: manager.userId, level: 1, role: 'manager' });
            });
        }

        if (adminThreshold.length && amount >= parseFloat(adminThreshold[0].setting_value)) {
            // Get admins for high-value quotes
            const [admins] = await pool.execute(
                'SELECT id as userId FROM users WHERE role = ? AND active = 1',
                ['admin']
            );
            
            admins.forEach(admin => {
                approvers.push({ userId: admin.userId, level: 2, role: 'admin' });
            });
        }

        return approvers;
    }

    // Process approval decision
    async processApproval(approvalId, approverId, decision, comments = '') {
        try {
            await pool.beginTransaction();

            const [approval] = await pool.execute(
                'SELECT * FROM quote_approvals WHERE id = ? AND approver_id = ?',
                [approvalId, approverId]
            );

            if (!approval.length) {
                throw new Error('Approval request not found or unauthorized');
            }

            const approvalData = approval[0];

            // Update approval record
            await pool.execute(`
                UPDATE quote_approvals 
                SET approval_status = ?, comments = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [decision, comments, approvalId]);

            // Check if all required approvals are complete
            const [pendingApprovals] = await pool.execute(
                'SELECT COUNT(*) as count FROM quote_approvals WHERE quote_id = ? AND approval_status = ?',
                [approvalData.quote_id, 'pending']
            );

            let newQuoteStatus = null;

            if (decision === 'rejected') {
                // If any approval is rejected, reject the quote
                newQuoteStatus = 'rejected';
                await this.updateQuoteStatus(approvalData.quote_id, 'rejected', approverId, {
                    reason: 'approval_rejected',
                    notes: comments,
                    skipApproval: true
                });
            } else if (decision === 'approved' && pendingApprovals[0].count === 0) {
                // If all approvals are complete, approve the quote
                newQuoteStatus = 'approved';
                await this.updateQuoteStatus(approvalData.quote_id, 'approved', approverId, {
                    reason: 'approval_completed',
                    notes: 'All required approvals received',
                    skipApproval: true
                });
            }

            await pool.commit();

            logger.info(`Approval processed for quote ${approvalData.quote_id}`, {
                type: 'QUOTE_APPROVAL',
                quoteId: approvalData.quote_id,
                approverId,
                decision,
                newQuoteStatus
            });

            return { decision, newQuoteStatus };
        } catch (error) {
            await pool.rollback();
            logger.error('Failed to process approval', { error, approvalId, approverId, decision });
            throw error;
        }
    }

    // Record status change in history
    async recordStatusChange(quoteId, previousStatus, newStatus, userId, reason, notes, metadata) {
        await pool.execute(`
            INSERT INTO quote_status_history (
                quote_id, previous_status, new_status, changed_by, change_reason, notes, metadata, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [quoteId, previousStatus, newStatus, userId, reason, notes, JSON.stringify(metadata)]);
    }

    // Handle status-specific actions
    async handleStatusActions(quote, newStatus, userId, metadata) {
        switch (newStatus) {
            case 'sent':
                await this.handleQuoteSent(quote, userId, metadata);
                break;
            case 'expired':
                await this.handleQuoteExpired(quote, userId);
                break;
            case 'accepted':
                await this.handleQuoteAccepted(quote, userId, metadata);
                break;
            case 'rejected':
                await this.handleQuoteRejected(quote, userId, metadata);
                break;
        }
    }

    // Handle quote sent status
    async handleQuoteSent(quote, userId, metadata) {
        // Generate client access token for quote viewing/acceptance
        const accessToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry

        await pool.execute(`
            INSERT INTO quote_client_actions (
                quote_id, action_type, client_email, access_token, expires_at, created_at
            ) VALUES (?, 'access_granted', ?, ?, ?, CURRENT_TIMESTAMP)
        `, [quote.id, metadata.clientEmail || '', accessToken, expiresAt.toISOString()]);

        // Send notification to client with access link
        if (metadata.clientEmail) {
            await this.sendClientNotification(quote, 'sent', metadata.clientEmail, accessToken);
        }
    }

    // Handle quote expired status
    async handleQuoteExpired(quote, userId) {
        // Send notification to quote creator
        await this.sendInternalNotification(quote, 'expired', quote.created_by);
    }

    // Handle quote accepted status
    async handleQuoteAccepted(quote, userId, metadata) {
        // Send notification to sales team
        await this.sendInternalNotification(quote, 'accepted', quote.created_by);
    }

    // Handle quote rejected status
    async handleQuoteRejected(quote, userId, metadata) {
        // Send notification to sales team
        await this.sendInternalNotification(quote, 'rejected', quote.created_by, metadata.comments);
    }

    // Send notification to client
    async sendClientNotification(quote, action, clientEmail, accessToken = null) {
        const [client] = await pool.execute('SELECT * FROM clients WHERE id = ?', [quote.client_id]);
        const clientName = client.length ? client[0].name : 'Cliente';

        let subject, emailData;

        switch (action) {
            case 'sent':
                subject = `Cotización ${quote.quote_number} - ${clientName}`;
                emailData = {
                    template: 'quote_sent_to_client',
                    recipientEmail: clientEmail,
                    recipientName: clientName,
                    subject,
                    quoteId: quote.id,
                    quoteNumber: quote.quote_number,
                    accessToken,
                    viewLink: `${process.env.FRONTEND_URL || 'http://localhost:3005'}/quote-view/${accessToken}`
                };
                break;
        }

        if (emailData) {
            await emailQueueService.addToQueue(emailData, 1); // High priority for client notifications
        }
    }

    // Send internal notification
    async sendInternalNotification(quote, action, userId, comments = '') {
        const [user] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user.length) return;

        const [client] = await pool.execute('SELECT * FROM clients WHERE id = ?', [quote.client_id]);
        const clientName = client.length ? client[0].name : 'Cliente';

        let subject, emailData;

        switch (action) {
            case 'expired':
                subject = `Cotización Expirada - ${quote.quote_number}`;
                emailData = {
                    template: 'quote_expired',
                    recipientEmail: user[0].email,
                    recipientName: `${user[0].first_name} ${user[0].last_name}`,
                    subject,
                    quoteId: quote.id,
                    quoteNumber: quote.quote_number,
                    clientName
                };
                break;
            case 'accepted':
                subject = `¡Cotización Aceptada! - ${quote.quote_number}`;
                emailData = {
                    template: 'quote_accepted',
                    recipientEmail: user[0].email,
                    recipientName: `${user[0].first_name} ${user[0].last_name}`,
                    subject,
                    quoteId: quote.id,
                    quoteNumber: quote.quote_number,
                    clientName,
                    total: quote.total
                };
                break;
            case 'rejected':
                subject = `Cotización Rechazada - ${quote.quote_number}`;
                emailData = {
                    template: 'quote_rejected',
                    recipientEmail: user[0].email,
                    recipientName: `${user[0].first_name} ${user[0].last_name}`,
                    subject,
                    quoteId: quote.id,
                    quoteNumber: quote.quote_number,
                    clientName,
                    comments
                };
                break;
        }

        if (emailData) {
            await emailQueueService.addToQueue(emailData, 0); // Normal priority for internal notifications
        }
    }

    // Send approval notifications
    async sendApprovalNotifications(quoteId, approvers) {
        const [quote] = await pool.execute('SELECT * FROM quotes WHERE id = ?', [quoteId]);
        if (!quote.length) return;

        const [client] = await pool.execute('SELECT * FROM clients WHERE id = ?', [quote[0].client_id]);
        const clientName = client.length ? client[0].name : 'Cliente';

        for (const approver of approvers) {
            const [user] = await pool.execute('SELECT * FROM users WHERE id = ?', [approver.userId]);
            if (!user.length) continue;

            const emailData = {
                template: 'quote_approval_required',
                recipientEmail: user[0].email,
                recipientName: `${user[0].first_name} ${user[0].last_name}`,
                subject: `Aprobación Requerida - Cotización ${quote[0].quote_number}`,
                quoteId,
                quoteNumber: quote[0].quote_number,
                clientName,
                total: quote[0].total,
                approvalLink: `${process.env.FRONTEND_URL || 'http://localhost:3005'}/approve-quote/${quoteId}`
            };

            await emailQueueService.addToQueue(emailData, 2); // High priority for approvals
        }
    }

    // Get quote status history
    async getQuoteStatusHistory(quoteId) {
        const [history] = await pool.execute(`
            SELECT 
                qsh.*,
                u.first_name,
                u.last_name,
                u.username
            FROM quote_status_history qsh
            LEFT JOIN users u ON qsh.changed_by = u.id
            WHERE qsh.quote_id = ?
            ORDER BY qsh.created_at DESC
        `, [quoteId]);

        return history.map(record => ({
            ...record,
            metadata: record.metadata ? JSON.parse(record.metadata) : {},
            changed_by_name: `${record.first_name} ${record.last_name}` || record.username
        }));
    }

    // Get pending approvals for user
    async getPendingApprovals(userId) {
        const [approvals] = await pool.execute(`
            SELECT 
                qa.*,
                q.quote_number,
                q.total,
                q.created_at as quote_created_at,
                c.name as client_name,
                u.first_name as creator_first_name,
                u.last_name as creator_last_name
            FROM quote_approvals qa
            JOIN quotes q ON qa.quote_id = q.id
            JOIN clients c ON q.client_id = c.id
            JOIN users u ON q.created_by = u.id
            WHERE qa.approver_id = ? AND qa.approval_status = 'pending'
            ORDER BY qa.created_at DESC
        `, [userId]);

        return approvals;
    }

    // Get workflow settings
    async getWorkflowSettings() {
        const [settings] = await pool.execute('SELECT * FROM quote_workflow_settings ORDER BY setting_key');
        
        const settingsObj = {};
        settings.forEach(setting => {
            settingsObj[setting.setting_key] = {
                value: setting.setting_value,
                description: setting.description
            };
        });

        return settingsObj;
    }

    // Update workflow settings
    async updateWorkflowSettings(settings, userId) {
        try {
            await pool.beginTransaction();

            for (const [key, value] of Object.entries(settings)) {
                await pool.execute(`
                    UPDATE quote_workflow_settings 
                    SET setting_value = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE setting_key = ?
                `, [value, userId, key]);
            }

            await pool.commit();

            logger.info('Workflow settings updated', {
                type: 'WORKFLOW_SETTINGS_UPDATE',
                userId,
                settings: Object.keys(settings)
            });

            return true;
        } catch (error) {
            await pool.rollback();
            logger.error('Failed to update workflow settings', { error, userId, settings });
            throw error;
        }
    }

    // Client quote interaction (for public access)
    async recordClientAction(accessToken, actionType, clientData = {}) {
        try {
            const [tokenRecord] = await pool.execute(`
                SELECT qca.*, q.id as quote_id 
                FROM quote_client_actions qca
                JOIN quotes q ON qca.quote_id = q.id
                WHERE qca.access_token = ? AND qca.expires_at > datetime('now')
            `, [accessToken]);

            if (!tokenRecord.length) {
                throw new Error('Invalid or expired access token');
            }

            const quoteId = tokenRecord[0].quote_id;

            // Record the action
            await pool.execute(`
                INSERT INTO quote_client_actions (
                    quote_id, action_type, client_email, client_ip, user_agent, 
                    access_token, comments, metadata, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [
                quoteId,
                actionType,
                clientData.email || '',
                clientData.ip || '',
                clientData.userAgent || '',
                accessToken,
                clientData.comments || '',
                JSON.stringify(clientData.metadata || {})
            ]);

            // Update quote status based on action
            let newStatus = null;
            switch (actionType) {
                case 'viewed':
                    newStatus = 'viewed';
                    break;
                case 'accepted':
                    newStatus = 'accepted';
                    break;
                case 'rejected':
                    newStatus = 'rejected';
                    break;
            }

            if (newStatus) {
                // Use a system user ID for client actions
                await this.updateQuoteStatus(quoteId, newStatus, 1, {
                    reason: `client_${actionType}`,
                    notes: clientData.comments || '',
                    skipApproval: true,
                    metadata: { clientAction: true, ...clientData.metadata }
                });
            }

            return { success: true, quoteId };
        } catch (error) {
            logger.error('Failed to record client action', { error, accessToken, actionType });
            throw error;
        }
    }
}

module.exports = new QuoteWorkflowService();