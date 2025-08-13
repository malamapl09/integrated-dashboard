const { database } = require('../../shared/database');
const moment = require('moment');

class DashboardService {
  constructor() {
    this.sqliteDb = database.sqlite;
    this.mysqlDb = database.mysql;
    this.oracleDb = database.oracle;
  }

  /**
   * Get comprehensive dashboard statistics
   */
  async getDashboardStats() {
    try {
      // Run all queries in parallel for performance
      const [
        userStats,
        quotesStats,
        logsStats,
        catalogStats,
        salesStats,
        trendsData
      ] = await Promise.all([
        this.getUserStats(),
        this.getQuotesStats(),
        this.getLogsStats(),
        this.getCatalogStats(),
        this.getSalesStats(),
        this.getTrendData()
      ]);

      return {
        overview: {
          totalUsers: userStats.totalUsers,
          activeUsers: userStats.activeUsers,
          totalQuotes: quotesStats.totalQuotes,
          pendingQuotes: quotesStats.pendingQuotes,
          totalProducts: catalogStats.totalProducts,
          totalRevenue: salesStats.totalRevenue,
          totalOrders: salesStats.totalOrders,
          recentActivity: logsStats.recentActivity
        },
        modules: {
          quotes: quotesStats,
          logs: logsStats,
          catalog: catalogStats,
          sales: salesStats,
          users: userStats
        },
        trends: trendsData,
        systemHealth: {
          databases: await this.getDatabaseHealth(),
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw new Error('Failed to fetch dashboard statistics');
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats() {
    try {
      const [totalUsersResult] = await this.sqliteDb.execute(
        'SELECT COUNT(*) as count FROM users'
      );
      
      const [activeUsersResult] = await this.sqliteDb.execute(
        'SELECT COUNT(*) as count FROM users WHERE active = 1'
      );

      const [recentLoginsResult] = await this.sqliteDb.execute(
        `SELECT COUNT(*) as count FROM users 
         WHERE last_login >= datetime('now', '-7 days')`
      );

      const [roleStatsResult] = await this.sqliteDb.execute(
        `SELECT role, COUNT(*) as count FROM users 
         WHERE active = 1 GROUP BY role`
      );

      return {
        totalUsers: totalUsersResult[0].count,
        activeUsers: activeUsersResult[0].count,
        recentLogins: recentLoginsResult[0].count,
        roleBreakdown: roleStatsResult
      };
    } catch (error) {
      console.error('Error fetching user stats:', error);
      return { totalUsers: 0, activeUsers: 0, recentLogins: 0, roleBreakdown: [] };
    }
  }

  /**
   * Get quotes statistics
   */
  async getQuotesStats() {
    try {
      const [totalQuotesResult] = await this.sqliteDb.execute(
        'SELECT COUNT(*) as count FROM quotes'
      );

      const [pendingQuotesResult] = await this.sqliteDb.execute(
        "SELECT COUNT(*) as count FROM quotes WHERE status = 'draft'"
      );

      const [monthlyQuotesResult] = await this.sqliteDb.execute(
        `SELECT COUNT(*) as count FROM quotes 
         WHERE created_at >= date('now', '-30 days')`
      );

      const [totalValueResult] = await this.sqliteDb.execute(
        'SELECT COALESCE(SUM(total), 0) as total FROM quotes'
      );

      const [recentQuotesResult] = await this.sqliteDb.execute(
        `SELECT q.quote_number, q.total, q.created_at, c.name as client_name
         FROM quotes q 
         JOIN clients c ON q.client_id = c.id 
         ORDER BY q.created_at DESC LIMIT 5`
      );

      return {
        totalQuotes: totalQuotesResult[0].count,
        pendingQuotes: pendingQuotesResult[0].count,
        monthlyQuotes: monthlyQuotesResult[0].count,
        totalValue: parseFloat(totalValueResult[0].total) || 0,
        recentQuotes: recentQuotesResult
      };
    } catch (error) {
      console.error('Error fetching quotes stats:', error);
      return { totalQuotes: 0, pendingQuotes: 0, monthlyQuotes: 0, totalValue: 0, recentQuotes: [] };
    }
  }

  /**
   * Get user logs statistics
   */
  async getLogsStats() {
    try {
      if (!this.mysqlDb) {
        return { totalLogs: 0, recentActivity: 0, topActions: [] };
      }

      const [totalLogsResult] = await this.mysqlDb.execute(
        'SELECT COUNT(*) as count FROM users_logs'
      );

      const [recentActivityResult] = await this.mysqlDb.execute(
        `SELECT COUNT(*) as count FROM users_logs 
         WHERE date_timer >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`
      );

      const [topActionsResult] = await this.mysqlDb.execute(
        `SELECT log as action, COUNT(*) as count FROM users_logs 
         WHERE date_timer >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         GROUP BY log ORDER BY count DESC LIMIT 5`
      );

      return {
        totalLogs: totalLogsResult[0].count,
        recentActivity: recentActivityResult[0].count,
        topActions: topActionsResult
      };
    } catch (error) {
      console.error('Error fetching logs stats:', error);
      return { totalLogs: 0, recentActivity: 0, topActions: [] };
    }
  }

  /**
   * Get catalog statistics
   */
  async getCatalogStats() {
    try {
      if (!this.mysqlDb) {
        return { totalProducts: 0, activeProducts: 0, categories: 0 };
      }

      const [totalProductsResult] = await this.mysqlDb.execute(
        'SELECT COUNT(*) as count FROM web_products WHERE borrado = 0'
      );

      const [activeProductsResult] = await this.mysqlDb.execute(
        'SELECT COUNT(*) as count FROM web_products WHERE borrado = 0 AND status_new = 1'
      );

      const [categoriesResult] = await this.mysqlDb.execute(
        'SELECT COUNT(DISTINCT depto) as count FROM web_products WHERE borrado = 0 AND depto IS NOT NULL'
      );

      const [lowStockResult] = await this.mysqlDb.execute(
        'SELECT COUNT(*) as count FROM web_products WHERE borrado = 0 AND without_stock = 1'
      );

      return {
        totalProducts: totalProductsResult[0].count,
        activeProducts: activeProductsResult[0].count,
        categories: categoriesResult[0].count,
        lowStock: lowStockResult[0].count
      };
    } catch (error) {
      console.error('Error fetching catalog stats:', error);
      return { totalProducts: 0, activeProducts: 0, categories: 0, lowStock: 0 };
    }
  }

  /**
   * Get sales statistics (Oracle ERP if available, MySQL fallback)
   */
  async getSalesStats() {
    try {
      const isOracleAvailable = this.oracleDb.isAvailable();
      
      if (isOracleAvailable) {
        return await this.getOracleSalesStats();
      } else {
        return await this.getMySQLSalesStats();
      }
    } catch (error) {
      console.error('Error fetching sales stats:', error);
      throw new Error(`Sales data unavailable: ${error.message}`);
    }
  }

  /**
   * Get Oracle ERP sales stats
   */
  async getOracleSalesStats() {
    try {
      // Get total stats
      const [totalStatsResult] = await this.oracleDb.execute(
        `SELECT 
           COUNT(DISTINCT ORDEN) as TOTAL_ORDERS,
           COALESCE(SUM(TOTAL), 0) as TOTAL_REVENUE
         FROM INTRANET.WEB_ORDENES`
      );

      // Get recent stats (last 12 months to ensure we get data)
      const [monthlyStatsResult] = await this.oracleDb.execute(
        `SELECT 
           COUNT(DISTINCT ORDEN) as MONTHLY_ORDERS,
           COALESCE(SUM(TOTAL), 0) as MONTHLY_REVENUE
         FROM INTRANET.WEB_ORDENES 
         WHERE FECHA_REGISTRO >= SYSDATE - 365`
      );

      // Get recent orders (limit to ensure we get some data)
      const [recentOrdersResult] = await this.oracleDb.execute(
        `SELECT 
           ORDEN, TOTAL, 
           TO_CHAR(FECHA_REGISTRO, 'YYYY-MM-DD') as fecha,
           NOMBRE || ' ' || APELLIDOS as cliente
         FROM (
           SELECT * FROM INTRANET.WEB_ORDENES 
           ORDER BY FECHA_REGISTRO DESC
         ) WHERE ROWNUM <= 5`
      );

      return {
        totalRevenue: parseFloat(totalStatsResult[0].TOTAL_REVENUE) || 0,
        totalOrders: parseInt(totalStatsResult[0].TOTAL_ORDERS) || 0,
        monthlyRevenue: parseFloat(monthlyStatsResult[0].MONTHLY_REVENUE) || 0,
        monthlyOrders: parseInt(monthlyStatsResult[0].MONTHLY_ORDERS) || 0,
        recentOrders: recentOrdersResult,
        dataSource: 'Oracle ERP'
      };
    } catch (error) {
      console.error('Error fetching Oracle sales stats:', error);
      return { totalRevenue: 0, totalOrders: 0, monthlyRevenue: 0, monthlyOrders: 0, dataSource: 'Oracle ERP (Error)' };
    }
  }

  /**
   * Get MySQL sales stats (fallback)
   */
  async getMySQLSalesStats() {
    try {
      if (!this.mysqlDb) {
        return { totalRevenue: 0, totalOrders: 0, monthlyRevenue: 0, monthlyOrders: 0 };
      }

      const [totalStatsResult] = await this.mysqlDb.execute(
        `SELECT 
           COUNT(DISTINCT id) as total_orders,
           COALESCE(SUM(total_price), 0) as total_revenue
         FROM web_orders WHERE order_complete = 1`
      );

      const [monthlyStatsResult] = await this.mysqlDb.execute(
        `SELECT 
           COUNT(DISTINCT id) as monthly_orders,
           COALESCE(SUM(total_price), 0) as monthly_revenue
         FROM web_orders 
         WHERE order_complete = 1 
         AND DATE(order_created) >= DATE_SUB(CURDATE(), INTERVAL 30 DAYS)`
      );

      return {
        totalRevenue: parseFloat(totalStatsResult[0].total_revenue) || 0,
        totalOrders: parseInt(totalStatsResult[0].total_orders) || 0,
        monthlyRevenue: parseFloat(monthlyStatsResult[0].monthly_revenue) || 0,
        monthlyOrders: parseInt(monthlyStatsResult[0].monthly_orders) || 0,
        dataSource: 'MySQL Shopify'
      };
    } catch (error) {
      console.error('Error fetching MySQL sales stats:', error);
      return { totalRevenue: 0, totalOrders: 0, monthlyRevenue: 0, monthlyOrders: 0, dataSource: 'MySQL (Error)' };
    }
  }

  /**
   * Get database health status
   */
  async getDatabaseHealth() {
    const health = {
      sqlite: 'unknown',
      mysql: 'unknown',
      oracle: 'unknown'
    };

    try {
      // Test SQLite
      await this.sqliteDb.execute('SELECT 1');
      health.sqlite = 'connected';
    } catch (error) {
      health.sqlite = 'error';
    }

    try {
      // Test MySQL
      if (this.mysqlDb) {
        await this.mysqlDb.execute('SELECT 1');
        health.mysql = 'connected';
      } else {
        health.mysql = 'not_configured';
      }
    } catch (error) {
      health.mysql = 'error';
    }

    try {
      // Test Oracle
      if (this.oracleDb.isAvailable()) {
        await this.oracleDb.execute('SELECT 1 FROM DUAL');
        health.oracle = 'connected';
      } else {
        health.oracle = 'not_configured';
      }
    } catch (error) {
      health.oracle = 'error';
    }

    return health;
  }

  /**
   * Generate report data for export
   */
  async generateReportData(type, user) {
    try {
      const now = moment();
      let startDate, endDate;
      
      // Define date ranges based on report type
      switch (type) {
        case 'daily':
          startDate = now.startOf('day');
          endDate = now.endOf('day');
          break;
        case 'weekly':
          startDate = now.startOf('week');
          endDate = now.endOf('week');
          break;
        case 'monthly':
          startDate = now.startOf('month');
          endDate = now.endOf('month');
          break;
        case 'quarterly':
          startDate = now.startOf('quarter');
          endDate = now.endOf('quarter');
          break;
      }

      // Get comprehensive stats for the period
      const stats = await this.getDashboardStats();
      
      // Format data for export
      const reportData = [
        {
          metric: 'Total Quotes',
          value: stats.overview.totalQuotes,
          period: type,
          generated_at: new Date().toISOString()
        },
        {
          metric: 'Pending Quotes',
          value: stats.overview.pendingQuotes,
          period: type,
          generated_at: new Date().toISOString()
        },
        {
          metric: 'Total Revenue',
          value: stats.overview.totalRevenue,
          period: type,
          generated_at: new Date().toISOString()
        },
        {
          metric: 'Total Products',
          value: stats.overview.totalProducts,
          period: type,
          generated_at: new Date().toISOString()
        },
        {
          metric: 'Active Users',
          value: stats.overview.activeUsers,
          period: type,
          generated_at: new Date().toISOString()
        },
        {
          metric: 'Recent Activity',
          value: stats.overview.recentActivity,
          period: type,
          generated_at: new Date().toISOString()
        }
      ];

      return { data: reportData };
    } catch (error) {
      console.error('Error generating report data:', error);
      throw new Error('Failed to generate report data');
    }
  }

  /**
   * Get actionable insights for dashboard
   */
  async getActionableInsights(user) {
    try {
      const insights = [];

      // Check for expiring quotes (urgent)
      const [expiringQuotes] = await this.sqliteDb.execute(
        `SELECT COUNT(*) as count, 
                GROUP_CONCAT(quote_number) as quote_numbers,
                SUM(total) as total_value
         FROM quotes 
         WHERE valid_until <= date('now', '+3 days') 
         AND valid_until > date('now', '-1 day')
         AND status = 'draft'`
      );

      if (expiringQuotes[0].count > 0) {
        const totalValue = parseFloat(expiringQuotes[0].total_value) || 0;
        insights.push({
          id: 'expiring-quotes',
          type: 'urgent',
          title: `${expiringQuotes[0].count} quotes expire within 3 days`,
          description: `Total value at risk: $${totalValue.toFixed(2)}. Immediate follow-up recommended to prevent loss.`,
          icon: 'fas fa-exclamation-triangle',
          actions: [
            {
              label: 'Review Expiring Quotes',
              action: 'navigate',
              target: '/quotes-content/?filter=expiring'
            },
            {
              label: 'Send Bulk Reminders',
              action: 'api',
              target: '/api/quotes/send-reminders',
              method: 'POST'
            }
          ],
          priority: 0,
          data: {
            count: expiringQuotes[0].count,
            totalValue: totalValue,
            quoteNumbers: expiringQuotes[0].quote_numbers?.split(',') || []
          }
        });
      }

      // Check for overdue quotes (extremely urgent)
      const [overdueQuotes] = await this.sqliteDb.execute(
        `SELECT COUNT(*) as count, SUM(total) as total_value
         FROM quotes 
         WHERE valid_until < date('now') AND status = 'draft'`
      );

      if (overdueQuotes[0].count > 0) {
        const totalValue = parseFloat(overdueQuotes[0].total_value) || 0;
        insights.push({
          id: 'overdue-quotes',
          type: 'error',
          title: `${overdueQuotes[0].count} quotes are overdue`,
          description: `Lost potential revenue: $${totalValue.toFixed(2)}. Consider following up or archiving these quotes.`,
          icon: 'fas fa-clock',
          actions: [
            {
              label: 'Review Overdue',
              action: 'navigate',
              target: '/quotes-content/?filter=overdue'
            },
            {
              label: 'Bulk Archive',
              action: 'api',
              target: '/api/quotes/bulk-archive',
              method: 'POST'
            }
          ],
          priority: 0,
          data: { count: overdueQuotes[0].count, totalValue: totalValue }
        });
      }

      // Check for high-value pending quotes
      const [highValueQuotes] = await this.sqliteDb.execute(
        `SELECT COUNT(*) as count, AVG(total) as avg_value, MAX(total) as max_value
         FROM quotes 
         WHERE status = 'draft' AND total > 5000
         AND valid_until >= date('now')`
      );

      if (highValueQuotes[0].count > 0) {
        insights.push({
          id: 'high-value-quotes',
          type: 'warning',
          title: `${highValueQuotes[0].count} high-value quotes pending`,
          description: `Average value: $${parseFloat(highValueQuotes[0].avg_value).toFixed(2)}. Highest: $${parseFloat(highValueQuotes[0].max_value).toFixed(2)}. Consider priority follow-up.`,
          icon: 'fas fa-star',
          actions: [
            {
              label: 'Review High-Value',
              action: 'navigate',
              target: '/quotes-content/?filter=high-value'
            }
          ],
          priority: 2,
          data: {
            count: highValueQuotes[0].count,
            avgValue: parseFloat(highValueQuotes[0].avg_value),
            maxValue: parseFloat(highValueQuotes[0].max_value)
          }
        });
      }

      // Check product catalog health
      if (this.mysqlDb) {
        try {
          const [outOfStockProducts] = await this.mysqlDb.execute(
            `SELECT COUNT(*) as count 
             FROM web_products 
             WHERE borrado = 0 AND without_stock = 1`
          );

          if (outOfStockProducts[0].count > 50) {
            insights.push({
              id: 'out-of-stock',
              type: 'warning',
              title: `${outOfStockProducts[0].count} products out of stock`,
              description: 'High number of out-of-stock products may affect sales. Review inventory levels.',
              icon: 'fas fa-boxes',
              actions: [
                {
                  label: 'Review Inventory',
                  action: 'navigate',
                  target: '/catalog/?filter=out-of-stock'
                }
              ],
              priority: 3,
              data: { count: outOfStockProducts[0].count }
            });
          }

          // Check for products with no recent activity
          const [staleProducts] = await this.mysqlDb.execute(
            `SELECT COUNT(*) as count 
             FROM web_products 
             WHERE borrado = 0 AND status_new = 0 
             AND DATE(updated_at) < DATE_SUB(NOW(), INTERVAL 90 DAY)`
          );

          if (staleProducts[0].count > 100) {
            insights.push({
              id: 'stale-products',
              type: 'info',
              title: `${staleProducts[0].count} products need review`,
              description: 'Products haven\'t been updated in 90+ days. Consider reviewing pricing and descriptions.',
              icon: 'fas fa-clock',
              actions: [
                {
                  label: 'Review Stale Products',
                  action: 'navigate',
                  target: '/catalog/?filter=stale'
                }
              ],
              priority: 4,
              data: { count: staleProducts[0].count }
            });
          }
        } catch (error) {
          console.error('Error checking product insights:', error);
        }
      }

      // Check user activity patterns
      if (this.mysqlDb) {
        try {
          const [lowActivityUsers] = await this.sqliteDb.execute(
            `SELECT COUNT(*) as count 
             FROM users 
             WHERE active = 1 
             AND last_login < datetime('now', '-30 days')`
          );

          if (lowActivityUsers[0].count > 0) {
            insights.push({
              id: 'inactive-users',
              type: 'info',
              title: `${lowActivityUsers[0].count} users inactive for 30+ days`,
              description: 'Consider reaching out to inactive users or reviewing access permissions.',
              icon: 'fas fa-users',
              actions: [
                {
                  label: 'Review Users',
                  action: 'navigate',
                  target: '/user-management/?filter=inactive'
                }
              ],
              priority: 5,
              data: { count: lowActivityUsers[0].count }
            });
          }
        } catch (error) {
          console.error('Error checking user activity insights:', error);
        }
      }

      // Check system performance and health
      const health = await this.getDatabaseHealth();
      const unhealthyDatabases = Object.entries(health).filter(([db, status]) => status !== 'connected').length;
      
      if (unhealthyDatabases > 0) {
        const dbNames = Object.entries(health)
          .filter(([db, status]) => status !== 'connected')
          .map(([db]) => db.toUpperCase())
          .join(', ');
          
        insights.push({
          id: 'database-health',
          type: 'error',
          title: `${unhealthyDatabases} database connection(s) failed`,
          description: `Affected databases: ${dbNames}. Some system features may be unavailable.`,
          icon: 'fas fa-database',
          actions: [
            {
              label: 'Check System Status',
              action: 'navigate',
              target: '/monitoring/?tab=databases'
            },
            {
              label: 'Retry Connections',
              action: 'api',
              target: '/api/monitoring/retry-connections',
              method: 'POST'
            }
          ],
          priority: 0,
          data: { unhealthyCount: unhealthyDatabases, affectedDbs: dbNames }
        });
      }

      // Memory usage warning
      const memUsage = process.memoryUsage();
      const memPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      
      if (memPercentage > 85) {
        insights.push({
          id: 'high-memory-usage',
          type: 'warning',
          title: 'High memory usage detected',
          description: `System memory usage at ${Math.round(memPercentage)}%. Consider restarting the application if performance is affected.`,
          icon: 'fas fa-memory',
          actions: [
            {
              label: 'View System Monitor',
              action: 'navigate',
              target: '/monitoring/?tab=performance'
            }
          ],
          priority: 1,
          data: { memoryUsage: Math.round(memPercentage) }
        });
      }

      // Sales performance insights
      try {
        const salesStats = await this.getSalesStats();
        if (salesStats.monthlyRevenue > 0 && salesStats.totalRevenue > 0) {
          const monthlyAverage = salesStats.totalRevenue / 12; // Rough monthly average
          const performance = ((salesStats.monthlyRevenue - monthlyAverage) / monthlyAverage) * 100;

          if (performance > 20) {
            insights.push({
              id: 'sales-performance-up',
              type: 'success',
              title: 'Exceptional sales performance',
              description: `Monthly revenue is ${Math.round(performance)}% above average. Consider analyzing successful strategies.`,
              icon: 'fas fa-chart-line',
              actions: [
                {
                  label: 'View Sales Analytics',
                  action: 'navigate',
                  target: '/sales/?view=analytics'
                }
              ],
              priority: 3,
              data: { performance: Math.round(performance) }
            });
          } else if (performance < -15) {
            insights.push({
              id: 'sales-performance-down',
              type: 'warning',
              title: 'Sales performance below average',
              description: `Monthly revenue is ${Math.abs(Math.round(performance))}% below average. Review sales strategies.`,
              icon: 'fas fa-chart-line-down',
              actions: [
                {
                  label: 'Analyze Sales Trends',
                  action: 'navigate',
                  target: '/sales/?view=trends'
                }
              ],
              priority: 2,
              data: { performance: Math.round(performance) }
            });
          }
        }
      } catch (error) {
        console.error('Error calculating sales performance insights:', error);
      }

      // Sort by priority (lower number = higher priority)
      return insights.sort((a, b) => a.priority - b.priority);
      
    } catch (error) {
      console.error('Error getting actionable insights:', error);
      return [];
    }
  }

  /**
   * Get enhanced activity stream with user context
   */
  async getEnhancedActivityStream(limit = 10, offset = 0, user) {
    try {
      const activities = [];

      // Get recent quotes activity from SQLite
      try {
        const [recentQuotes] = await this.sqliteDb.execute(`
          SELECT 
            q.quote_number,
            q.total,
            q.created_at,
            q.status,
            c.name as client_name,
            u.first_name || ' ' || u.last_name as user_name,
            u.username
          FROM quotes q
          JOIN clients c ON q.client_id = c.id
          LEFT JOIN users u ON q.created_by = u.id
          ORDER BY q.created_at DESC
          LIMIT ?
        `, [Math.ceil(limit / 2)]);

        recentQuotes.forEach(quote => {
          activities.push({
            id: `quote-${quote.quote_number}`,
            type: 'quote',
            action: quote.status === 'draft' ? 'created' : 'updated',
            user: {
              name: quote.user_name || 'System',
              initials: quote.user_name ? quote.user_name.split(' ').map(n => n[0]).join('').substring(0, 2) : 'SY',
              username: quote.username || 'system',
              avatar: this.generateUserAvatar(quote.username, quote.user_name),
              role: 'sales_rep'
            },
            description: `${quote.status === 'draft' ? 'created' : 'updated'} quote #${quote.quote_number} for ${quote.client_name}`,
            metadata: {
              quote_number: quote.quote_number,
              client_name: quote.client_name,
              total: quote.total,
              status: quote.status
            },
            timestamp: quote.created_at,
            module: 'quotes',
            color: 'var(--quotes-primary)'
          });
        });
      } catch (error) {
        console.error('Error fetching quote activities:', error);
      }

      // Get recent user activities from MySQL logs
      if (this.mysqlDb) {
        try {
          const [recentLogs] = await this.mysqlDb.execute(`
            SELECT 
              log as action,
              user as username,
              date_timer as created_at,
              ip
            FROM users_logs 
            WHERE date_timer >= DATE_SUB(NOW(), INTERVAL 1 DAY)
            ORDER BY date_timer DESC 
            LIMIT ?
          `, [Math.ceil(limit / 2)]);

          recentLogs.forEach(log => {
            // Generate initials from username
            const initials = log.username.length >= 2 ? 
              log.username.substring(0, 2).toUpperCase() : 
              log.username.toUpperCase();

            activities.push({
              id: `log-${log.username}-${Date.parse(log.created_at)}`,
              type: 'system',
              action: 'system_action',
              user: {
                name: log.username,
                initials: initials,
                username: log.username,
                avatar: this.generateUserAvatar(log.username, log.username),
                role: 'system_user'
              },
              description: log.action,
              metadata: {
                ip: log.ip,
                raw_action: log.action
              },
              timestamp: log.created_at,
              module: 'logs',
              color: 'var(--logs-primary)'
            });
          });
        } catch (error) {
          console.error('Error fetching system activities:', error);
        }
      }

      // Sort all activities by timestamp (most recent first)
      activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // Apply pagination
      const paginatedActivities = activities.slice(offset, offset + limit);

      // Format timestamps to be more readable
      return paginatedActivities.map(activity => ({
        ...activity,
        relativeTime: moment(activity.timestamp).fromNow(),
        formattedTime: moment(activity.timestamp).format('YYYY-MM-DD HH:mm:ss')
      }));

    } catch (error) {
      console.error('Error getting enhanced activity stream:', error);
      return [];
    }
  }

  /**
   * Get system alerts and notifications
   */
  async getSystemAlerts(user) {
    try {
      const alerts = [];

      // Check database health
      const health = await this.getDatabaseHealth();
      Object.entries(health).forEach(([db, status]) => {
        if (status !== 'connected') {
          alerts.push({
            id: `db-${db}`,
            type: 'error',
            title: `${db.toUpperCase()} Database Connection Failed`,
            message: `The ${db} database is not responding. Some features may be unavailable.`,
            timestamp: new Date().toISOString(),
            persistent: true
          });
        }
      });

      // Check system uptime (alert if less than 1 hour - indicates recent restart)
      const uptime = process.uptime();
      if (uptime < 3600) { // Less than 1 hour
        alerts.push({
          id: 'system-restart',
          type: 'info',
          title: 'System Recently Restarted',
          message: `System has been running for ${Math.round(uptime / 60)} minutes. All services are operational.`,
          timestamp: new Date().toISOString(),
          persistent: false
        });
      }

      // Add scheduled maintenance alert (example)
      const maintenanceTime = moment().add(1, 'day').hour(23).minute(0);
      alerts.push({
        id: 'scheduled-maintenance',
        type: 'info',
        title: 'Scheduled Maintenance Tonight',
        message: `System maintenance scheduled for ${maintenanceTime.format('YYYY-MM-DD HH:mm')} EST. Expected downtime: 30 minutes.`,
        timestamp: new Date().toISOString(),
        persistent: true,
        dismissible: true
      });

      return alerts;
    } catch (error) {
      console.error('Error getting system alerts:', error);
      return [];
    }
  }

  /**
   * Get trend data for KPI cards
   */
  async getTrendData() {
    try {
      const trends = {
        quotes: { change: 0, trend: 'stable', sparkline: [] },
        sales: { change: 0, trend: 'stable', sparkline: [] },
        users: { change: 0, trend: 'stable', sparkline: [] },
        products: { change: 0, trend: 'stable', sparkline: [] },
        activity: { change: 0, trend: 'stable', sparkline: [] }
      };

      // Get quotes trend (comparing last 30 days vs previous 30 days)
      try {
        const [currentQuotes] = await this.sqliteDb.execute(
          `SELECT COUNT(*) as count FROM quotes 
           WHERE created_at >= date('now', '-30 days')`
        );
        
        const [previousQuotes] = await this.sqliteDb.execute(
          `SELECT COUNT(*) as count FROM quotes 
           WHERE created_at >= date('now', '-60 days') 
           AND created_at < date('now', '-30 days')`
        );

        const current = currentQuotes[0].count;
        const previous = previousQuotes[0].count;
        const change = previous > 0 ? ((current - previous) / previous * 100) : 0;
        
        trends.quotes = {
          change: Math.round(change * 10) / 10,
          trend: change > 5 ? 'up' : change < -5 ? 'down' : 'stable',
          sparkline: await this.getQuotesSparkline()
        };
      } catch (error) {
        console.error('Error calculating quotes trend:', error);
      }

      // Get sales trend
      try {
        const salesStats = await this.getSalesStats();
        if (salesStats.monthlyRevenue && salesStats.totalRevenue) {
          // Simple calculation - monthly vs average
          const averageMonthly = salesStats.totalRevenue / 12; // Rough average
          const change = averageMonthly > 0 ? ((salesStats.monthlyRevenue - averageMonthly) / averageMonthly * 100) : 0;
          
          trends.sales = {
            change: Math.round(change * 10) / 10,
            trend: change > 10 ? 'up' : change < -10 ? 'down' : 'stable',
            sparkline: [80, 85, 82, 90, 95, 88, 92] // Mock sparkline data
          };
        }
      } catch (error) {
        console.error('Error calculating sales trend:', error);
      }

      // Get user activity trend
      if (this.mysqlDb) {
        try {
          const [currentActivity] = await this.mysqlDb.execute(
            `SELECT COUNT(*) as count FROM users_logs 
             WHERE date_timer >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
          );
          
          const [previousActivity] = await this.mysqlDb.execute(
            `SELECT COUNT(*) as count FROM users_logs 
             WHERE date_timer >= DATE_SUB(NOW(), INTERVAL 14 DAY)
             AND date_timer < DATE_SUB(NOW(), INTERVAL 7 DAY)`
          );

          const current = currentActivity[0].count;
          const previous = previousActivity[0].count;
          const change = previous > 0 ? ((current - previous) / previous * 100) : 0;
          
          trends.activity = {
            change: Math.round(change * 10) / 10,
            trend: change > 15 ? 'up' : change < -15 ? 'down' : 'stable',
            sparkline: [45, 52, 48, 61, 58, 67, 72]
          };
        } catch (error) {
          console.error('Error calculating activity trend:', error);
        }
      }

      // Set mock positive trends for products and users (would be calculated from real data)
      trends.users = {
        change: 12.5,
        trend: 'up',
        sparkline: [20, 22, 25, 28, 24, 30, 32]
      };

      trends.products = {
        change: -2.1,
        trend: 'stable',
        sparkline: [450, 445, 442, 448, 444, 441, 439]
      };

      return trends;
    } catch (error) {
      console.error('Error calculating trend data:', error);
      return {
        quotes: { change: 0, trend: 'stable', sparkline: [] },
        sales: { change: 0, trend: 'stable', sparkline: [] },
        users: { change: 0, trend: 'stable', sparkline: [] },
        products: { change: 0, trend: 'stable', sparkline: [] },
        activity: { change: 0, trend: 'stable', sparkline: [] }
      };
    }
  }

  /**
   * Get sparkline data for quotes (last 7 days)
   */
  async getQuotesSparkline() {
    try {
      const sparklineData = [];
      
      for (let i = 6; i >= 0; i--) {
        const [dayData] = await this.sqliteDb.execute(
          `SELECT COUNT(*) as count FROM quotes 
           WHERE date(created_at) = date('now', '-${i} days')`
        );
        sparklineData.push(dayData[0].count);
      }
      
      return sparklineData.length > 0 ? sparklineData : [0, 1, 2, 1, 3, 2, 4];
    } catch (error) {
      console.error('Error getting quotes sparkline:', error);
      return [0, 1, 2, 1, 3, 2, 4]; // Mock data
    }
  }

  /**
   * Generate a consistent avatar URL or color for a user
   */
  generateUserAvatar(username, fullName = null) {
    // Generate a consistent color based on username hash
    let hash = 0;
    const str = username || 'anonymous';
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Convert hash to a pleasant color
    const hue = Math.abs(hash % 360);
    const saturation = 65 + (Math.abs(hash) % 25); // 65-90%
    const lightness = 45 + (Math.abs(hash) % 15); // 45-60%
    
    const backgroundColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    const textColor = lightness > 50 ? '#000' : '#fff';
    
    // Return avatar data object
    return {
      type: 'initials',
      backgroundColor: backgroundColor,
      textColor: textColor,
      initials: fullName ? 
        fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 
        username.substring(0, 2).toUpperCase(),
      // Alternative: Gravatar-style URL (if emails were available)
      // url: `https://www.gravatar.com/avatar/${md5Hash}?s=40&d=identicon`
      url: null
    };
  }
}

module.exports = DashboardService;