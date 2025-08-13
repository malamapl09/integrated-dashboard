const LogsService = require('./logsService');

class LogsController {
  constructor() {
    this.logsService = new LogsService();
  }

  /**
   * Get user logs with filtering
   */
  async getLogs(req, res) {
    try {
      const filters = {
        user: req.query.user,
        type_log: req.query.type_log,
        field: req.query.field,
        action: req.query.action,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        limit: req.query.limit || 100,
        offset: req.query.offset || 0
      };

      const logs = await this.logsService.getUserLogs(filters);

      res.json({
        success: true,
        data: logs,
        filters: filters
      });

    } catch (error) {
      console.error('Get logs error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch logs'
      });
    }
  }

  /**
   * Get log statistics
   */
  async getStats(req, res) {
    try {
      const stats = await this.logsService.getUserLogStats();

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('Get stats error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch log statistics'
      });
    }
  }

  /**
   * Get specific log details
   */
  async getLogDetails(req, res) {
    try {
      const logId = req.params.id;
      const logDetails = await this.logsService.getLogDetails(logId);

      res.json({
        success: true,
        data: logDetails
      });

    } catch (error) {
      console.error('Get log details error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch log details'
      });
    }
  }

  /**
   * Health check for logs module
   */
  async healthCheck(req, res) {
    try {
      // Simple health check - try to fetch log count
      const [result] = await this.logsService.db.execute('SELECT COUNT(*) as count FROM users_logs');
      
      res.json({
        success: true,
        message: 'Logs service is healthy',
        totalLogs: result[0].count,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Logs health check error:', error);
      res.status(503).json({
        success: false,
        message: 'Logs service is unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = LogsController;