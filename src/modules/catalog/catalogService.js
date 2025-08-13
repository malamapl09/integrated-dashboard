const { database } = require('../../shared/database');
const {
  ERPProduct,
  PIMProduct,
  ProductStatus,
  ComparisonResult,
  CategoryConfig,
  DEFAULT_CATEGORY_CONFIGS,
  CatalogStatusResponse,
  SKUResponse,
  CategorySummary,
  CategoryBasedResponse
} = require('./models');

class CatalogService {
  constructor() {
    this.erpDb = database.mysql; // Using MySQL for now (should be Oracle in production)
    this.pimDb = database.mysql;
    this.categoryConfigs = new Map();
    
    // Initialize category configurations
    DEFAULT_CATEGORY_CONFIGS.forEach(config => {
      this.categoryConfigs.set(config.area.toUpperCase(), config.threshold);
    });
  }

  /**
   * Get threshold for a specific category area
   */
  getThreshold(area) {
    const areaKey = area ? area.toUpperCase() : 'DEFAULT';
    return this.categoryConfigs.get(areaKey) || this.categoryConfigs.get('DEFAULT') || 10;
  }

  /**
   * Get all PIM SKUs with optional limit
   */
  async getPIMSkus(limit = 0) {
    try {
      let query = 'SELECT sku, title FROM web_products WHERE sku IS NOT NULL AND borrado = 0';
      const params = [];
      
      if (limit > 0) {
        query += ' LIMIT ?';
        params.push(limit);
      }
      
      query += ' ORDER BY sku';
      
      const [results] = await this.pimDb.execute(query, params);
      
      return results.map(row => new SKUResponse(row.sku, row.title));
      
    } catch (error) {
      console.error('Error fetching PIM SKUs:', error);
      throw new Error('Failed to fetch PIM SKUs');
    }
  }

  /**
   * Get ERP products with stock information
   */
  async getERPProducts(limit = 0) {
    try {
      if (process.env.ORACLE_HOST && process.env.ORACLE_USER) {
        // Use Oracle ERP tables
        let query = `
          SELECT 
            DISTINCT m.MATNR as sku,
            m.MAKTX as description,
            COALESCE(m.MATKL, 'DEFAULT') as area,
            COALESCE(SUM(d.LABST), 0) as stock
          FROM INTRANET.MARA m
          LEFT JOIN INTRANET.MARD d ON m.MATNR = d.MATNR
          WHERE m.MATNR IS NOT NULL
          GROUP BY m.MATNR, m.MAKTX, m.MATKL
        `;
        const params = [];
        
        if (limit > 0) {
          query += ' FETCH FIRST ? ROWS ONLY';
          params.push(limit);
        }
        
        const [results] = await this.erpDb.execute(query, params);
        
        return results.map(row => new ERPProduct({
          sku: row.sku,
          description: row.description,
          area: row.area,
          stock: parseInt(row.stock) || 0
        }));
      } else {
        // Fallback to MySQL products (for testing without Oracle)
        let query = `
          SELECT 
            p.ean as sku,
            p.title as description,
            COALESCE(p.category, 'DEFAULT') as area,
            COALESCE(p.stock, 0) as stock
          FROM web_products p
          WHERE p.ean IS NOT NULL
        `;
        const params = [];
        
        if (limit > 0) {
          query += ' LIMIT ?';
          params.push(limit);
        }
        
        const [results] = await this.erpDb.execute(query, params);
        
        return results.map(row => new ERPProduct({
          sku: row.sku,
          description: row.description,
          area: row.area,
          stock: parseInt(row.stock) || 0
        }));
      }
      
    } catch (error) {
      console.error('Error fetching ERP products:', error);
      throw new Error('Failed to fetch ERP products');
    }
  }

  /**
   * Get PIM products
   */
  async getPIMProducts(limit = 0) {
    try {
      let query = `
        SELECT 
          sku,
          title,
          description,
          COALESCE(depto, 'DEFAULT') as category,
          CASE WHEN status_new = 1 THEN true ELSE false END as active
        FROM web_products
        WHERE sku IS NOT NULL AND borrado = 0
      `;
      const params = [];
      
      if (limit > 0) {
        query += ' LIMIT ?';
        params.push(limit);
      }
      
      const [results] = await this.pimDb.execute(query, params);
      
      return results.map(row => new PIMProduct({
        sku: row.sku,
        title: row.title,
        description: row.description,
        category: row.category,
        active: row.active
      }));
      
    } catch (error) {
      console.error('Error fetching PIM products:', error);
      throw new Error('Failed to fetch PIM products');
    }
  }

  /**
   * Compare ERP vs PIM products
   */
  async compareERPvsPIM(page = 1, limit = 1000) {
    const startTime = Date.now();
    
    try {
      // Calculate offset for pagination
      const offset = (page - 1) * limit;
      
      // Get ERP and PIM products with pagination
      const [erpProducts, pimProducts] = await Promise.all([
        this.getERPProducts(limit),
        this.getPIMProducts(limit)
      ]);
      
      // Create lookup maps
      const erpMap = new Map();
      const pimMap = new Map();
      
      erpProducts.forEach(product => erpMap.set(product.sku, product));
      pimProducts.forEach(product => pimMap.set(product.sku, product));
      
      const results = [];
      const newProducts = [];
      const obsoleteProducts = [];
      const availableProducts = [];
      
      // Check ERP products against PIM
      for (const erpProduct of erpProducts) {
        const pimProduct = pimMap.get(erpProduct.sku);
        const threshold = this.getThreshold(erpProduct.area);
        
        if (!pimProduct) {
          // Product exists in ERP but not in PIM
          if (erpProduct.stock >= threshold) {
            const result = new ComparisonResult({
              erpProduct,
              pimProduct: null,
              status: ProductStatus.NEW_PRODUCT,
              area: erpProduct.area,
              reason: `Stock ${erpProduct.stock} >= threshold ${threshold}`
            });
            results.push(result);
            newProducts.push(result);
          }
        } else {
          // Product exists in both systems
          if (erpProduct.stock >= threshold) {
            const result = new ComparisonResult({
              erpProduct,
              pimProduct,
              status: ProductStatus.AVAILABLE_PRODUCT,
              area: erpProduct.area,
              reason: `Stock ${erpProduct.stock} >= threshold ${threshold}`
            });
            results.push(result);
            availableProducts.push(result);
          } else {
            const result = new ComparisonResult({
              erpProduct,
              pimProduct,
              status: ProductStatus.OBSOLETE_PRODUCT,
              area: erpProduct.area,
              reason: `Stock ${erpProduct.stock} < threshold ${threshold}`
            });
            results.push(result);
            obsoleteProducts.push(result);
          }
        }
      }
      
      // Check for PIM-only products
      for (const pimProduct of pimProducts) {
        if (!erpMap.has(pimProduct.sku)) {
          const result = new ComparisonResult({
            erpProduct: null,
            pimProduct,
            status: ProductStatus.OBSOLETE_PRODUCT,
            area: 'UNKNOWN',
            reason: 'Product not found in ERP system'
          });
          results.push(result);
          obsoleteProducts.push(result);
        }
      }
      
      const processingTime = Date.now() - startTime;
      
      return new CatalogStatusResponse({
        totalProducts: results.length,
        newProducts,
        obsoleteProducts,
        availableProducts,
        summary: {
          newCount: newProducts.length,
          obsoleteCount: obsoleteProducts.length,
          availableCount: availableProducts.length,
          totalProcessed: results.length
        },
        pagination: {
          page,
          limit,
          total: results.length,
          totalPages: Math.ceil(results.length / limit)
        },
        processingTime
      });
      
    } catch (error) {
      console.error('Error comparing ERP vs PIM:', error);
      throw new Error('Failed to compare ERP vs PIM data');
    }
  }

  /**
   * Get category-based comparison
   */
  async getCategoryBasedComparison() {
    const startTime = Date.now();
    
    try {
      // Get all products
      const [erpProducts, pimProducts] = await Promise.all([
        this.getERPProducts(),
        this.getPIMProducts()
      ]);
      
      // Group by category/area
      const categoryStats = new Map();
      
      // Create lookup map for PIM products
      const pimMap = new Map();
      pimProducts.forEach(product => pimMap.set(product.sku, product));
      
      // Process ERP products by category
      for (const erpProduct of erpProducts) {
        const area = erpProduct.area || 'DEFAULT';
        const threshold = this.getThreshold(area);
        const pimProduct = pimMap.get(erpProduct.sku);
        
        if (!categoryStats.has(area)) {
          categoryStats.set(area, {
            area,
            totalProducts: 0,
            newProducts: 0,
            obsoleteProducts: 0,
            availableProducts: 0,
            threshold
          });
        }
        
        const stats = categoryStats.get(area);
        stats.totalProducts++;
        
        if (!pimProduct) {
          // New product
          if (erpProduct.stock >= threshold) {
            stats.newProducts++;
          } else {
            stats.obsoleteProducts++;
          }
        } else {
          // Existing product
          if (erpProduct.stock >= threshold) {
            stats.availableProducts++;
          } else {
            stats.obsoleteProducts++;
          }
        }
      }
      
      // Process PIM-only products
      for (const pimProduct of pimProducts) {
        if (!erpProducts.find(erp => erp.sku === pimProduct.sku)) {
          const area = pimProduct.category || 'DEFAULT';
          
          if (!categoryStats.has(area)) {
            categoryStats.set(area, {
              area,
              totalProducts: 0,
              newProducts: 0,
              obsoleteProducts: 0,
              availableProducts: 0,
              threshold: this.getThreshold(area)
            });
          }
          
          const stats = categoryStats.get(area);
          stats.totalProducts++;
          stats.obsoleteProducts++;
        }
      }
      
      const categories = Array.from(categoryStats.values()).map(stats => new CategorySummary(stats));
      
      const overallSummary = {
        totalCategories: categories.length,
        totalProducts: categories.reduce((sum, cat) => sum + cat.totalProducts, 0),
        totalNew: categories.reduce((sum, cat) => sum + cat.newProducts, 0),
        totalObsolete: categories.reduce((sum, cat) => sum + cat.obsoleteProducts, 0),
        totalAvailable: categories.reduce((sum, cat) => sum + cat.availableProducts, 0)
      };
      
      const processingTime = Date.now() - startTime;
      
      return new CategoryBasedResponse({
        categories,
        overallSummary,
        processingTime,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error in category-based comparison:', error);
      throw new Error('Failed to perform category-based comparison');
    }
  }

  /**
   * Get available categories
   */
  async getCategories() {
    try {
      const [results] = await this.pimDb.execute(
        'SELECT DISTINCT depto FROM web_products WHERE depto IS NOT NULL AND borrado = 0 ORDER BY depto'
      );
      
      return results.map(row => row.depto);
      
    } catch (error) {
      console.error('Error fetching categories:', error);
      return [];
    }
  }

  /**
   * Get category summary statistics
   */
  async getCategorySummary() {
    try {
      const [results] = await this.pimDb.execute(`
        SELECT 
          COALESCE(depto, 'DEFAULT') as category,
          COUNT(*) as total_products,
          SUM(CASE WHEN status_new = 1 THEN 1 ELSE 0 END) as active_products,
          SUM(CASE WHEN without_stock = 0 THEN 1 ELSE 0 END) as in_stock_products
        FROM web_products 
        WHERE borrado = 0
        GROUP BY depto 
        ORDER BY total_products DESC
      `);
      
      return results.map(row => ({
        category: row.category,
        totalProducts: parseInt(row.total_products) || 0,
        activeProducts: parseInt(row.active_products) || 0,
        inStockProducts: parseInt(row.in_stock_products) || 0,
        threshold: this.getThreshold(row.category)
      }));
      
    } catch (error) {
      console.error('Error fetching category summary:', error);
      throw new Error('Failed to fetch category summary');
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Test database connections
      const [pimTest] = await this.pimDb.execute('SELECT 1 as test');
      const [erpTest] = await this.erpDb.execute('SELECT 1 as test');
      
      return {
        status: 'ok',
        message: 'Catalog system is live',
        timestamp: new Date().toISOString(),
        databases: {
          pim: pimTest[0].test === 1 ? 'connected' : 'error',
          erp: erpTest[0].test === 1 ? 'connected' : 'error'
        }
      };
      
    } catch (error) {
      console.error('Health check failed:', error);
      throw new Error('Catalog system health check failed');
    }
  }
}

module.exports = CatalogService;