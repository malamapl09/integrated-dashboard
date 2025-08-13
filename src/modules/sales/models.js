// Sales data models and validation

const TimeRangeEnum = {
  TODAY: 'today',
  LAST_7_DAYS: '7days',
  LAST_30_DAYS: '30days',
  THIS_MONTH: 'thisMonth',
  LAST_3_MONTHS: '3months',
  CUSTOM: 'custom'
};

const ViewModeEnum = {
  HOURLY: 'hourly',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly'
};

class SalesFilters {
  constructor(data = {}) {
    // Time filtering
    this.timeRange = data.timeRange || TimeRangeEnum.LAST_30_DAYS;
    this.dateFrom = data.dateFrom || null;
    this.dateTo = data.dateTo || null;
    
    // Store/Branch filtering
    this.stores = data.stores || null; // TIENDA values
    
    // Status filtering
    this.orderStatus = data.orderStatus || null; // ESTATUS values
    this.deliveryStatus = data.deliveryStatus || null; // ESTATUS_DELIV values
    
    // Platform filtering
    this.platforms = data.platforms || null; // PLATAFORMAS values
    
    // Department filtering (from WEB_FACTURAS)
    this.departments = data.departments || null; // DEPTO values
    
    // View mode for aggregation
    this.viewMode = data.viewMode || ViewModeEnum.DAILY;
    
    // Amount filtering
    this.minAmount = data.minAmount || null;
    this.maxAmount = data.maxAmount || null;
  }

  validate() {
    const errors = [];
    
    if (this.timeRange === TimeRangeEnum.CUSTOM) {
      if (!this.dateFrom || !this.dateTo) {
        errors.push('Custom time range requires both dateFrom and dateTo');
      }
      if (this.dateFrom && this.dateTo && new Date(this.dateFrom) > new Date(this.dateTo)) {
        errors.push('dateFrom must be before dateTo');
      }
    }
    
    if (this.minAmount !== null && this.maxAmount !== null && this.minAmount > this.maxAmount) {
      errors.push('minAmount must be less than maxAmount');
    }
    
    return errors;
  }
}

class SalesMetrics {
  constructor(data = {}) {
    this.totalRevenue = data.totalRevenue || 0;
    this.totalOrders = data.totalOrders || 0;
    this.avgOrderValue = data.avgOrderValue || 0;
    this.totalTax = data.totalTax || 0;
    this.totalDiscounts = data.totalDiscounts || 0;
    
    // Growth comparison
    this.revenueGrowthPercent = data.revenueGrowthPercent || null;
    this.ordersGrowthPercent = data.ordersGrowthPercent || null;
    
    // Time period info
    this.periodStart = data.periodStart || null;
    this.periodEnd = data.periodEnd || null;
  }
}

class DailySalesTrend {
  constructor(data = {}) {
    this.date = data.date;
    this.ordersCount = data.ordersCount || 0;
    this.revenue = data.revenue || 0;
    this.avgOrderValue = data.avgOrderValue || 0;
  }
}

class StorePerformance {
  constructor(data = {}) {
    this.storeCode = data.storeCode;
    this.ordersCount = data.ordersCount || 0;
    this.revenue = data.revenue || 0;
    this.avgOrderValue = data.avgOrderValue || 0;
    this.totalDiscounts = data.totalDiscounts || 0;
    this.revenuePercent = data.revenuePercent || 0;
  }
}

class HourlyPattern {
  constructor(data = {}) {
    this.hour = data.hour;
    this.ordersCount = data.ordersCount || 0;
    this.revenue = data.revenue || 0;
  }
}

class TopProduct {
  constructor(data = {}) {
    this.ean = data.ean;
    this.description = data.description;
    this.totalQuantity = data.totalQuantity || 0;
    this.totalRevenue = data.totalRevenue || 0;
    this.ordersCount = data.ordersCount || 0;
    this.avgPrice = data.avgPrice || 0;
  }
}

class RecentOrder {
  constructor(data = {}) {
    this.orden = data.orden;
    this.fechaRegistro = data.fechaRegistro;
    this.nombreCompleto = data.nombreCompleto;
    this.ciudad = data.ciudad;
    this.total = data.total || 0;
    this.estatus = data.estatus;
    this.tienda = data.tienda;
    this.plataformas = data.plataformas || null;
  }
}

class SalesDashboardData {
  constructor(data = {}) {
    this.metrics = data.metrics || new SalesMetrics();
    this.dailyTrends = data.dailyTrends || [];
    this.storePerformance = data.storePerformance || [];
    this.hourlyPatterns = data.hourlyPatterns || [];
    this.topProducts = data.topProducts || [];
    this.recentOrders = data.recentOrders || [];
    
    // Filter metadata
    this.appliedFilters = data.appliedFilters || new SalesFilters();
    this.availableStores = data.availableStores || [];
    this.availablePlatforms = data.availablePlatforms || [];
    this.availableDepartments = data.availableDepartments || [];
  }
}

module.exports = {
  TimeRangeEnum,
  ViewModeEnum,
  SalesFilters,
  SalesMetrics,
  DailySalesTrend,
  StorePerformance,
  HourlyPattern,
  TopProduct,
  RecentOrder,
  SalesDashboardData
};