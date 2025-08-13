const SalesService = require('./salesService');
const { SalesFilters } = require('./models');

class SalesController {
  constructor() {
    this.salesService = new SalesService();
  }

  /**
   * Get complete sales dashboard data
   */
  async getDashboard(req, res) {
    try {
      const filters = new SalesFilters(req.query);
      const dashboardData = await this.salesService.getDashboardData(filters);
      
      res.json({
        success: true,
        data: dashboardData
      });
    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch dashboard data'
      });
    }
  }

  /**
   * Get sales metrics only
   */
  async getMetrics(req, res) {
    try {
      const filters = new SalesFilters(req.query);
      const metrics = await this.salesService.getSalesMetrics(filters);
      
      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      console.error('Metrics error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch metrics'
      });
    }
  }

  /**
   * Get daily sales trends
   */
  async getTrends(req, res) {
    try {
      const filters = new SalesFilters(req.query);
      const trends = await this.salesService.getDailyTrends(filters);
      
      res.json({
        success: true,
        data: trends
      });
    } catch (error) {
      console.error('Trends error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch trends'
      });
    }
  }

  /**
   * Get store performance data
   */
  async getStorePerformance(req, res) {
    try {
      const filters = new SalesFilters(req.query);
      const storePerformance = await this.salesService.getStorePerformance(filters);
      
      res.json({
        success: true,
        data: storePerformance
      });
    } catch (error) {
      console.error('Store performance error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch store performance'
      });
    }
  }

  /**
   * Get hourly order patterns
   */
  async getHourlyPatterns(req, res) {
    try {
      const filters = new SalesFilters(req.query);
      const patterns = await this.salesService.getHourlyPatterns(filters);
      
      res.json({
        success: true,
        data: patterns
      });
    } catch (error) {
      console.error('Hourly patterns error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch hourly patterns'
      });
    }
  }

  /**
   * Get top selling products
   */
  async getTopProducts(req, res) {
    try {
      const filters = new SalesFilters(req.query);
      const limit = parseInt(req.query.limit) || 10;
      const topProducts = await this.salesService.getTopProducts(filters, limit);
      
      res.json({
        success: true,
        data: topProducts
      });
    } catch (error) {
      console.error('Top products error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch top products'
      });
    }
  }

  /**
   * Get recent orders
   */
  async getRecentOrders(req, res) {
    try {
      const filters = new SalesFilters(req.query);
      const limit = parseInt(req.query.limit) || 20;
      const recentOrders = await this.salesService.getRecentOrders(filters, limit);
      
      res.json({
        success: true,
        data: recentOrders
      });
    } catch (error) {
      console.error('Recent orders error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch recent orders'
      });
    }
  }

  /**
   * Get available filter options
   */
  async getFilterOptions(req, res) {
    try {
      const filterOptions = await this.salesService.getFilterOptions();
      
      res.json({
        success: true,
        data: filterOptions
      });
    } catch (error) {
      console.error('Filter options error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch filter options'
      });
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(req, res) {
    try {
      // Simple health check - verify database connection
      await this.salesService.getFilterOptions();
      
      res.json({
        success: true,
        message: 'Sales service is healthy',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Health check error:', error);
      res.status(503).json({
        success: false,
        message: 'Sales service is unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = SalesController;