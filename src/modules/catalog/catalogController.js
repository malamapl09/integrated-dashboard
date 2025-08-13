const CatalogService = require('./catalogService');

class CatalogController {
  constructor() {
    this.catalogService = new CatalogService();
  }

  /**
   * Health check endpoint
   */
  async ping(req, res) {
    try {
      const health = await this.catalogService.healthCheck();
      res.json(health);
    } catch (error) {
      console.error('Ping error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message || 'Catalog system health check failed'
      });
    }
  }

  /**
   * List all PIM SKUs with titles
   */
  async listPIMSkus(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 0;
      const skus = await this.catalogService.getPIMSkus(limit);
      
      res.json(skus);
    } catch (error) {
      console.error('List PIM SKUs error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch PIM SKUs'
      });
    }
  }

  /**
   * Compare ERP vs PIM data and return categorized results
   */
  async getCatalogStatus(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 1000;
      
      const status = await this.catalogService.compareERPvsPIM(page, limit);
      
      res.json(status);
    } catch (error) {
      console.error('Catalog status error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to compare ERP vs PIM data'
      });
    }
  }

  /**
   * Get category-based comparison
   */
  async getCategoryBasedStatus(req, res) {
    try {
      const categoryData = await this.catalogService.getCategoryBasedComparison();
      
      res.json(categoryData);
    } catch (error) {
      console.error('Category-based status error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to perform category-based comparison'
      });
    }
  }

  /**
   * Get list of available categories
   */
  async getCategories(req, res) {
    try {
      const categories = await this.catalogService.getCategories();
      
      res.json({
        success: true,
        data: categories
      });
    } catch (error) {
      console.error('Categories error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch categories'
      });
    }
  }

  /**
   * Get category summary statistics
   */
  async getCategorySummary(req, res) {
    try {
      const summary = await this.catalogService.getCategorySummary();
      
      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      console.error('Category summary error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch category summary'
      });
    }
  }
}

module.exports = CatalogController;