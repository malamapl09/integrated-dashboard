const express = require('express');
const DashboardController = require('../modules/dashboard/dashboardController');
const authMiddleware = require('../shared/middleware/authMiddleware');

const router = express.Router();
const dashboardController = new DashboardController();

// Health check (public)
router.get('/health', dashboardController.healthCheck.bind(dashboardController));

// Protected routes require authentication
router.use(authMiddleware.authenticate());

// Dashboard statistics routes
router.get('/stats', dashboardController.getStats.bind(dashboardController));
router.get('/overview', dashboardController.getOverview.bind(dashboardController));

// Dashboard insights and analytics
router.get('/insights', dashboardController.getInsights.bind(dashboardController));
router.get('/activity', dashboardController.getActivityStream.bind(dashboardController));
router.get('/alerts', dashboardController.getSystemAlerts.bind(dashboardController));

// Dashboard export functionality
router.get('/export/:type', dashboardController.exportReport.bind(dashboardController));

module.exports = router;