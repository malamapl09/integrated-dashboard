const express = require('express');
const LogsController = require('../modules/logs/logsController');
const LogsExportController = require('../modules/logs/exportController');
const authMiddleware = require('../shared/middleware/authMiddleware');

const router = express.Router();
const logsController = new LogsController();
const exportController = new LogsExportController();

// All logs routes require authentication
router.use(authMiddleware.authenticate());

// User logs routes
router.get('/', logsController.getLogs.bind(logsController));
router.get('/stats', logsController.getStats.bind(logsController));
router.get('/health', logsController.healthCheck.bind(logsController));
router.get('/:id', logsController.getLogDetails.bind(logsController));

// Export routes
router.get('/export/excel', exportController.exportLogsExcel.bind(exportController));
router.get('/export/summary/pdf', exportController.exportActivitySummaryPDF.bind(exportController));
router.get('/export/performance/excel', exportController.exportUserPerformanceExcel.bind(exportController));
router.get('/export/product-history/excel', exportController.exportProductHistoryExcel.bind(exportController));

module.exports = router;