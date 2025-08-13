// Catalog data models

class ERPProduct {
  constructor(data = {}) {
    this.sku = data.sku;
    this.area = data.area;
    this.stock = data.stock || 0;
    this.description = data.description;
    this.category = data.category;
  }
}

class PIMProduct {
  constructor(data = {}) {
    this.sku = data.sku;
    this.title = data.title;
    this.description = data.description;
    this.category = data.category;
    this.active = data.active || false;
  }
}

const ProductStatus = {
  NEW_PRODUCT: 'new_product',
  OBSOLETE_PRODUCT: 'obsolete_product',  
  AVAILABLE_PRODUCT: 'available_product',
  DISCONTINUED: 'discontinued'
};

class ComparisonResult {
  constructor(data = {}) {
    this.erpProduct = data.erpProduct;
    this.pimProduct = data.pimProduct;
    this.status = data.status;
    this.category = data.category;
    this.area = data.area;
    this.reason = data.reason;
  }
}

class CategoryConfig {
  constructor(area, threshold = 10) {
    this.area = area;
    this.threshold = threshold;
  }
}

// Default category configurations
const DEFAULT_CATEGORY_CONFIGS = [
  new CategoryConfig('ELECTRODOMESTICOS', 5),
  new CategoryConfig('FERRETERIA Y AUTOMOTORES', 10),
  new CategoryConfig('SUPERMERCADO', 15),
  new CategoryConfig('MODA', 5),
  new CategoryConfig('DEPORTES', 8),
  new CategoryConfig('JUGUETES', 10),
  new CategoryConfig('HOGAR', 12),
  new CategoryConfig('LIBRERIA', 20),
  new CategoryConfig('AUTOMOTRIZ', 3),
  new CategoryConfig('OFICINA', 15),
  new CategoryConfig('DEFAULT', 10)
];

class CatalogStatusResponse {
  constructor(data = {}) {
    this.totalProducts = data.totalProducts || 0;
    this.newProducts = data.newProducts || [];
    this.obsoleteProducts = data.obsoleteProducts || [];
    this.availableProducts = data.availableProducts || [];
    this.summary = data.summary || {
      newCount: 0,
      obsoleteCount: 0,
      availableCount: 0,
      totalProcessed: 0
    };
    this.pagination = data.pagination || {
      page: 1,
      limit: 1000,
      total: 0,
      totalPages: 0
    };
    this.processingTime = data.processingTime || 0;
  }
}

class SKUResponse {
  constructor(sku, title) {
    this.sku = sku;
    this.title = title;
  }
}

class CategorySummary {
  constructor(data = {}) {
    this.area = data.area;
    this.totalProducts = data.totalProducts || 0;
    this.newProducts = data.newProducts || 0;
    this.obsoleteProducts = data.obsoleteProducts || 0;
    this.availableProducts = data.availableProducts || 0;
    this.threshold = data.threshold || 10;
  }
}

class CategoryBasedResponse {
  constructor(data = {}) {
    this.categories = data.categories || [];
    this.overallSummary = data.overallSummary || {
      totalCategories: 0,
      totalProducts: 0,
      totalNew: 0,
      totalObsolete: 0,
      totalAvailable: 0
    };
    this.processingTime = data.processingTime || 0;
    this.timestamp = data.timestamp || new Date().toISOString();
  }
}

module.exports = {
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
};