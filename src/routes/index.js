const express = require('express');
const authRoutes = require('./authRoutes');
const quotesRoutes = require('./quotesRoutes');
const logsRoutes = require('./logsRoutes');
const catalogRoutes = require('./catalogRoutes');
const salesRoutes = require('./salesRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const userManagementRoutes = require('./userManagementRoutes');
const monitoringRoutes = require('./monitoringRoutes');

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Integrated Dashboard API is running',
    timestamp: new Date().toISOString(),
    modules: ['auth', 'quotes', 'logs', 'catalog', 'sales', 'dashboard', 'user-management', 'monitoring']
  });
});

// Authentication routes
router.use('/auth', authRoutes);

// Module routes
router.use('/quotes', quotesRoutes);
router.use('/logs', logsRoutes);
router.use('/catalog', catalogRoutes);
router.use('/sales', salesRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/users', userManagementRoutes);
router.use('/monitoring', monitoringRoutes);

// API documentation endpoint
router.get('/docs', (req, res) => {
  res.json({
    success: true,
    message: 'Integrated Dashboard API Documentation',
    endpoints: {
      authentication: {
        'POST /api/auth/login': 'User login',
        'POST /api/auth/register': 'User registration',
        'POST /api/auth/refresh': 'Refresh access token',
        'POST /api/auth/logout': 'User logout',
        'GET /api/auth/profile': 'Get user profile',
        'PUT /api/auth/password': 'Change password'
      },
      quotes: {
        'GET /api/quotes': 'List quotes',
        'POST /api/quotes': 'Create quote',
        'GET /api/quotes/:id': 'Get quote details',
        'PUT /api/quotes/:id': 'Update quote',
        'DELETE /api/quotes/:id': 'Delete quote',
        'GET /api/quotes/stats': 'Quote statistics'
      },
      logs: {
        'GET /api/logs': 'Get user logs',
        'GET /api/logs/stats': 'Log statistics',
        'GET /api/logs/:id': 'Get log details',
        'GET /api/logs/health': 'Logs module health check'
      },
      catalog: {
        'GET /api/catalog/ping': 'Health check',
        'GET /api/catalog/pim/skus': 'List PIM SKUs',
        'GET /api/catalog/status/erp-vs-pim': 'ERP vs PIM comparison',
        'GET /api/catalog/status/category-based': 'Category-based comparison',
        'GET /api/catalog/categories': 'List categories',
        'GET /api/catalog/categories/summary': 'Category summary'
      },
      sales: {
        'GET /api/sales/dashboard': 'Complete sales dashboard',
        'GET /api/sales/metrics': 'Sales metrics',
        'GET /api/sales/trends': 'Daily trends',
        'GET /api/sales/stores': 'Store performance',
        'GET /api/sales/hourly': 'Hourly patterns',
        'GET /api/sales/products': 'Top products',
        'GET /api/sales/orders': 'Recent orders',
        'GET /api/sales/filters': 'Filter options',
        'GET /api/sales/health': 'Sales module health check'
      },
      dashboard: {
        'GET /api/dashboard/stats': 'Overall dashboard statistics',
        'GET /api/dashboard/health': 'System health status'
      },
      userManagement: {
        'GET /api/users': 'List users with pagination and filtering',
        'GET /api/users/stats': 'User statistics',
        'GET /api/users/activities': 'Recent user activities',
        'GET /api/users/roles': 'Available roles',
        'GET /api/users/permissions': 'User permissions',
        'POST /api/users': 'Create new user',
        'GET /api/users/:id': 'Get user by ID',
        'PUT /api/users/:id': 'Update user',
        'DELETE /api/users/:id': 'Delete user',
        'PUT /api/users/:id/password': 'Change user password',
        'PUT /api/users/:id/toggle-status': 'Toggle user active status',
        'PUT /api/users/:id/unlock': 'Unlock user account'
      },
      monitoring: {
        'GET /api/monitoring/health': 'System health check',
        'GET /api/monitoring/metrics': 'Application metrics',
        'GET /api/monitoring/logs': 'Recent logs',
        'GET /api/monitoring/alerts': 'System alerts',
        'GET /api/monitoring/database': 'Database status',
        'DELETE /api/monitoring/logs': 'Clear logs (admin only)'
      }
    }
  });
});

module.exports = router;