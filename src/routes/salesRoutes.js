const express = require('express');
const SalesController = require('../modules/sales/salesController');
const SalesExportController = require('../modules/sales/exportController');
const authMiddleware = require('../shared/middleware/authMiddleware');

const router = express.Router();
const salesController = new SalesController();
const exportController = new SalesExportController();

// All sales routes require authentication
router.use(authMiddleware.authenticate());

// Sales dashboard and analytics routes
router.get('/dashboard', salesController.getDashboard.bind(salesController));
router.get('/metrics', salesController.getMetrics.bind(salesController));
router.get('/trends', salesController.getTrends.bind(salesController));
router.get('/stores', salesController.getStorePerformance.bind(salesController));
router.get('/hourly', salesController.getHourlyPatterns.bind(salesController));
router.get('/products', salesController.getTopProducts.bind(salesController));
router.get('/orders', salesController.getRecentOrders.bind(salesController));
router.get('/filters', salesController.getFilterOptions.bind(salesController));
router.get('/health', salesController.healthCheck.bind(salesController));

// Export routes
router.get('/export/metrics/excel', exportController.exportSalesMetricsExcel.bind(exportController));
router.get('/export/report/pdf', exportController.exportSalesReportPDF.bind(exportController));
router.get('/export/products/excel', exportController.exportTopProductsExcel.bind(exportController));
router.get('/export/trends/excel', exportController.exportDailyTrendsExcel.bind(exportController));
router.get('/export/stores/excel', exportController.exportStorePerformanceExcel.bind(exportController));

module.exports = router;