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
        salesStats
      ] = await Promise.all([
        this.getUserStats(),
        this.getQuotesStats(),
        this.getLogsStats(),
        this.getCatalogStats(),
        this.getSalesStats()
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
}

module.exports = DashboardService;