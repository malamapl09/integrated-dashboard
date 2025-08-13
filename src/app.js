const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import shared modules
const { testConnections } = require('./shared/database');
const authMiddleware = require('./shared/middleware/authMiddleware');
const { requestLogger, errorLogger, systemMonitor } = require('./shared/middleware/loggingMiddleware');
const loggingService = require('./shared/services/loggingService');
const scheduledTasks = require('./shared/services/scheduledTasks');
const apiRoutes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(authMiddleware.securityHeaders());

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  credentials: true,
  optionsSuccessStatus: 200
}));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  }
});
app.use(generalLimiter);

// Body parsing middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use(requestLogger);

// Static file serving for shared assets (must come first)
app.use('/shared', express.static(path.join(__dirname, '../public/shared')));

// Static file serving for different modules
app.use('/dashboard', express.static(path.join(__dirname, '../public/dashboard')));
app.use('/quotes', express.static(path.join(__dirname, '../public/quotes')));
app.use('/logs', express.static(path.join(__dirname, '../public/logs')));
app.use('/catalog', express.static(path.join(__dirname, '../public/catalog')));
app.use('/sales', express.static(path.join(__dirname, '../public/sales')));
app.use('/user-management', express.static(path.join(__dirname, '../public/user-management')));
app.use('/monitoring', express.static(path.join(__dirname, '../public/monitoring')));

// Legacy static content
app.use('/quotes-content', express.static(path.join(__dirname, '../public/quotes-content')));
app.use('/logs-content', express.static(path.join(__dirname, '../public/logs-content')));

// API routes
app.use('/api', apiRoutes);

// Login page route (no authentication required) - serve from public root
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Dashboard route - requires authentication
app.get('/dashboard', authMiddleware.optionalAuth(), (req, res) => {
  if (!req.user) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, '../public/dashboard/index.html'));
});

// Root route - simple redirect to login (no auth check needed)
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// Module-specific routes (protected)
app.get('/quotes/*', authMiddleware.optionalAuth(), (req, res) => {
  if (!req.user) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, '../public/quotes/index.html'));
});

app.get('/logs/*', authMiddleware.optionalAuth(), (req, res) => {
  if (!req.user) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, '../public/logs/index.html'));
});

app.get('/catalog/*', authMiddleware.optionalAuth(), (req, res) => {
  if (!req.user) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, '../public/catalog/index.html'));
});

app.get('/sales/*', authMiddleware.optionalAuth(), (req, res) => {
  if (!req.user) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, '../public/sales/index.html'));
});

app.get('/user-management/*', authMiddleware.optionalAuth(), (req, res) => {
  if (!req.user) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, '../public/user-management/index.html'));
});

app.get('/monitoring/*', authMiddleware.optionalAuth(), (req, res) => {
  if (!req.user) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, '../public/monitoring/index.html'));
});

// Global error handler
app.use(errorLogger);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Initialize database connections and start server
async function startServer() {
  try {
    // Log system startup
    systemMonitor.logSystemStart();
    
    console.log('🔌 Testing database connections...');
    await testConnections();
    
    // Start system health monitoring
    systemMonitor.startHealthChecks();
    
    // Start scheduled tasks
    scheduledTasks.startAll();
    
    app.listen(PORT, () => {
      console.log('🚀 Integrated Dashboard Server started successfully!');
      console.log(`📡 Server running at: http://localhost:${PORT}`);
      console.log(`🏠 Dashboard: http://localhost:${PORT}/`);
      console.log(`📊 API Documentation: http://localhost:${PORT}/api/docs`);
      console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);
      console.log('');
      console.log('📋 Available Modules:');
      console.log(`  • Quote Management: http://localhost:${PORT}/quotes/`);
      console.log(`  • User Activity Logs: http://localhost:${PORT}/logs/`);
      console.log(`  • Catalog Management: http://localhost:${PORT}/catalog/`);
      console.log(`  • Sales Analytics: http://localhost:${PORT}/sales/`);
      console.log(`  • System Monitoring: http://localhost:${PORT}/monitoring/`);
      console.log('');
      console.log('🔗 API Endpoints:');
      console.log(`  • Authentication: http://localhost:${PORT}/api/auth/`);
      console.log(`  • Quotes API: http://localhost:${PORT}/api/quotes/`);
      console.log(`  • Logs API: http://localhost:${PORT}/api/logs/`);
      console.log(`  • Catalog API: http://localhost:${PORT}/api/catalog/`);
      console.log(`  • Sales API: http://localhost:${PORT}/api/sales/`);
      console.log(`  • Dashboard API: http://localhost:${PORT}/api/dashboard/`);
      console.log(`  • Monitoring API: http://localhost:${PORT}/api/monitoring/`);
    });
    
  } catch (error) {
    loggingService.error('Failed to start server', error);
    console.error('❌ Failed to start server:', error.message);
    console.log('');
    console.log('💡 Setup Instructions:');
    console.log('1. Copy .env.example to .env');
    console.log('2. Configure your database connections in .env');
    console.log('3. Ensure MySQL server is running');
    console.log('4. Run: npm install');
    console.log('5. Run: npm start');
    
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  systemMonitor.logSystemShutdown();
  scheduledTasks.stopAll();
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  systemMonitor.logSystemShutdown();
  scheduledTasks.stopAll();
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  loggingService.error('Uncaught Exception', error);
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  loggingService.error('Unhandled Rejection', reason, { promise: promise.toString() });
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
startServer();

module.exports = app;