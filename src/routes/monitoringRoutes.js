const express = require('express');
const MonitoringController = require('../shared/controllers/monitoringController');
const authMiddleware = require('../shared/middleware/authMiddleware');

const router = express.Router();
const monitoringController = new MonitoringController();

// Public health check endpoint (no auth required)
router.get('/health', monitoringController.getSystemHealth.bind(monitoringController));

// Protected monitoring endpoints (require authentication)
router.use(authMiddleware.authenticate());

// System metrics and status
router.get('/metrics', monitoringController.getMetrics.bind(monitoringController));
router.get('/logs', monitoringController.getLogs.bind(monitoringController));
router.get('/alerts', monitoringController.getAlerts.bind(monitoringController));
router.get('/database', monitoringController.getDatabaseStatus.bind(monitoringController));

// Admin-only endpoints
router.delete('/logs', authMiddleware.authorize(['admin']), monitoringController.clearLogs.bind(monitoringController));

module.exports = router;