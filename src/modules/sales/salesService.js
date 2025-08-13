const { database } = require('../../shared/database');
const moment = require('moment');
const {
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
} = require('./models');

class SalesService {
  constructor() {
    this.mysqlDb = database.mysql; // For Shopify orders fallback
    this.oracleDb = database.oracle; // For ERP data
    // Check if Oracle is actually available, not just configured
    this.useOracle = this.oracleDb.isAvailable();
  }

  /**
   * Build date range from filters
   */
  _buildDateFilter(filters) {
    if (filters.timeRange === TimeRangeEnum.CUSTOM && filters.dateFrom && filters.dateTo) {
      return { dateFrom: filters.dateFrom, dateTo: filters.dateTo };
    }
    
    const today = moment();
    
    switch (filters.timeRange) {
      case TimeRangeEnum.TODAY:
        return { 
          dateFrom: today.format('YYYY-MM-DD'), 
          dateTo: today.format('YYYY-MM-DD') 
        };
      case TimeRangeEnum.LAST_7_DAYS:
        return { 
          dateFrom: today.subtract(7, 'days').format('YYYY-MM-DD'), 
          dateTo: moment().format('YYYY-MM-DD') 
        };
      case TimeRangeEnum.LAST_30_DAYS:
        return { 
          dateFrom: today.subtract(30, 'days').format('YYYY-MM-DD'), 
          dateTo: moment().format('YYYY-MM-DD') 
        };
      case TimeRangeEnum.THIS_MONTH:
        return { 
          dateFrom: moment().startOf('month').format('YYYY-MM-DD'), 
          dateTo: moment().format('YYYY-MM-DD') 
        };
      case TimeRangeEnum.LAST_3_MONTHS:
        return { 
          dateFrom: today.subtract(90, 'days').format('YYYY-MM-DD'), 
          dateTo: moment().format('YYYY-MM-DD') 
        };
      default:
        return { 
          dateFrom: today.subtract(30, 'days').format('YYYY-MM-DD'), 
          dateTo: moment().format('YYYY-MM-DD') 
        };
    }
  }

  /**
   * Build WHERE clause for Oracle ERP queries
   */
  _buildOracleWhereClause(filters, dateFrom, dateTo) {
    const conditions = ["o.FECHA_REGISTRO BETWEEN TO_DATE(?, 'YYYY-MM-DD') AND TO_DATE(?, 'YYYY-MM-DD')"];
    const params = [dateFrom, dateTo];
    let needsFacturaJoin = false;
    
    if (filters.stores && filters.stores.length > 0) {
      const placeholders = filters.stores.map(() => '?').join(',');
      conditions.push(`o.TIENDA IN (${placeholders})`);
      params.push(...filters.stores);
    }
    
    if (filters.orderStatus && filters.orderStatus.length > 0) {
      const placeholders = filters.orderStatus.map(() => '?').join(',');
      conditions.push(`o.ESTATUS IN (${placeholders})`);
      params.push(...filters.orderStatus);
    }
    
    if (filters.deliveryStatus && filters.deliveryStatus.length > 0) {
      const placeholders = filters.deliveryStatus.map(() => '?').join(',');
      conditions.push(`o.ESTATUS_DELIV IN (${placeholders})`);
      params.push(...filters.deliveryStatus);
    }
    
    if (filters.platforms && filters.platforms.length > 0) {
      const placeholders = filters.platforms.map(() => '?').join(',');
      conditions.push(`o.PLATAFORMAS IN (${placeholders})`);
      params.push(...filters.platforms);
    }
    
    if (filters.departments && filters.departments.length > 0) {
      const placeholders = filters.departments.map(() => '?').join(',');
      conditions.push(`f.DEPTO IN (${placeholders})`);
      params.push(...filters.departments);
      needsFacturaJoin = true;
    }
    
    if (filters.minAmount !== null) {
      conditions.push('o.TOTAL >= ?');
      params.push(filters.minAmount);
    }
    
    if (filters.maxAmount !== null) {
      conditions.push('o.TOTAL <= ?');
      params.push(filters.maxAmount);
    }
    
    return {
      whereClause: conditions.join(' AND '),
      params,
      needsFacturaJoin
    };
  }

  /**
   * Build WHERE clause for MySQL Shopify orders (fallback)
   */
  _buildMySQLWhereClause(filters, dateFrom, dateTo) {
    const conditions = ['DATE(o.order_created) BETWEEN ? AND ?'];
    const params = [dateFrom, dateTo];
    
    if (filters.stores && filters.stores.length > 0) {
      const placeholders = filters.stores.map(() => '?').join(',');
      conditions.push(`o.shop IN (${placeholders})`);
      params.push(...filters.stores);
    }
    
    if (filters.minAmount !== null) {
      conditions.push('o.total_price >= ?');
      params.push(filters.minAmount);
    }
    
    if (filters.maxAmount !== null) {
      conditions.push('o.total_price <= ?');
      params.push(filters.maxAmount);
    }
    
    // Status filter for Shopify orders
    if (filters.orderStatus && filters.orderStatus.includes('paid')) {
      conditions.push("o.status = 'paid'");
    }
    
    return {
      whereClause: conditions.join(' AND '),
      params
    };
  }

  /**
   * Get sales metrics using Oracle ERP data or MySQL fallback
   */
  async getSalesMetrics(filters) {
    try {
      if (this.useOracle) {
        return await this._getOracleSalesMetrics(filters);
      } else {
        return await this._getMySQLSalesMetrics(filters);
      }
    } catch (error) {
      console.error('Error fetching sales metrics:', error);
      throw new Error('Failed to fetch sales metrics');
    }
  }

  /**
   * Get sales metrics from Oracle ERP
   */
  async _getOracleSalesMetrics(filters) {
    const { dateFrom, dateTo } = this._buildDateFilter(filters);
    const { whereClause, params, needsFacturaJoin } = this._buildOracleWhereClause(filters, dateFrom, dateTo);
    
    let fromClause = 'INTRANET.WEB_ORDENES o';
    if (needsFacturaJoin) {
      fromClause += ' JOIN INTRANET.WEB_FACTURAS f ON o.ORDEN = f.ORDEN';
    }
    
    const currentQuery = `
      SELECT 
        COUNT(DISTINCT o.ORDEN) as total_orders,
        COALESCE(SUM(o.TOTAL), 0) as total_revenue,
        COALESCE(AVG(o.TOTAL), 0) as avg_order_value,
        COALESCE(SUM(o.ITBIS), 0) as total_tax,
        COALESCE(SUM(o.TOTAL_DESCUENTO), 0) as total_discounts
      FROM ${fromClause}
      WHERE ${whereClause}
    `;
    
    const [currentResult] = await this.oracleDb.execute(currentQuery, params);
    const current = currentResult[0];
    
    // Calculate growth (simplified for now)
    const revenueGrowthPercent = null; // Would need previous period calculation
    const ordersGrowthPercent = null;
    
    return new SalesMetrics({
      totalRevenue: parseFloat(current.total_revenue) || 0,
      totalOrders: parseInt(current.total_orders) || 0,
      avgOrderValue: parseFloat(current.avg_order_value) || 0,
      totalTax: parseFloat(current.total_tax) || 0,
      totalDiscounts: parseFloat(current.total_discounts) || 0,
      revenueGrowthPercent,
      ordersGrowthPercent,
      periodStart: dateFrom,
      periodEnd: dateTo
    });
  }

  /**
   * Get sales metrics from MySQL Shopify orders (fallback)
   */
  async _getMySQLSalesMetrics(filters) {
    const { dateFrom, dateTo } = this._buildDateFilter(filters);
    const { whereClause, params } = this._buildMySQLWhereClause(filters, dateFrom, dateTo);
    
    const currentQuery = `
      SELECT 
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(o.total_price), 0) as total_revenue,
        COALESCE(AVG(o.total_price), 0) as avg_order_value,
        COALESCE(SUM(o.total_discounts), 0) as total_discounts
      FROM web_orders o
      WHERE ${whereClause} AND o.order_complete = 1
    `;
    
    const [currentResult] = await this.mysqlDb.execute(currentQuery, params);
    const current = currentResult[0];
    
    return new SalesMetrics({
      totalRevenue: parseFloat(current.total_revenue) || 0,
      totalOrders: parseInt(current.total_orders) || 0,
      avgOrderValue: parseFloat(current.avg_order_value) || 0,
      totalTax: 0, // Not available in Shopify data
      totalDiscounts: parseFloat(current.total_discounts) || 0,
      revenueGrowthPercent: null,
      ordersGrowthPercent: null,
      periodStart: dateFrom,
      periodEnd: dateTo
    });
  }

  /**
   * Get daily sales trends
   */
  async getDailyTrends(filters) {
    try {
      if (this.useOracle) {
        return await this._getOracleDailyTrends(filters);
      } else {
        return await this._getMySQLDailyTrends(filters);
      }
    } catch (error) {
      console.error('Error fetching daily trends:', error);
      throw new Error('Failed to fetch daily trends');
    }
  }

  async _getOracleDailyTrends(filters) {
    const { dateFrom, dateTo } = this._buildDateFilter(filters);
    const { whereClause, params } = this._buildOracleWhereClause(filters, dateFrom, dateTo);
    
    const query = `
      SELECT 
        TO_CHAR(o.FECHA_REGISTRO, 'YYYY-MM-DD') as date,
        COUNT(DISTINCT o.ORDEN) as orders_count,
        COALESCE(SUM(o.TOTAL), 0) as revenue,
        COALESCE(AVG(o.TOTAL), 0) as avg_order_value
      FROM INTRANET.WEB_ORDENES o
      WHERE ${whereClause}
      GROUP BY TO_CHAR(o.FECHA_REGISTRO, 'YYYY-MM-DD')
      ORDER BY date ASC
    `;
    
    const [results] = await this.oracleDb.execute(query, params);
    
    return results.map(row => new DailySalesTrend({
      date: row.date,
      ordersCount: parseInt(row.orders_count) || 0,
      revenue: parseFloat(row.revenue) || 0,
      avgOrderValue: parseFloat(row.avg_order_value) || 0
    }));
  }

  async _getMySQLDailyTrends(filters) {
    const { dateFrom, dateTo } = this._buildDateFilter(filters);
    const { whereClause, params } = this._buildMySQLWhereClause(filters, dateFrom, dateTo);
    
    const query = `
      SELECT 
        DATE(o.order_created) as date,
        COUNT(DISTINCT o.id) as orders_count,
        COALESCE(SUM(o.total_price), 0) as revenue,
        COALESCE(AVG(o.total_price), 0) as avg_order_value
      FROM web_orders o
      WHERE ${whereClause} AND o.order_complete = 1
      GROUP BY DATE(o.order_created)
      ORDER BY date ASC
    `;
    
    const [results] = await this.mysqlDb.execute(query, params);
    
    return results.map(row => new DailySalesTrend({
      date: row.date,
      ordersCount: parseInt(row.orders_count) || 0,
      revenue: parseFloat(row.revenue) || 0,
      avgOrderValue: parseFloat(row.avg_order_value) || 0
    }));
  }

  /**
   * Get store performance data
   */
  async getStorePerformance(filters) {
    try {
      if (this.useOracle) {
        return await this._getOracleStorePerformance(filters);
      } else {
        return await this._getMySQLStorePerformance(filters);
      }
    } catch (error) {
      console.error('Error fetching store performance:', error);
      throw new Error('Failed to fetch store performance');
    }
  }

  async _getOracleStorePerformance(filters) {
    const { dateFrom, dateTo } = this._buildDateFilter(filters);
    const { whereClause, params } = this._buildOracleWhereClause(filters, dateFrom, dateTo);
    
    // Get total revenue for percentage calculation
    const totalRevenueQuery = `
      SELECT COALESCE(SUM(o.TOTAL), 0) as total_revenue
      FROM INTRANET.WEB_ORDENES o
      WHERE ${whereClause}
    `;
    
    const [totalResult] = await this.oracleDb.execute(totalRevenueQuery, params);
    const totalRevenue = parseFloat(totalResult[0].total_revenue) || 1;
    
    const query = `
      SELECT 
        o.TIENDA as store_code,
        COUNT(DISTINCT o.ORDEN) as orders_count,
        COALESCE(SUM(o.TOTAL), 0) as revenue,
        COALESCE(AVG(o.TOTAL), 0) as avg_order_value,
        COALESCE(SUM(o.TOTAL_DESCUENTO), 0) as total_discounts
      FROM INTRANET.WEB_ORDENES o
      WHERE ${whereClause}
      GROUP BY o.TIENDA
      ORDER BY revenue DESC
    `;
    
    const [results] = await this.oracleDb.execute(query, params);
    
    return results.map(row => new StorePerformance({
      storeCode: row.store_code,
      ordersCount: parseInt(row.orders_count) || 0,
      revenue: parseFloat(row.revenue) || 0,
      avgOrderValue: parseFloat(row.avg_order_value) || 0,
      totalDiscounts: parseFloat(row.total_discounts) || 0,
      revenuePercent: totalRevenue > 0 ? parseFloat(((parseFloat(row.revenue) / totalRevenue) * 100).toFixed(2)) : 0
    }));
  }

  async _getMySQLStorePerformance(filters) {
    const { dateFrom, dateTo } = this._buildDateFilter(filters);
    const { whereClause, params } = this._buildMySQLWhereClause(filters, dateFrom, dateTo);
    
    const totalRevenueQuery = `
      SELECT COALESCE(SUM(o.total_price), 0) as total_revenue
      FROM web_orders o
      WHERE ${whereClause} AND o.order_complete = 1
    `;
    
    const [totalResult] = await this.mysqlDb.execute(totalRevenueQuery, params);
    const totalRevenue = parseFloat(totalResult[0].total_revenue) || 1;
    
    const query = `
      SELECT 
        o.shop as store_code,
        COUNT(DISTINCT o.id) as orders_count,
        COALESCE(SUM(o.total_price), 0) as revenue,
        COALESCE(AVG(o.total_price), 0) as avg_order_value,
        COALESCE(SUM(o.total_discounts), 0) as total_discounts
      FROM web_orders o
      WHERE ${whereClause} AND o.order_complete = 1
      GROUP BY o.shop
      ORDER BY revenue DESC
    `;
    
    const [results] = await this.mysqlDb.execute(query, params);
    
    return results.map(row => new StorePerformance({
      storeCode: row.store_code,
      ordersCount: parseInt(row.orders_count) || 0,
      revenue: parseFloat(row.revenue) || 0,
      avgOrderValue: parseFloat(row.avg_order_value) || 0,
      totalDiscounts: parseFloat(row.total_discounts) || 0,
      revenuePercent: totalRevenue > 0 ? parseFloat(((parseFloat(row.revenue) / totalRevenue) * 100).toFixed(2)) : 0
    }));
  }

  /**
   * Get top selling products
   */
  async getTopProducts(filters, limit = 10) {
    try {
      if (this.useOracle) {
        return await this._getOracleTopProducts(filters, limit);
      } else {
        return await this._getMySQLTopProducts(filters, limit);
      }
    } catch (error) {
      console.error('Error fetching top products:', error);
      throw new Error('Failed to fetch top products');
    }
  }

  async _getOracleTopProducts(filters, limit) {
    const { dateFrom, dateTo } = this._buildDateFilter(filters);
    const { whereClause, params } = this._buildOracleWhereClause(filters, dateFrom, dateTo);
    
    const query = `
      SELECT 
        a.EAN as ean,
        a.DESCRIPCION as description,
        SUM(a.CANT) as total_quantity,
        SUM(a.TOTAL) as total_revenue,
        COUNT(DISTINCT a.ORDEN) as orders_count,
        AVG(a.PRECIO) as avg_price
      FROM INTRANET.WEB_ORDENES o
      JOIN INTRANET.WEB_ARTICULOS a ON o.ORDEN = a.ORDEN
      WHERE ${whereClause}
      GROUP BY a.EAN, a.DESCRIPCION
      ORDER BY total_revenue DESC
      FETCH FIRST ? ROWS ONLY
    `;
    
    const [results] = await this.oracleDb.execute(query, [...params, limit]);
    
    return results.map(row => new TopProduct({
      ean: row.ean,
      description: row.description,
      totalQuantity: parseFloat(row.total_quantity) || 0,
      totalRevenue: parseFloat(row.total_revenue) || 0,
      ordersCount: parseInt(row.orders_count) || 0,
      avgPrice: parseFloat(row.avg_price) || 0
    }));
  }

  async _getMySQLTopProducts(filters, limit) {
    const { dateFrom, dateTo } = this._buildDateFilter(filters);
    const { whereClause, params } = this._buildMySQLWhereClause(filters, dateFrom, dateTo);
    
    const query = `
      SELECT 
        l.sku as ean,
        l.title as description,
        SUM(l.quantity) as total_quantity,
        SUM(l.price * l.quantity) as total_revenue,
        COUNT(DISTINCT l.order_id) as orders_count,
        AVG(l.price) as avg_price
      FROM web_orders o
      JOIN web_line_items l ON o.id = l.order_id
      WHERE ${whereClause.replace(/o\./g, 'o.')} AND o.order_complete = 1
      GROUP BY l.sku, l.title
      ORDER BY total_revenue DESC
      LIMIT ?
    `;
    
    const [results] = await this.mysqlDb.execute(query, [...params, limit]);
    
    return results.map(row => new TopProduct({
      ean: row.ean,
      description: row.description,
      totalQuantity: parseFloat(row.total_quantity) || 0,
      totalRevenue: parseFloat(row.total_revenue) || 0,
      ordersCount: parseInt(row.orders_count) || 0,
      avgPrice: parseFloat(row.avg_price) || 0
    }));
  }

  /**
   * Get recent orders
   */
  async getRecentOrders(filters, limit = 20) {
    try {
      if (this.useOracle) {
        return await this._getOracleRecentOrders(filters, limit);
      } else {
        return await this._getMySQLRecentOrders(filters, limit);
      }
    } catch (error) {
      console.error('Error fetching recent orders:', error);
      throw new Error('Failed to fetch recent orders');
    }
  }

  async _getOracleRecentOrders(filters, limit) {
    const { dateFrom, dateTo } = this._buildDateFilter(filters);
    const { whereClause, params } = this._buildOracleWhereClause(filters, dateFrom, dateTo);
    
    const query = `
      SELECT 
        o.ORDEN as orden,
        o.FECHA_REGISTRO as fecha_registro,
        CONCAT(o.NOMBRE, ' ', o.APELLIDOS) as nombre_completo,
        o.CIUDAD as ciudad,
        o.TOTAL as total,
        o.ESTATUS as estatus,
        o.TIENDA as tienda,
        o.PLATAFORMAS as plataformas
      FROM INTRANET.WEB_ORDENES o
      WHERE ${whereClause}
      ORDER BY o.FECHA_REGISTRO DESC
      FETCH FIRST ? ROWS ONLY
    `;
    
    const [results] = await this.oracleDb.execute(query, [...params, limit]);
    
    return results.map(row => new RecentOrder({
      orden: row.orden,
      fechaRegistro: row.fecha_registro,
      nombreCompleto: row.nombre_completo,
      ciudad: row.ciudad,
      total: parseFloat(row.total) || 0,
      estatus: parseInt(row.estatus),
      tienda: row.tienda,
      plataformas: row.plataformas
    }));
  }

  async _getMySQLRecentOrders(filters, limit) {
    const { dateFrom, dateTo } = this._buildDateFilter(filters);
    const { whereClause, params } = this._buildMySQLWhereClause(filters, dateFrom, dateTo);
    
    const query = `
      SELECT 
        o.id as orden,
        o.order_created as fecha_registro,
        CONCAT(o.first_name, ' ', o.last_name) as nombre_completo,
        o.city as ciudad,
        o.total_price as total,
        o.status as estatus,
        o.shop as tienda,
        o.gateway as plataformas
      FROM web_orders o
      WHERE ${whereClause} AND o.order_complete = 1
      ORDER BY o.order_created DESC
      LIMIT ?
    `;
    
    const [results] = await this.mysqlDb.execute(query, [...params, limit]);
    
    return results.map(row => new RecentOrder({
      orden: row.orden,
      fechaRegistro: row.fecha_registro,
      nombreCompleto: row.nombre_completo,
      ciudad: row.ciudad,
      total: parseFloat(row.total) || 0,
      estatus: row.estatus,
      tienda: row.tienda,
      plataformas: row.plataformas
    }));
  }

  /**
   * Get available filter options
   */
  async getFilterOptions() {
    try {
      if (this.useOracle) {
        return await this._getOracleFilterOptions();
      } else {
        return await this._getMySQLFilterOptions();
      }
    } catch (error) {
      console.error('Error fetching filter options:', error);
      return {
        availableStores: [],
        availablePlatforms: [],
        availableDepartments: []
      };
    }
  }

  async _getOracleFilterOptions() {
    const [storesResult] = await this.oracleDb.execute(
      'SELECT DISTINCT TIENDA FROM INTRANET.WEB_ORDENES WHERE TIENDA IS NOT NULL ORDER BY TIENDA'
    );
    
    const [platformsResult] = await this.oracleDb.execute(
      'SELECT DISTINCT PLATAFORMAS FROM INTRANET.WEB_ORDENES WHERE PLATAFORMAS IS NOT NULL ORDER BY PLATAFORMAS'
    );
    
    const [departmentsResult] = await this.oracleDb.execute(
      'SELECT DISTINCT DEPTO FROM INTRANET.WEB_FACTURAS WHERE DEPTO IS NOT NULL ORDER BY DEPTO'
    );
    
    return {
      availableStores: storesResult.map(row => row.TIENDA),
      availablePlatforms: platformsResult.map(row => row.PLATAFORMAS),
      availableDepartments: departmentsResult.map(row => row.DEPTO)
    };
  }

  async _getMySQLFilterOptions() {
    const [storesResult] = await this.mysqlDb.execute(
      'SELECT DISTINCT shop FROM web_orders WHERE shop IS NOT NULL ORDER BY shop'
    );
    
    const [platformsResult] = await this.mysqlDb.execute(
      'SELECT DISTINCT gateway FROM web_orders WHERE gateway IS NOT NULL ORDER BY gateway'
    );
    
    return {
      availableStores: storesResult.map(row => row.shop),
      availablePlatforms: platformsResult.map(row => row.gateway),
      availableDepartments: []
    };
  }

  /**
   * Get complete dashboard data
   */
  async getDashboardData(filters) {
    try {
      const salesFilters = new SalesFilters(filters);
      const validationErrors = salesFilters.validate();
      
      if (validationErrors.length > 0) {
        throw new Error(`Validation errors: ${validationErrors.join(', ')}`);
      }
      
      // Fetch all data in parallel
      const [
        metrics,
        dailyTrends,
        storePerformance,
        topProducts,
        recentOrders,
        filterOptions
      ] = await Promise.all([
        this.getSalesMetrics(salesFilters),
        this.getDailyTrends(salesFilters),
        this.getStorePerformance(salesFilters),
        this.getTopProducts(salesFilters, 10),
        this.getRecentOrders(salesFilters, 20),
        this.getFilterOptions()
      ]);
      
      return new SalesDashboardData({
        metrics,
        dailyTrends,
        storePerformance,
        hourlyPatterns: [], // Not implemented for now
        topProducts,
        recentOrders,
        appliedFilters: salesFilters,
        ...filterOptions
      });
      
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      throw new Error('Failed to fetch dashboard data');
    }
  }
}

module.exports = SalesService;