const express = require('express');
const { authenticate, authorize } = require('../../../shared/middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorHandler');
const inventoryService = require('../services/inventoryService');
const logger = require('../utils/logger');
const router = express.Router();

// Get stock information for a single product
router.get('/stock/:sku', authenticate, asyncHandler(async (req, res) => {
    const { sku } = req.params;

    try {
        const stock = await inventoryService.getProductStock(sku);

        logger.debug('Stock information retrieved', {
            type: 'STOCK_CHECK',
            sku,
            stock: stock.current_stock,
            req
        });

        res.json({
            success: true,
            stock
        });
    } catch (error) {
        logger.error('Failed to get stock information', {
            error,
            sku,
            req,
            type: 'STOCK_CHECK_ERROR'
        });
        res.status(500).json({ error: 'Failed to retrieve stock information' });
    }
}));

// Get stock information for multiple products
router.post('/stock/bulk', authenticate, asyncHandler(async (req, res) => {
    const { skus } = req.body;

    if (!Array.isArray(skus) || skus.length === 0) {
        return res.status(400).json({ error: 'SKUs array is required' });
    }

    if (skus.length > 100) {
        return res.status(400).json({ error: 'Maximum 100 SKUs allowed per request' });
    }

    try {
        const stockData = await inventoryService.getBulkProductStock(skus);

        logger.debug('Bulk stock information retrieved', {
            type: 'BULK_STOCK_CHECK',
            skuCount: skus.length,
            req
        });

        res.json({
            success: true,
            stock_data: stockData,
            requested_skus: skus.length,
            retrieved_count: Object.keys(stockData).length
        });
    } catch (error) {
        logger.error('Failed to get bulk stock information', {
            error,
            skuCount: skus.length,
            req,
            type: 'BULK_STOCK_CHECK_ERROR'
        });
        res.status(500).json({ error: 'Failed to retrieve bulk stock information' });
    }
}));

// Check stock availability for quote items
router.post('/check-availability', authenticate, asyncHandler(async (req, res) => {
    const { quote_items } = req.body;

    if (!Array.isArray(quote_items) || quote_items.length === 0) {
        return res.status(400).json({ error: 'Quote items array is required' });
    }

    // Validate quote items structure
    for (const item of quote_items) {
        if (!item.product_id || !item.quantity) {
            return res.status(400).json({ 
                error: 'Each quote item must have product_id and quantity' 
            });
        }
    }

    try {
        const availability = await inventoryService.checkQuoteStockAvailability(quote_items);

        logger.info('Stock availability checked for quote items', {
            type: 'STOCK_AVAILABILITY_CHECK',
            itemCount: quote_items.length,
            overallAvailable: availability.overall_available,
            req
        });

        res.json({
            success: true,
            availability
        });
    } catch (error) {
        logger.error('Failed to check stock availability', {
            error,
            itemCount: quote_items.length,
            req,
            type: 'STOCK_AVAILABILITY_ERROR'
        });
        res.status(500).json({ error: 'Failed to check stock availability' });
    }
}));

// Reserve stock for a quote
router.post('/reserve/:quoteId', authenticate, asyncHandler(async (req, res) => {
    const { quoteId } = req.params;
    const { quote_items, reservation_minutes } = req.body;

    if (!Array.isArray(quote_items) || quote_items.length === 0) {
        return res.status(400).json({ error: 'Quote items array is required' });
    }

    try {
        const reservation = await inventoryService.reserveStockForQuote(
            quoteId, 
            quote_items, 
            reservation_minutes
        );

        logger.info('Stock reserved for quote', {
            type: 'STOCK_RESERVATION',
            quoteId,
            itemCount: quote_items.length,
            expiresAt: reservation.expires_at,
            req
        });

        res.json({
            success: true,
            reservation
        });
    } catch (error) {
        logger.error('Failed to reserve stock', {
            error,
            quoteId,
            itemCount: quote_items.length,
            req,
            type: 'STOCK_RESERVATION_ERROR'
        });
        res.status(400).json({ error: error.message });
    }
}));

// Release stock reservation
router.delete('/reserve/:quoteId', authenticate, asyncHandler(async (req, res) => {
    const { quoteId } = req.params;
    const { reason } = req.body;

    try {
        const result = await inventoryService.releaseStockReservation(quoteId, reason);

        logger.info('Stock reservation released', {
            type: 'STOCK_RELEASE',
            quoteId,
            reason: reason || 'manual_release',
            req
        });

        res.json({
            success: true,
            result
        });
    } catch (error) {
        logger.error('Failed to release stock reservation', {
            error,
            quoteId,
            req,
            type: 'STOCK_RELEASE_ERROR'
        });
        res.status(500).json({ error: 'Failed to release stock reservation' });
    }
}));

// Get low stock products
router.get('/low-stock', authenticate, authorize(['admin', 'manager']), asyncHandler(async (req, res) => {
    const { threshold } = req.query;
    const stockThreshold = threshold ? parseInt(threshold) : null;

    try {
        const lowStockData = await inventoryService.getLowStockProducts(stockThreshold);

        logger.info('Low stock products retrieved', {
            type: 'LOW_STOCK_CHECK',
            threshold: stockThreshold,
            productCount: lowStockData.products?.length || 0,
            req
        });

        res.json({
            success: true,
            ...lowStockData
        });
    } catch (error) {
        logger.error('Failed to get low stock products', {
            error,
            threshold: stockThreshold,
            req,
            type: 'LOW_STOCK_ERROR'
        });
        res.status(500).json({ error: 'Failed to retrieve low stock products' });
    }
}));

// Get stock statistics
router.get('/statistics', authenticate, authorize(['admin', 'manager']), asyncHandler(async (req, res) => {
    try {
        const statistics = await inventoryService.getStockStatistics();

        logger.debug('Stock statistics retrieved', {
            type: 'STOCK_STATISTICS',
            totalProducts: statistics.total_products,
            req
        });

        res.json({
            success: true,
            statistics
        });
    } catch (error) {
        logger.error('Failed to get stock statistics', {
            error,
            req,
            type: 'STOCK_STATISTICS_ERROR'
        });
        res.status(500).json({ error: 'Failed to retrieve stock statistics' });
    }
}));

// Get stock movement history for a product
router.get('/movement/:sku', authenticate, authorize(['admin', 'manager']), asyncHandler(async (req, res) => {
    const { sku } = req.params;
    const { days } = req.query;
    const historyDays = days ? parseInt(days) : 30;

    try {
        const movementHistory = await inventoryService.getStockMovementHistory(sku, historyDays);

        logger.debug('Stock movement history retrieved', {
            type: 'STOCK_MOVEMENT_HISTORY',
            sku,
            days: historyDays,
            req
        });

        res.json({
            success: true,
            movement_history: movementHistory
        });
    } catch (error) {
        logger.error('Failed to get stock movement history', {
            error,
            sku,
            days: historyDays,
            req,
            type: 'STOCK_MOVEMENT_ERROR'
        });
        res.status(500).json({ error: 'Failed to retrieve stock movement history' });
    }
}));

// Get active stock reservations
router.get('/reservations', authenticate, authorize(['admin', 'manager']), asyncHandler(async (req, res) => {
    try {
        const { pool } = require('../config/database');
        const [reservations] = await pool.execute(`
            SELECT 
                sr.*,
                q.quote_number,
                c.name as client_name,
                u.first_name as creator_first_name,
                u.last_name as creator_last_name
            FROM stock_reservations sr
            JOIN quotes q ON sr.quote_id = q.id
            JOIN clients c ON q.client_id = c.id
            JOIN users u ON q.created_by = u.id
            WHERE sr.expires_at > datetime('now')
            ORDER BY sr.expires_at ASC
        `);

        logger.debug('Active stock reservations retrieved', {
            type: 'STOCK_RESERVATIONS',
            count: reservations.length,
            req
        });

        res.json({
            success: true,
            reservations: reservations.map(r => ({
                ...r,
                creator_name: `${r.creator_first_name} ${r.creator_last_name}`
            })),
            total_count: reservations.length
        });
    } catch (error) {
        logger.error('Failed to get stock reservations', {
            error,
            req,
            type: 'STOCK_RESERVATIONS_ERROR'
        });
        res.status(500).json({ error: 'Failed to retrieve stock reservations' });
    }
}));

// Get inventory alerts
router.get('/alerts', authenticate, authorize(['admin', 'manager']), asyncHandler(async (req, res) => {
    const { status, alert_type } = req.query;

    try {
        const { pool } = require('../config/database');
        
        let whereClause = '';
        let params = [];
        
        if (status) {
            whereClause += ' WHERE status = ?';
            params.push(status);
        }
        
        if (alert_type) {
            whereClause += status ? ' AND alert_type = ?' : ' WHERE alert_type = ?';
            params.push(alert_type);
        }

        const [alerts] = await pool.execute(`
            SELECT * FROM inventory_alerts
            ${whereClause}
            ORDER BY triggered_at DESC
            LIMIT 100
        `, params);

        logger.debug('Inventory alerts retrieved', {
            type: 'INVENTORY_ALERTS',
            count: alerts.length,
            status,
            alert_type,
            req
        });

        res.json({
            success: true,
            alerts: alerts.map(alert => ({
                ...alert,
                notified_users: alert.notified_users ? JSON.parse(alert.notified_users) : [],
                metadata: alert.metadata ? JSON.parse(alert.metadata) : {}
            })),
            total_count: alerts.length
        });
    } catch (error) {
        logger.error('Failed to get inventory alerts', {
            error,
            status,
            alert_type,
            req,
            type: 'INVENTORY_ALERTS_ERROR'
        });
        res.status(500).json({ error: 'Failed to retrieve inventory alerts' });
    }
}));

// Update inventory alert status
router.put('/alerts/:id', authenticate, authorize(['admin', 'manager']), asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!['resolved', 'dismissed'].includes(status)) {
        return res.status(400).json({ error: 'Status must be either "resolved" or "dismissed"' });
    }

    try {
        const { pool } = require('../config/database');
        
        const resolvedAt = status === 'resolved' ? new Date().toISOString() : null;
        
        await pool.execute(`
            UPDATE inventory_alerts 
            SET status = ?, resolved_at = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `, [status, resolvedAt, id]);

        logger.info('Inventory alert status updated', {
            type: 'INVENTORY_ALERT_UPDATE',
            alertId: id,
            newStatus: status,
            req
        });

        res.json({
            success: true,
            message: `Alert ${status} successfully`
        });
    } catch (error) {
        logger.error('Failed to update inventory alert', {
            error,
            alertId: id,
            status,
            req,
            type: 'INVENTORY_ALERT_UPDATE_ERROR'
        });
        res.status(500).json({ error: 'Failed to update inventory alert' });
    }
}));

// Get inventory settings (admin only)
router.get('/settings', authenticate, authorize(['admin']), asyncHandler(async (req, res) => {
    try {
        const { pool } = require('../config/database');
        const [settings] = await pool.execute('SELECT * FROM inventory_settings ORDER BY setting_key');
        
        const settingsObj = {};
        settings.forEach(setting => {
            settingsObj[setting.setting_key] = {
                value: setting.setting_value,
                description: setting.description
            };
        });

        res.json({
            success: true,
            settings: settingsObj
        });
    } catch (error) {
        logger.error('Failed to get inventory settings', {
            error,
            req,
            type: 'INVENTORY_SETTINGS_ERROR'
        });
        res.status(500).json({ error: 'Failed to retrieve inventory settings' });
    }
}));

// Update inventory settings (admin only)
router.put('/settings', authenticate, authorize(['admin']), asyncHandler(async (req, res) => {
    const { settings } = req.body;
    const userId = req.user.id;

    if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'Settings object is required' });
    }

    try {
        const { pool } = require('../config/database');
        
        await pool.beginTransaction();

        for (const [key, value] of Object.entries(settings)) {
            await pool.execute(`
                UPDATE inventory_settings 
                SET setting_value = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
                WHERE setting_key = ?
            `, [value, userId, key]);
        }

        await pool.commit();

        logger.info('Inventory settings updated', {
            type: 'INVENTORY_SETTINGS_UPDATE',
            userId,
            settingsKeys: Object.keys(settings),
            req
        });

        res.json({
            success: true,
            message: 'Inventory settings updated successfully'
        });
    } catch (error) {
        await pool.rollback();
        logger.error('Failed to update inventory settings', {
            error,
            userId,
            settings,
            req,
            type: 'INVENTORY_SETTINGS_UPDATE_ERROR'
        });
        res.status(500).json({ error: 'Failed to update inventory settings' });
    }
}));

// Trigger manual low stock check
router.post('/check-low-stock', authenticate, authorize(['admin', 'manager']), asyncHandler(async (req, res) => {
    try {
        await inventoryService.checkAndNotifyLowStock();

        logger.info('Manual low stock check triggered', {
            type: 'MANUAL_LOW_STOCK_CHECK',
            triggeredBy: req.user.id,
            req
        });

        res.json({
            success: true,
            message: 'Low stock check completed successfully'
        });
    } catch (error) {
        logger.error('Failed to perform manual low stock check', {
            error,
            triggeredBy: req.user.id,
            req,
            type: 'MANUAL_LOW_STOCK_CHECK_ERROR'
        });
        res.status(500).json({ error: 'Failed to perform low stock check' });
    }
}));

// Get inventory dashboard data
router.get('/dashboard', authenticate, authorize(['admin', 'manager']), asyncHandler(async (req, res) => {
    try {
        // Get multiple data points in parallel
        const [statistics, lowStockData, reservations] = await Promise.all([
            inventoryService.getStockStatistics(),
            inventoryService.getLowStockProducts(),
            (async () => {
                const { pool } = require('../config/database');
                const [result] = await pool.execute(`
                    SELECT COUNT(*) as count, SUM(reserved_quantity) as total_reserved
                    FROM stock_reservations 
                    WHERE expires_at > datetime('now')
                `);
                return result[0] || { count: 0, total_reserved: 0 };
            })()
        ]);

        const dashboardData = {
            statistics,
            low_stock: {
                total_count: lowStockData.products?.length || 0,
                critical_count: lowStockData.products?.filter(p => p.urgency === 'critical').length || 0,
                high_urgency_count: lowStockData.products?.filter(p => p.urgency === 'high').length || 0
            },
            reservations: {
                active_count: parseInt(reservations.count) || 0,
                total_reserved_units: parseInt(reservations.total_reserved) || 0
            },
            last_updated: new Date().toISOString()
        };

        logger.debug('Inventory dashboard data retrieved', {
            type: 'INVENTORY_DASHBOARD',
            req
        });

        res.json({
            success: true,
            dashboard: dashboardData
        });
    } catch (error) {
        logger.error('Failed to get inventory dashboard data', {
            error,
            req,
            type: 'INVENTORY_DASHBOARD_ERROR'
        });
        res.status(500).json({ error: 'Failed to retrieve inventory dashboard data' });
    }
}));

module.exports = router;