const { pimPool, pool } = require('../config/database');
const logger = require('../utils/logger');
const cache = require('../utils/cache');
const emailQueueService = require('./emailQueueService');

class InventoryService {
    constructor() {
        this.stockCheckCacheTime = 60; // 1 minute cache for stock checks
        this.lowStockThreshold = 10; // Default low stock threshold
        this.stockReservationTime = 30 * 60 * 1000; // 30 minutes in milliseconds
        
        // Start periodic stock monitoring
        this.startStockMonitoring();
    }

    // Get real-time stock for a single product
    async getProductStock(sku) {
        const cacheKey = `stock:${sku}`;
        const cached = cache.get(cacheKey);
        
        if (cached !== null) {
            return cached;
        }

        try {
            if (!pimPool) {
                logger.warn('PIM database not available, using fallback stock data', {
                    type: 'INVENTORY_FALLBACK',
                    sku
                });
                return this.getFallbackStock(sku);
            }

            const [stockRows] = await pimPool.execute(
                `SELECT sku, MAX(stock) as current_stock, 
                        SUM(stock) as total_stock,
                        COUNT(DISTINCT pl) as locations
                 FROM web_inventory 
                 WHERE sku = ? AND stock > 0
                 GROUP BY sku`,
                [sku]
            );

            const stock = stockRows.length > 0 ? {
                sku: sku,
                current_stock: parseInt(stockRows[0].current_stock) || 0,
                total_stock: parseInt(stockRows[0].total_stock) || 0,
                locations: parseInt(stockRows[0].locations) || 0,
                last_updated: new Date().toISOString()
            } : {
                sku: sku,
                current_stock: 0,
                total_stock: 0,
                locations: 0,
                last_updated: new Date().toISOString()
            };

            // Cache for 1 minute
            cache.set(cacheKey, stock, this.stockCheckCacheTime);
            
            return stock;
        } catch (error) {
            logger.error('Error fetching product stock', {
                error,
                sku,
                type: 'INVENTORY_ERROR'
            });
            return this.getFallbackStock(sku);
        }
    }

    // Get stock for multiple products efficiently
    async getBulkProductStock(skus) {
        if (!Array.isArray(skus) || skus.length === 0) {
            return {};
        }

        const stockData = {};
        const uncachedSkus = [];

        // Check cache first
        for (const sku of skus) {
            const cacheKey = `stock:${sku}`;
            const cached = cache.get(cacheKey);
            if (cached !== null) {
                stockData[sku] = cached;
            } else {
                uncachedSkus.push(sku);
            }
        }

        // Fetch uncached stocks
        if (uncachedSkus.length > 0) {
            try {
                if (!pimPool) {
                    // Use fallback data
                    for (const sku of uncachedSkus) {
                        stockData[sku] = this.getFallbackStock(sku);
                    }
                } else {
                    const placeholders = uncachedSkus.map(() => '?').join(',');
                    const [stockRows] = await pimPool.execute(
                        `SELECT sku, MAX(stock) as current_stock, 
                                SUM(stock) as total_stock,
                                COUNT(DISTINCT pl) as locations
                         FROM web_inventory 
                         WHERE sku IN (${placeholders}) AND stock >= 0
                         GROUP BY sku`,
                        uncachedSkus
                    );

                    // Process results
                    const stockMap = {};
                    stockRows.forEach(row => {
                        stockMap[row.sku] = {
                            sku: row.sku,
                            current_stock: parseInt(row.current_stock) || 0,
                            total_stock: parseInt(row.total_stock) || 0,
                            locations: parseInt(row.locations) || 0,
                            last_updated: new Date().toISOString()
                        };
                    });

                    // Add results and cache them
                    for (const sku of uncachedSkus) {
                        const stock = stockMap[sku] || {
                            sku: sku,
                            current_stock: 0,
                            total_stock: 0,
                            locations: 0,
                            last_updated: new Date().toISOString()
                        };
                        
                        stockData[sku] = stock;
                        cache.set(`stock:${sku}`, stock, this.stockCheckCacheTime);
                    }
                }
            } catch (error) {
                logger.error('Error fetching bulk stock data', {
                    error,
                    skus: uncachedSkus,
                    type: 'BULK_INVENTORY_ERROR'
                });

                // Use fallback for failed fetches
                for (const sku of uncachedSkus) {
                    stockData[sku] = this.getFallbackStock(sku);
                }
            }
        }

        return stockData;
    }

    // Check stock availability for quote items
    async checkQuoteStockAvailability(quoteItems) {
        const skus = quoteItems.map(item => item.product_id);
        const stockData = await this.getBulkProductStock(skus);

        const availability = [];
        let hasStockIssues = false;

        for (const item of quoteItems) {
            const stock = stockData[item.product_id];
            const requestedQty = parseInt(item.quantity) || 0;
            const availableStock = stock ? stock.current_stock : 0;

            const itemAvailability = {
                product_id: item.product_id,
                product_name: item.product_name,
                requested_quantity: requestedQty,
                available_stock: availableStock,
                is_available: availableStock >= requestedQty,
                stock_shortage: Math.max(0, requestedQty - availableStock),
                stock_status: this.getStockStatus(availableStock, requestedQty),
                estimated_restock: null // Could be enhanced with restock data
            };

            if (!itemAvailability.is_available) {
                hasStockIssues = true;
            }

            availability.push(itemAvailability);
        }

        return {
            overall_available: !hasStockIssues,
            items: availability,
            checked_at: new Date().toISOString()
        };
    }

    // Reserve stock for quotes (temporary hold)
    async reserveStockForQuote(quoteId, quoteItems, reservationMinutes = 30) {
        try {
            await pool.beginTransaction();

            const reservationExpiry = new Date(Date.now() + (reservationMinutes * 60 * 1000));
            
            for (const item of quoteItems) {
                // Check current availability
                const stock = await this.getProductStock(item.product_id);
                const requestedQty = parseInt(item.quantity) || 0;

                if (stock.current_stock < requestedQty) {
                    throw new Error(`Insufficient stock for ${item.product_name}. Available: ${stock.current_stock}, Requested: ${requestedQty}`);
                }

                // Create reservation record
                await pool.execute(`
                    INSERT INTO stock_reservations (
                        quote_id, product_id, reserved_quantity, expires_at, created_at
                    ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(quote_id, product_id) DO UPDATE SET
                        reserved_quantity = excluded.reserved_quantity,
                        expires_at = excluded.expires_at,
                        updated_at = CURRENT_TIMESTAMP
                `, [quoteId, item.product_id, requestedQty, reservationExpiry.toISOString()]);
            }

            await pool.commit();

            logger.info(`Stock reserved for quote ${quoteId}`, {
                type: 'STOCK_RESERVATION',
                quoteId,
                itemCount: quoteItems.length,
                expiresAt: reservationExpiry.toISOString()
            });

            return {
                success: true,
                reservation_id: quoteId,
                expires_at: reservationExpiry.toISOString(),
                items_reserved: quoteItems.length
            };
        } catch (error) {
            await pool.rollback();
            logger.error('Failed to reserve stock for quote', {
                error,
                quoteId,
                items: quoteItems.length,
                type: 'STOCK_RESERVATION_ERROR'
            });
            throw error;
        }
    }

    // Release stock reservations
    async releaseStockReservation(quoteId, reason = 'manual_release') {
        try {
            const [released] = await pool.execute(
                'DELETE FROM stock_reservations WHERE quote_id = ?',
                [quoteId]
            );

            logger.info(`Stock reservation released for quote ${quoteId}`, {
                type: 'STOCK_RELEASE',
                quoteId,
                reason,
                itemsReleased: released.affectedRows
            });

            return { success: true, items_released: released.affectedRows };
        } catch (error) {
            logger.error('Failed to release stock reservation', {
                error,
                quoteId,
                reason,
                type: 'STOCK_RELEASE_ERROR'
            });
            throw error;
        }
    }

    // Get low stock products
    async getLowStockProducts(threshold = null) {
        const stockThreshold = threshold || this.lowStockThreshold;
        const cacheKey = `low_stock:${stockThreshold}`;
        const cached = cache.get(cacheKey);

        if (cached) {
            return cached;
        }

        try {
            if (!pimPool) {
                logger.warn('PIM database not available for low stock check', {
                    type: 'LOW_STOCK_FALLBACK'
                });
                return { products: [], last_updated: new Date().toISOString() };
            }

            const [lowStockRows] = await pimPool.execute(`
                SELECT 
                    wp.sku,
                    wp.title as name,
                    wp.description,
                    wp.depto as category,
                    COALESCE(SUM(wi.stock), 0) as current_stock,
                    wp.price,
                    wpp.price as promo_price
                FROM web_products wp
                LEFT JOIN web_inventory wi ON wp.sku = wi.sku
                LEFT JOIN web_products_promo wpp ON wp.sku = wpp.sku
                WHERE wp.status_new = 1 AND wp.borrado = 0 
                GROUP BY wp.sku, wp.title, wp.description, wp.depto, wp.price, wpp.price
                HAVING current_stock <= ? AND current_stock >= 0
                ORDER BY current_stock ASC, wp.title ASC
                LIMIT 100
            `, [stockThreshold]);

            const lowStockProducts = lowStockRows.map(row => ({
                sku: row.sku,
                name: row.name,
                description: row.description,
                category: row.category,
                current_stock: parseInt(row.current_stock) || 0,
                price: parseFloat(row.price) || 0,
                promo_price: parseFloat(row.promo_price) || null,
                stock_status: this.getStockStatus(row.current_stock, stockThreshold),
                urgency: row.current_stock === 0 ? 'critical' : row.current_stock <= 5 ? 'high' : 'medium'
            }));

            const result = {
                products: lowStockProducts,
                threshold: stockThreshold,
                total_count: lowStockProducts.length,
                critical_count: lowStockProducts.filter(p => p.current_stock === 0).length,
                last_updated: new Date().toISOString()
            };

            // Cache for 5 minutes
            cache.set(cacheKey, result, 300);
            return result;
        } catch (error) {
            logger.error('Error fetching low stock products', {
                error,
                threshold: stockThreshold,
                type: 'LOW_STOCK_ERROR'
            });
            return { products: [], last_updated: new Date().toISOString(), error: error.message };
        }
    }

    // Get stock movement history (if available)
    async getStockMovementHistory(sku, days = 30) {
        // This would require stock movement tracking in the PIM system
        // For now, return a placeholder structure
        return {
            sku,
            movements: [],
            period_days: days,
            note: 'Stock movement tracking not yet implemented in PIM system'
        };
    }

    // Get stock statistics
    async getStockStatistics() {
        const cacheKey = 'stock_statistics';
        const cached = cache.get(cacheKey);

        if (cached) {
            return cached;
        }

        try {
            if (!pimPool) {
                return {
                    total_products: 0,
                    in_stock: 0,
                    out_of_stock: 0,
                    low_stock: 0,
                    last_updated: new Date().toISOString()
                };
            }

            const [statsRows] = await pimPool.execute(`
                SELECT 
                    COUNT(DISTINCT wp.sku) as total_products,
                    COUNT(DISTINCT CASE WHEN COALESCE(SUM(wi.stock), 0) > 0 THEN wp.sku END) as in_stock,
                    COUNT(DISTINCT CASE WHEN COALESCE(SUM(wi.stock), 0) = 0 THEN wp.sku END) as out_of_stock,
                    COUNT(DISTINCT CASE WHEN COALESCE(SUM(wi.stock), 0) > 0 AND COALESCE(SUM(wi.stock), 0) <= ? THEN wp.sku END) as low_stock,
                    AVG(COALESCE(SUM(wi.stock), 0)) as avg_stock,
                    SUM(COALESCE(SUM(wi.stock), 0)) as total_stock_units
                FROM web_products wp
                LEFT JOIN web_inventory wi ON wp.sku = wi.sku
                WHERE wp.status_new = 1 AND wp.borrado = 0
                GROUP BY wp.sku
            `, [this.lowStockThreshold]);

            const stats = statsRows[0] || {};
            const result = {
                total_products: parseInt(stats.total_products) || 0,
                in_stock: parseInt(stats.in_stock) || 0,
                out_of_stock: parseInt(stats.out_of_stock) || 0,
                low_stock: parseInt(stats.low_stock) || 0,
                avg_stock: parseFloat(stats.avg_stock) || 0,
                total_stock_units: parseInt(stats.total_stock_units) || 0,
                stock_health_percentage: stats.total_products > 0 ? 
                    Math.round(((stats.in_stock - stats.low_stock) / stats.total_products) * 100) : 0,
                last_updated: new Date().toISOString()
            };

            // Cache for 10 minutes
            cache.set(cacheKey, result, 600);
            return result;
        } catch (error) {
            logger.error('Error fetching stock statistics', {
                error,
                type: 'STOCK_STATS_ERROR'
            });
            return {
                total_products: 0,
                in_stock: 0,
                out_of_stock: 0,
                低_stock: 0,
                error: error.message,
                last_updated: new Date().toISOString()
            };
        }
    }

    // Helper methods
    getFallbackStock(sku) {
        // Fallback stock data when PIM is not available
        const fallbackStocks = {
            '2101424000000': { current_stock: 100, total_stock: 100, locations: 1 },
            '2299902078400': { current_stock: 50, total_stock: 50, locations: 1 },
            '2299902117345': { current_stock: 75, total_stock: 75, locations: 1 },
            '2110945000000': { current_stock: 80, total_stock: 80, locations: 1 },
            '7702027040252': { current_stock: 30, total_stock: 30, locations: 1 },
        };

        return fallbackStocks[sku] || {
            sku: sku,
            current_stock: 0,
            total_stock: 0,
            locations: 0,
            last_updated: new Date().toISOString(),
            fallback: true
        };
    }

    getStockStatus(currentStock, requestedQty = 0) {
        if (currentStock === 0) return 'out_of_stock';
        if (currentStock <= this.lowStockThreshold) return 'low_stock';
        if (requestedQty > 0 && currentStock < requestedQty) return 'insufficient';
        return 'in_stock';
    }

    // Periodic stock monitoring
    startStockMonitoring() {
        // Check for low stock every hour
        setInterval(async () => {
            try {
                await this.checkAndNotifyLowStock();
            } catch (error) {
                logger.error('Error in periodic stock monitoring', {
                    error,
                    type: 'STOCK_MONITORING_ERROR'
                });
            }
        }, 60 * 60 * 1000); // 1 hour

        // Clean up expired reservations every 15 minutes
        setInterval(async () => {
            try {
                await this.cleanupExpiredReservations();
            } catch (error) {
                logger.error('Error cleaning up expired reservations', {
                    error,
                    type: 'RESERVATION_CLEANUP_ERROR'
                });
            }
        }, 15 * 60 * 1000); // 15 minutes

        logger.info('Stock monitoring started', {
            type: 'STOCK_MONITORING_START',
            lowStockCheck: '1 hour',
            reservationCleanup: '15 minutes'
        });
    }

    // Check and notify about low stock
    async checkAndNotifyLowStock() {
        try {
            const lowStockData = await this.getLowStockProducts();
            
            if (lowStockData.products && lowStockData.products.length > 0) {
                const criticalProducts = lowStockData.products.filter(p => p.urgency === 'critical');
                const highUrgencyProducts = lowStockData.products.filter(p => p.urgency === 'high');

                if (criticalProducts.length > 0 || highUrgencyProducts.length > 0) {
                    await this.sendLowStockNotification(lowStockData);
                }
            }
        } catch (error) {
            logger.error('Error in low stock notification check', {
                error,
                type: 'LOW_STOCK_NOTIFICATION_ERROR'
            });
        }
    }

    // Send low stock notification
    async sendLowStockNotification(lowStockData) {
        try {
            // Get admin users for notification
            const [admins] = await pool.execute(
                'SELECT email, first_name, last_name FROM users WHERE role IN (?, ?) AND active = 1',
                ['admin', 'manager']
            );

            for (const admin of admins) {
                const emailData = {
                    template: 'low_stock_alert',
                    recipientEmail: admin.email,
                    recipientName: `${admin.first_name} ${admin.last_name}`,
                    subject: `Alerta de Stock Bajo - ${lowStockData.total_count} productos`,
                    lowStockData: lowStockData,
                    criticalCount: lowStockData.products.filter(p => p.urgency === 'critical').length,
                    highUrgencyCount: lowStockData.products.filter(p => p.urgency === 'high').length
                };

                await emailQueueService.addToQueue(emailData, 1); // High priority
            }

            logger.info('Low stock notifications sent', {
                type: 'LOW_STOCK_NOTIFICATION_SENT',
                recipientCount: admins.length,
                criticalProducts: lowStockData.products.filter(p => p.urgency === 'critical').length,
                totalLowStock: lowStockData.total_count
            });
        } catch (error) {
            logger.error('Failed to send low stock notifications', {
                error,
                type: 'LOW_STOCK_NOTIFICATION_FAILED'
            });
        }
    }

    // Clean up expired stock reservations
    async cleanupExpiredReservations() {
        try {
            const [result] = await pool.execute(
                'DELETE FROM stock_reservations WHERE expires_at < datetime("now")'
            );

            if (result.affectedRows > 0) {
                logger.info(`Cleaned up ${result.affectedRows} expired stock reservations`, {
                    type: 'RESERVATION_CLEANUP',
                    expiredCount: result.affectedRows
                });
            }
        } catch (error) {
            logger.error('Error cleaning up expired reservations', {
                error,
                type: 'RESERVATION_CLEANUP_ERROR'
            });
        }
    }
}

module.exports = new InventoryService();