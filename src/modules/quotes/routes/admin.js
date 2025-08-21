const express = require('express');
const { pool, pimPool } = require('../config/database');
const { authenticate, authorize } = require('../../../shared/middleware/authMiddleware');
const logger = require('../utils/logger');
const router = express.Router();

// Database performance monitoring endpoint
router.get('/db-stats', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const stats = pool.getStats();
    
    // Add additional database metrics
    const [dbSize] = await pool.execute("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()");
    const [walSize] = await pool.execute("PRAGMA wal_checkpoint(PASSIVE)");
    
    const metrics = {
      ...stats,
      database: {
        size: dbSize[0]?.size || 0,
        walCheckpoint: walSize,
        timestamp: new Date().toISOString()
      }
    };
    
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching database stats:', error);
    res.status(500).json({ error: 'Failed to fetch database statistics' });
  }
});

// Optimize database (manual trigger)
router.post('/db-optimize', authenticate, authorize(['admin']), async (req, res) => {
  try {
    // Run SQLite optimization commands
    await pool.execute('PRAGMA optimize');
    await pool.execute('PRAGMA wal_checkpoint(TRUNCATE)');
    await pool.execute('VACUUM');
    
    // Cleanup idle connections
    await pool.cleanup();
    
    res.json({ 
      message: 'Database optimization completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error optimizing database:', error);
    res.status(500).json({ error: 'Failed to optimize database' });
  }
});

// Get slow queries log
router.get('/slow-queries', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const stats = pool.getStats();
    res.json({
      slowQueries: stats.slowQueries,
      totalQueries: stats.totalQueries,
      averageQueryTime: stats.averageQueryTime,
      slowQueryThreshold: '1000ms'
    });
  } catch (error) {
    console.error('Error fetching slow queries:', error);
    res.status(500).json({ error: 'Failed to fetch slow query statistics' });
  }
});

// Get comprehensive admin dashboard
router.get('/dashboard', authenticate, authorize(['admin']), async (req, res) => {
  try {
    // Get user statistics
    const [userStats] = await pool.execute(`
      SELECT 
        COUNT(*) as totalUsers,
        SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as activeUsers,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as adminUsers,
        SUM(CASE WHEN role = 'manager' THEN 1 ELSE 0 END) as managerUsers,
        SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as regularUsers,
        SUM(CASE WHEN last_login > datetime('now', '-7 days') THEN 1 ELSE 0 END) as weeklyActiveUsers,
        SUM(CASE WHEN last_login > datetime('now', '-30 days') THEN 1 ELSE 0 END) as monthlyActiveUsers
      FROM users
    `);

    // Get quote statistics
    const [quoteStats] = await pool.execute(`
      SELECT 
        COUNT(*) as totalQuotes,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draftQuotes,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sentQuotes,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approvedQuotes,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejectedQuotes,
        SUM(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 ELSE 0 END) as weeklyQuotes,
        AVG(total) as avgQuoteValue,
        MAX(total) as maxQuoteValue,
        SUM(total) as totalQuoteValue
      FROM quotes
    `);

    // Get client statistics
    const [clientStats] = await pool.execute(`
      SELECT 
        COUNT(*) as totalClients,
        SUM(CASE WHEN created_at > datetime('now', '-30 days') THEN 1 ELSE 0 END) as newClientsThisMonth
      FROM clients
    `);

    // Get session statistics
    const [sessionStats] = await pool.execute(`
      SELECT 
        COUNT(*) as activeSessions,
        COUNT(DISTINCT user_id) as usersWithSessions
      FROM user_sessions 
      WHERE active = 1 AND expires_at > datetime("now")
    `);

    // Get recent activity
    const [recentQuotes] = await pool.execute(`
      SELECT q.id, q.client_name, q.total, q.status, q.created_at,
             u.first_name, u.last_name
      FROM quotes q
      LEFT JOIN users u ON q.user_id = u.id
      ORDER BY q.created_at DESC
      LIMIT 10
    `);

    const [recentUsers] = await pool.execute(`
      SELECT id, username, first_name, last_name, role, created_at, last_login
      FROM users
      ORDER BY created_at DESC
      LIMIT 5
    `);

    // System health information
    const health = {
      database: 'healthy',
      pimDatabase: pimPool ? 'connected' : 'disconnected',
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid
    };

    // Get database statistics
    const dbStats = pool.getStats();

    res.json({
      success: true,
      dashboard: {
        users: userStats[0],
        quotes: quoteStats[0],
        clients: clientStats[0],
        sessions: sessionStats[0],
        database: dbStats,
        recentActivity: {
          quotes: recentQuotes.map(q => ({
            id: q.id,
            clientName: q.client_name,
            total: q.total,
            status: q.status,
            createdAt: q.created_at,
            createdBy: q.first_name && q.last_name ? `${q.first_name} ${q.last_name}` : 'Unknown'
          })),
          users: recentUsers.map(u => ({
            id: u.id,
            username: u.username,
            name: `${u.first_name} ${u.last_name}`,
            role: u.role,
            createdAt: u.created_at,
            lastLogin: u.last_login
          }))
        },
        systemHealth: health,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error fetching admin dashboard', { error, type: 'ADMIN_DASHBOARD_ERROR' });
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard data' });
  }
});

// Get system configuration
router.get('/config', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const config = {
      database: {
        type: 'SQLite',
        location: './data/database.sqlite',
        status: 'connected'
      },
      pimDatabase: {
        type: 'MySQL',
        host: process.env.PIM_DB_HOST || 'Not configured',
        status: pimPool ? 'connected' : 'disconnected'
      },
      email: {
        service: process.env.EMAIL_SERVICE || 'Not configured',
        host: process.env.EMAIL_HOST || 'Not configured',
        port: process.env.EMAIL_PORT || 'Not configured',
        secure: process.env.EMAIL_SECURE === 'true',
        status: 'configured'
      },
      application: {
        nodeVersion: process.version,
        platform: process.platform,
        environment: process.env.NODE_ENV || 'development',
        port: process.env.PORT || 3005,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        uptime: process.uptime()
      },
      features: {
        userManagement: true,
        emailManagement: true,
        inventoryManagement: true,
        quoteWorkflow: true,
        adminPanel: true
      }
    };

    res.json({
      success: true,
      configuration: config,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching system configuration', { error, type: 'ADMIN_CONFIG_ERROR' });
    res.status(500).json({ success: false, error: 'Failed to fetch system configuration' });
  }
});

// System maintenance operations
router.post('/maintenance/cleanup', authenticate, authorize(['admin']), async (req, res) => {
  try {
    let results = {
      expiredSessions: 0,
      expiredTokens: 0,
      optimizedTables: 0
    };

    // Clean up expired sessions
    const [sessionResult] = await pool.execute(
      'DELETE FROM user_sessions WHERE expires_at < datetime("now") OR active = 0'
    );
    results.expiredSessions = sessionResult.affectedRows;

    // Clean up expired refresh tokens
    const [tokenResult] = await pool.execute(
      'DELETE FROM refresh_tokens WHERE expires_at < datetime("now")'
    );
    results.expiredTokens = tokenResult.affectedRows;

    // Run optimization
    await pool.execute('PRAGMA optimize');
    results.optimizedTables = 1;

    // Log cleanup operation
    logger.info('Manual system cleanup performed', {
      type: 'SYSTEM_CLEANUP',
      results,
      performedBy: req.user.username
    });

    res.json({
      success: true,
      message: 'System cleanup completed successfully',
      results
    });
  } catch (error) {
    logger.error('Error performing system cleanup', { error, type: 'ADMIN_CLEANUP_ERROR' });
    res.status(500).json({ success: false, error: 'Failed to perform system cleanup' });
  }
});

// Get performance metrics
router.get('/performance', authenticate, authorize(['admin']), async (req, res) => {
  try {
    // Memory and CPU usage
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // Database performance
    const dbStats = pool.getStats();
    
    // System uptime
    const uptime = process.uptime();

    res.json({
      success: true,
      metrics: {
        system: {
          uptime: uptime,
          nodeVersion: process.version,
          platform: process.platform,
          pid: process.pid
        },
        memory: {
          used: memoryUsage.heapUsed,
          total: memoryUsage.heapTotal,
          rss: memoryUsage.rss,
          external: memoryUsage.external,
          percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        },
        database: dbStats,
        pimDatabase: {
          status: pimPool ? 'connected' : 'disconnected',
          type: 'MySQL'
        },
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error fetching performance metrics', { error, type: 'ADMIN_PERFORMANCE_ERROR' });
    res.status(500).json({ success: false, error: 'Failed to fetch performance metrics' });
  }
});

module.exports = router;