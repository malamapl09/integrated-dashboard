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

// Static file serving for root public directory (for login.html and other root assets)
app.use(express.static(path.join(__dirname, '../public')));

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
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Test route to verify styled login
app.get('/login-test', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'text/html');
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Fresh login route to bypass caching
app.get('/fresh-login', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'text/html');
  const fs = require('fs');
  const loginContent = fs.readFileSync(path.join(__dirname, '../public/login.html'), 'utf8');
  res.send(loginContent);
});

// Test with completely inline styles - no external dependencies
app.get('/test-inline', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'text/html');
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Login - Plaza Lama</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(20px);
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
            width: 100%;
            max-width: 400px;
        }
        .logo {
            width: 60px;
            height: 60px;
            background: linear-gradient(135deg, #3b82f6, #1e40af);
            border-radius: 15px;
            margin: 0 auto 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
        }
        h1 {
            text-align: center;
            color: #1f2937;
            margin-bottom: 10px;
            font-size: 28px;
            font-weight: 700;
        }
        p {
            text-align: center;
            color: #6b7280;
            margin-bottom: 30px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            color: #374151;
            margin-bottom: 8px;
            font-weight: 600;
        }
        input[type="text"], input[type="password"] {
            width: 100%;
            padding: 15px;
            border: 2px solid #e5e7eb;
            border-radius: 10px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        input[type="text"]:focus, input[type="password"]:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        .btn {
            width: 100%;
            padding: 15px;
            background: linear-gradient(135deg, #3b82f6, #1e40af);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
        }
        .btn:hover {
            transform: translateY(-2px);
        }
        .test-note {
            margin-top: 20px;
            padding: 15px;
            background: #fef3c7;
            border-radius: 10px;
            text-align: center;
            color: #92400e;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🏢</div>
        <h1>Plaza Lama Dashboard</h1>
        <p>Sign in to your account</p>
        
        <form onsubmit="handleLogin(event)">
            <div class="form-group">
                <label>Username</label>
                <input type="text" id="username" placeholder="Enter username" required>
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" id="password" placeholder="Enter password" required>
            </div>
            <button type="submit" class="btn">Sign In</button>
        </form>
        
        <div class="test-note">
            ✅ If you can see this styled page, the server is working correctly!
        </div>
    </div>

    <script>
        async function handleLogin(e) {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                
                const result = await response.json();
                if (result.success) {
                    localStorage.setItem('token', result.data.tokens.accessToken);
                    window.location.href = '/dashboard';
                } else {
                    alert('Login failed: ' + result.message);
                }
            } catch (error) {
                alert('Login error: ' + error.message);
            }
        }
    </script>
</body>
</html>
  `);
});

// Ultra-simple test to check if ANY CSS works
app.get('/simple-test', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Content-Type', 'text/html');
  res.send(`
<html>
<head>
<style>
body { background: red; color: white; font-size: 30px; }
</style>
</head>
<body>
<h1>SIMPLE TEST</h1>
<p>If you see RED background and WHITE text, CSS is working!</p>
<p>If you see black text on white background, CSS is NOT working!</p>
</body>
</html>
  `);
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