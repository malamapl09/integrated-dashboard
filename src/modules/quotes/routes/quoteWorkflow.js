const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const quoteWorkflowService = require('../services/quoteWorkflowService');
const logger = require('../utils/logger');
const router = express.Router();

// Update quote status
router.put('/quotes/:id/status', authenticate, asyncHandler(async (req, res) => {
    const { id: quoteId } = req.params;
    const { status, reason, notes, metadata } = req.body;
    const userId = req.user.id;

    if (!status) {
        return res.status(400).json({ error: 'Status is required' });
    }

    try {
        const result = await quoteWorkflowService.updateQuoteStatus(quoteId, status, userId, {
            reason,
            notes,
            metadata
        });

        logger.info(`Quote status updated via API`, {
            type: 'QUOTE_STATUS_API',
            quoteId,
            newStatus: status,
            userId,
            req
        });

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        logger.error('Failed to update quote status via API', {
            error,
            quoteId,
            status,
            userId,
            req,
            type: 'QUOTE_STATUS_API_ERROR'
        });
        res.status(400).json({ error: error.message });
    }
}));

// Get quote status history
router.get('/quotes/:id/status-history', authenticate, asyncHandler(async (req, res) => {
    const { id: quoteId } = req.params;

    try {
        const history = await quoteWorkflowService.getQuoteStatusHistory(quoteId);
        
        res.json({
            success: true,
            history
        });
    } catch (error) {
        logger.error('Failed to get quote status history', {
            error,
            quoteId,
            req,
            type: 'QUOTE_HISTORY_API_ERROR'
        });
        res.status(500).json({ error: 'Failed to retrieve status history' });
    }
}));

// Get pending approvals for current user
router.get('/approvals/pending', authenticate, asyncHandler(async (req, res) => {
    const userId = req.user.id;

    try {
        const approvals = await quoteWorkflowService.getPendingApprovals(userId);
        
        res.json({
            success: true,
            approvals
        });
    } catch (error) {
        logger.error('Failed to get pending approvals', {
            error,
            userId,
            req,
            type: 'PENDING_APPROVALS_API_ERROR'
        });
        res.status(500).json({ error: 'Failed to retrieve pending approvals' });
    }
}));

// Process approval decision
router.post('/approvals/:id/decision', authenticate, authorize(['manager', 'admin']), asyncHandler(async (req, res) => {
    const { id: approvalId } = req.params;
    const { decision, comments } = req.body;
    const approverId = req.user.id;

    if (!['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ error: 'Decision must be either "approved" or "rejected"' });
    }

    try {
        const result = await quoteWorkflowService.processApproval(approvalId, approverId, decision, comments);
        
        logger.info(`Approval decision processed`, {
            type: 'APPROVAL_DECISION',
            approvalId,
            approverId,
            decision,
            req
        });

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        logger.error('Failed to process approval decision', {
            error,
            approvalId,
            approverId,
            decision,
            req,
            type: 'APPROVAL_DECISION_ERROR'
        });
        res.status(400).json({ error: error.message });
    }
}));

// Get workflow settings (admin only)
router.get('/settings', authenticate, authorize(['admin']), asyncHandler(async (req, res) => {
    try {
        const settings = await quoteWorkflowService.getWorkflowSettings();
        
        res.json({
            success: true,
            settings
        });
    } catch (error) {
        logger.error('Failed to get workflow settings', {
            error,
            req,
            type: 'WORKFLOW_SETTINGS_API_ERROR'
        });
        res.status(500).json({ error: 'Failed to retrieve workflow settings' });
    }
}));

// Update workflow settings (admin only)
router.put('/settings', authenticate, authorize(['admin']), asyncHandler(async (req, res) => {
    const { settings } = req.body;
    const userId = req.user.id;

    if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'Settings object is required' });
    }

    try {
        await quoteWorkflowService.updateWorkflowSettings(settings, userId);
        
        logger.info(`Workflow settings updated via API`, {
            type: 'WORKFLOW_SETTINGS_UPDATE_API',
            userId,
            settingsKeys: Object.keys(settings),
            req
        });

        res.json({
            success: true,
            message: 'Workflow settings updated successfully'
        });
    } catch (error) {
        logger.error('Failed to update workflow settings via API', {
            error,
            userId,
            settings,
            req,
            type: 'WORKFLOW_SETTINGS_UPDATE_ERROR'
        });
        res.status(500).json({ error: 'Failed to update workflow settings' });
    }
}));

// Get valid status transitions for a quote
router.get('/quotes/:id/valid-transitions', authenticate, asyncHandler(async (req, res) => {
    const { id: quoteId } = req.params;

    try {
        // Get current quote status
        const { pool } = require('../config/database');
        const [quote] = await pool.execute('SELECT status FROM quotes WHERE id = ?', [quoteId]);
        
        if (!quote.length) {
            return res.status(404).json({ error: 'Quote not found' });
        }

        const currentStatus = quote[0].status;
        const validTransitions = quoteWorkflowService.statusTransitions[currentStatus] || [];

        res.json({
            success: true,
            currentStatus,
            validTransitions
        });
    } catch (error) {
        logger.error('Failed to get valid status transitions', {
            error,
            quoteId,
            req,
            type: 'STATUS_TRANSITIONS_API_ERROR'
        });
        res.status(500).json({ error: 'Failed to retrieve valid transitions' });
    }
}));

// Get quote statistics by status
router.get('/statistics', authenticate, asyncHandler(async (req, res) => {
    const { timeframe = '30' } = req.query; // days
    const userId = req.user.role === 'admin' ? null : req.user.id; // Admins see all, others see only their quotes

    try {
        const { pool } = require('../config/database');
        
        let whereClause = `WHERE q.created_at >= datetime('now', '-${parseInt(timeframe)} days')`;
        let params = [];
        
        if (userId) {
            whereClause += ' AND q.created_by = ?';
            params.push(userId);
        }

        const [statusStats] = await pool.execute(`
            SELECT 
                q.status,
                COUNT(*) as count,
                SUM(q.total) as total_value,
                AVG(q.total) as avg_value
            FROM quotes q
            ${whereClause}
            GROUP BY q.status
            ORDER BY count DESC
        `, params);

        // Get status transition stats
        const [transitionStats] = await pool.execute(`
            SELECT 
                qsh.previous_status,
                qsh.new_status,
                COUNT(*) as count
            FROM quote_status_history qsh
            JOIN quotes q ON qsh.quote_id = q.id
            ${whereClause.replace('q.created_at', 'qsh.created_at')}
            GROUP BY qsh.previous_status, qsh.new_status
            ORDER BY count DESC
            LIMIT 10
        `, params);

        // Get conversion funnel
        const [funnelStats] = await pool.execute(`
            WITH quote_funnel AS (
                SELECT 
                    COUNT(CASE WHEN status IN ('draft', 'pending_approval', 'approved', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'converted') THEN 1 END) as total_quotes,
                    COUNT(CASE WHEN status IN ('sent', 'viewed', 'accepted', 'rejected', 'expired', 'converted') THEN 1 END) as sent_quotes,
                    COUNT(CASE WHEN status IN ('viewed', 'accepted', 'rejected', 'expired', 'converted') THEN 1 END) as viewed_quotes,
                    COUNT(CASE WHEN status = 'accepted' OR status = 'converted' THEN 1 END) as accepted_quotes,
                    COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted_quotes
                FROM quotes q
                ${whereClause}
            )
            SELECT 
                total_quotes,
                sent_quotes,
                viewed_quotes,
                accepted_quotes,
                converted_quotes,
                CASE WHEN total_quotes > 0 THEN ROUND((sent_quotes * 100.0 / total_quotes), 2) ELSE 0 END as sent_rate,
                CASE WHEN sent_quotes > 0 THEN ROUND((viewed_quotes * 100.0 / sent_quotes), 2) ELSE 0 END as view_rate,
                CASE WHEN viewed_quotes > 0 THEN ROUND((accepted_quotes * 100.0 / viewed_quotes), 2) ELSE 0 END as acceptance_rate,
                CASE WHEN accepted_quotes > 0 THEN ROUND((converted_quotes * 100.0 / accepted_quotes), 2) ELSE 0 END as conversion_rate
            FROM quote_funnel
        `, params);

        res.json({
            success: true,
            timeframe: parseInt(timeframe),
            statistics: {
                byStatus: statusStats,
                transitions: transitionStats,
                funnel: funnelStats[0] || {}
            }
        });
    } catch (error) {
        logger.error('Failed to get quote statistics', {
            error,
            userId,
            timeframe,
            req,
            type: 'QUOTE_STATISTICS_API_ERROR'
        });
        res.status(500).json({ error: 'Failed to retrieve quote statistics' });
    }
}));

// Public endpoint for client actions (no authentication required)
router.post('/client-action/:token', asyncHandler(async (req, res) => {
    const { token: accessToken } = req.params;
    const { action, comments } = req.body;
    const clientData = {
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        comments,
        metadata: req.body.metadata || {}
    };

    if (!['viewed', 'accepted', 'rejected'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action' });
    }

    try {
        const result = await quoteWorkflowService.recordClientAction(accessToken, action, clientData);
        
        logger.info(`Client action recorded`, {
            type: 'CLIENT_ACTION',
            action,
            accessToken: accessToken.substring(0, 8) + '...', // Log partial token for security
            quoteId: result.quoteId,
            clientIP: clientData.ip
        });

        res.json({
            success: true,
            message: `Quote ${action} successfully recorded`
        });
    } catch (error) {
        logger.error('Failed to record client action', {
            error,
            action,
            accessToken: accessToken.substring(0, 8) + '...',
            clientData: { ...clientData, ip: clientData.ip },
            type: 'CLIENT_ACTION_ERROR'
        });
        res.status(400).json({ error: error.message });
    }
}));

// Get quote details for client (public endpoint with token)
router.get('/client-view/:token', asyncHandler(async (req, res) => {
    const { token: accessToken } = req.params;

    try {
        const { pool } = require('../config/database');
        
        // Verify token and get quote
        const [tokenRecord] = await pool.execute(`
            SELECT qca.*, q.*, c.name as client_name, c.email as client_email
            FROM quote_client_actions qca
            JOIN quotes q ON qca.quote_id = q.id
            JOIN clients c ON q.client_id = c.id
            WHERE qca.access_token = ? AND qca.expires_at > datetime('now') AND qca.action_type = 'access_granted'
            LIMIT 1
        `, [accessToken]);

        if (!tokenRecord.length) {
            return res.status(404).json({ error: 'Quote not found or access expired' });
        }

        const quote = tokenRecord[0];

        // Get quote items
        const [items] = await pool.execute(`
            SELECT * FROM quote_items WHERE quote_id = ?
        `, [quote.id]);

        // Record view action
        await quoteWorkflowService.recordClientAction(accessToken, 'viewed', {
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent')
        });

        res.json({
            success: true,
            quote: {
                id: quote.id,
                quote_number: quote.quote_number,
                subtotal: quote.subtotal,
                itbis: quote.itbis,
                total: quote.total,
                notes: quote.notes,
                valid_until: quote.valid_until,
                status: quote.status,
                created_at: quote.created_at,
                client: {
                    name: quote.client_name,
                    email: quote.client_email
                },
                items: items.map(item => ({
                    product_id: item.product_id,
                    product_name: item.product_name,
                    product_ean: item.product_ean,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    total_price: item.total_price
                }))
            }
        });
    } catch (error) {
        logger.error('Failed to get client quote view', {
            error,
            accessToken: accessToken.substring(0, 8) + '...',
            type: 'CLIENT_VIEW_ERROR'
        });
        res.status(500).json({ error: 'Failed to retrieve quote details' });
    }
}));

module.exports = router;