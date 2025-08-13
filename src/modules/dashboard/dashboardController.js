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
          color: 'blue',
          trend: stats.trends?.users || { change: 0, trend: 'stable', sparkline: [] }
        },
        quotes: {
          total: stats.overview.totalQuotes,
          pending: stats.overview.pendingQuotes,
          value: stats.overview.totalRevenue,
          icon: 'fas fa-file-invoice-dollar',
          color: 'purple',
          trend: stats.trends?.quotes || { change: 0, trend: 'stable', sparkline: [] }
        },
        products: {
          total: stats.overview.totalProducts,
          active: stats.modules.catalog.activeProducts,
          categories: stats.modules.catalog.categories,
          icon: 'fas fa-boxes',
          color: 'cyan',
          trend: stats.trends?.products || { change: 0, trend: 'stable', sparkline: [] }
        },
        sales: {
          revenue: stats.overview.totalRevenue,
          orders: stats.overview.totalOrders,
          monthly: stats.modules.sales.monthlyRevenue,
          source: stats.modules.sales.dataSource,
          icon: 'fas fa-chart-line',
          color: 'green',
          trend: stats.trends?.sales || { change: 0, trend: 'stable', sparkline: [] }
        },
        activity: {
          logs: stats.modules.logs.totalLogs,
          recent: stats.overview.recentActivity,
          icon: 'fas fa-history',
          color: 'pink',
          trend: stats.trends?.activity || { change: 0, trend: 'stable', sparkline: [] }
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
   * Export dashboard reports
   */
  async exportReport(req, res) {
    try {
      const { type } = req.params;
      const validTypes = ['daily', 'weekly', 'monthly', 'quarterly'];
      
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid report type. Must be: daily, weekly, monthly, or quarterly'
        });
      }

      const reportData = await this.dashboardService.generateReportData(type, req.user);
      const exportService = require('../../shared/services/exportService');
      
      const buffer = exportService.generateExcel({
        title: `Dashboard ${type.charAt(0).toUpperCase() + type.slice(1)} Report`,
        data: reportData.data,
        metadata: {
          generatedBy: `${req.user.first_name} ${req.user.last_name}`,
          dateGenerated: new Date(),
          reportType: type,
          totalRecords: reportData.data.length
        }
      });

      const filename = `dashboard-${type}-report-${new Date().toISOString().split('T')[0]}.xlsx`;
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
      
    } catch (error) {
      console.error('Dashboard export error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to export dashboard report'
      });
    }
  }

  /**
   * Get actionable insights for dashboard
   */
  async getInsights(req, res) {
    try {
      const insights = await this.dashboardService.getActionableInsights(req.user);
      
      res.json({
        success: true,
        data: insights,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Dashboard insights error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve dashboard insights'
      });
    }
  }

  /**
   * Get enhanced activity stream
   */
  async getActivityStream(req, res) {
    try {
      const { limit = 10, offset = 0 } = req.query;
      const activities = await this.dashboardService.getEnhancedActivityStream(
        parseInt(limit),
        parseInt(offset),
        req.user
      );
      
      res.json({
        success: true,
        data: activities,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: activities.length === parseInt(limit)
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Dashboard activity stream error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve activity stream'
      });
    }
  }

  /**
   * Get system alerts and notifications
   */
  async getSystemAlerts(req, res) {
    try {
      const alerts = await this.dashboardService.getSystemAlerts(req.user);
      
      res.json({
        success: true,
        data: alerts,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Dashboard system alerts error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve system alerts'
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