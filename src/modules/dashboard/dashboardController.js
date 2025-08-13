const DashboardService = require('./dashboardService');

class DashboardController {
  constructor() {
    this.dashboardService = new DashboardService();
  }

  /**
   * Get dashboard statistics
   */
  async getStats(req, res) {
    try {
      const stats = await this.dashboardService.getDashboardStats();
      
      res.json({
        success: true,
        data: stats,
        message: 'Dashboard statistics retrieved successfully'
      });
    } catch (error) {
      console.error('Dashboard stats error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve dashboard statistics'
      });
    }
  }

  /**
   * Get overview KPIs for dashboard cards
   */
  async getOverview(req, res) {
    try {
      const stats = await this.dashboardService.getDashboardStats();
      
      // Extract just the overview data for dashboard cards
      const overview = {
        users: {
          total: stats.overview.totalUsers,
          active: stats.overview.activeUsers,
          icon: 'fas fa-users',
          color: 'blue'
        },
        quotes: {
          total: stats.overview.totalQuotes,
          pending: stats.overview.pendingQuotes,
          value: stats.overview.totalRevenue,
          icon: 'fas fa-file-invoice-dollar',
          color: 'purple'
        },
        products: {
          total: stats.overview.totalProducts,
          active: stats.modules.catalog.activeProducts,
          categories: stats.modules.catalog.categories,
          icon: 'fas fa-boxes',
          color: 'cyan'
        },
        sales: {
          revenue: stats.overview.totalRevenue,
          orders: stats.overview.totalOrders,
          monthly: stats.modules.sales.monthlyRevenue,
          source: stats.modules.sales.dataSource,
          icon: 'fas fa-chart-line',
          color: 'green'
        },
        activity: {
          logs: stats.modules.logs.totalLogs,
          recent: stats.overview.recentActivity,
          icon: 'fas fa-history',
          color: 'pink'
        },
        system: {
          uptime: stats.systemHealth.uptime,
          databases: stats.systemHealth.databases,
          memory: stats.systemHealth.memoryUsage,
          icon: 'fas fa-server',
          color: 'gray'
        }
      };
      
      res.json({
        success: true,
        data: overview,
        timestamp: stats.systemHealth.timestamp
      });
    } catch (error) {
      console.error('Dashboard overview error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve dashboard overview'
      });
    }
  }

  /**
   * Health check for dashboard service
   */
  async healthCheck(req, res) {
    try {
      const health = await this.dashboardService.getDatabaseHealth();
      
      res.json({
        success: true,
        data: {
          service: 'dashboard',
          status: 'operational',
          databases: health,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Dashboard health check error:', error);
      res.status(500).json({
        success: false,
        message: 'Dashboard service health check failed'
      });
    }
  }
}

module.exports = DashboardController;