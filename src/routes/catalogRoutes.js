const express = require('express');
const CatalogController = require('../modules/catalog/catalogController');
const CatalogExportController = require('../modules/catalog/exportController');
const authMiddleware = require('../shared/middleware/authMiddleware');

const router = express.Router();
const catalogController = new CatalogController();
const exportController = new CatalogExportController();

// Public routes (health check)
router.get('/ping', catalogController.ping.bind(catalogController));

// Protected routes require authentication
router.use(authMiddleware.authenticate());

// Catalog management routes
router.get('/pim/skus', catalogController.listPIMSkus.bind(catalogController));
router.get('/status/erp-vs-pim', catalogController.getCatalogStatus.bind(catalogController));
router.get('/status/category-based', catalogController.getCategoryBasedStatus.bind(catalogController));
router.get('/categories', catalogController.getCategories.bind(catalogController));
router.get('/categories/summary', catalogController.getCategorySummary.bind(catalogController));

// Export routes
router.get('/export/erp-pim/excel', exportController.exportERPvsPIMExcel.bind(exportController));
router.get('/export/category/excel', exportController.exportCategoryComparisonExcel.bind(exportController));
router.get('/export/status/pdf', exportController.exportCatalogStatusPDF.bind(exportController));
router.get('/export/inventory/excel', exportController.exportInventoryReportExcel.bind(exportController));

module.exports = router;