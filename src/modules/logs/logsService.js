const { database } = require('../../shared/database');

class LogsService {
  constructor() {
    this.db = database.mysql;
  }

  parseLogEntry(log) {
    if (typeof log !== 'string') return { action: log, before: null, after: null };

    // Remove surrounding quotes if they exist
    const cleanLog = log.replace(/^["']|["']$/g, '');

    // Parse "Title changed from X to Y"
    const titleChangeMatch = cleanLog.match(/^Title changed from (.+) to (.+)$/);
    if (titleChangeMatch) {
      return {
        action: 'Title Changed',
        before: titleChangeMatch[1].trim(),
        after: titleChangeMatch[2].trim()
      };
    }

    // Handle combined actions like "Title changed..., Specifications updated"
    const combinedTitleSpecMatch = cleanLog.match(/^Title changed from (.+) to (.+), Specifications updated$/);
    if (combinedTitleSpecMatch) {
      return {
        action: 'Title Changed + Specs Updated',
        before: combinedTitleSpecMatch[1].trim(),
        after: combinedTitleSpecMatch[2].trim()
      };
    }

    // Parse "Product desactivated" / "Product activated"
    if (cleanLog === 'Product desactivated') {
      return { action: 'Product Deactivated', before: null, after: null };
    }
    if (cleanLog === 'Product activated') {
      return { action: 'Product Activated', before: null, after: null };
    }

    // Parse "Specifications updated"
    if (cleanLog === 'Specifications updated') {
      return { action: 'Specifications Updated', before: null, after: null };
    }

    // Parse price changes if they exist
    const priceChangeMatch = cleanLog.match(/^Price changed from (.+) to (.+)$/);
    if (priceChangeMatch) {
      return {
        action: 'Price Changed',
        before: priceChangeMatch[1].trim(),
        after: priceChangeMatch[2].trim()
      };
    }

    // Default case - return the cleaned log as action
    return { action: cleanLog, before: null, after: null };
  }

  async getUserLogs(filters = {}) {
    try {
      const { user, type_log, field, action, startDate, endDate, limit = 100, offset = 0 } = filters;
      
      let query = 'SELECT * FROM users_logs WHERE 1=1';
      const params = [];

      if (user) {
        query += ' AND user LIKE ?';
        params.push(`%${user}%`);
      }

      if (type_log) {
        query += ' AND type_log = ?';
        params.push(type_log);
      }

      if (field) {
        query += ' AND field LIKE ?';
        params.push(`%${field}%`);
      }

      // Filter by parsed action type
      if (action) {
        switch (action) {
          case 'title_change':
            query += ' AND log LIKE ?';
            params.push('Title changed from%');
            break;
          case 'product_activation':
            query += ' AND (log = ? OR log = ?)';
            params.push('Product activated', 'Product desactivated');
            break;
          case 'specifications':
            query += ' AND log = ?';
            params.push('Specifications updated');
            break;
          case 'price_change':
            query += ' AND log LIKE ?';
            params.push('Price changed from%');
            break;
        }
      }

      if (startDate) {
        query += ' AND date_timer >= ?';
        params.push(startDate);
      }

      if (endDate) {
        query += ' AND date_timer <= ?';
        params.push(endDate);
      }

      query += ' ORDER BY date_timer DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));

      const [rows] = await this.db.execute(query, params);
      
      // Parse each log entry
      return rows.map(row => ({
        ...row,
        parsedLog: this.parseLogEntry(row.log)
      }));

    } catch (error) {
      console.error('Error fetching user logs:', error);
      throw new Error('Failed to fetch user logs');
    }
  }

  async getUserLogStats() {
    try {
      const queries = {
        totalLogs: 'SELECT COUNT(*) as count FROM users_logs',
        logsByType: `
          SELECT type_log, COUNT(*) as count 
          FROM users_logs 
          GROUP BY type_log 
          ORDER BY count DESC
        `,
        topUsers: `
          SELECT user, COUNT(*) as count 
          FROM users_logs 
          GROUP BY user 
          ORDER BY count DESC 
          LIMIT 10
        `,
        recentActivity: `
          SELECT DATE(date_timer) as date, COUNT(*) as count
          FROM users_logs
          WHERE date_timer >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          GROUP BY DATE(date_timer)
          ORDER BY date DESC
        `,
        actionTypes: `
          SELECT 
            CASE 
              WHEN log LIKE '%Title changed from%' THEN 'Title Changes'
              WHEN log LIKE '%Product activated%' THEN 'Product Activations'
              WHEN log LIKE '%Product desactivated%' THEN 'Product Deactivations'
              WHEN log LIKE '%Specifications updated%' THEN 'Specifications Updates'
              WHEN log LIKE '%Price changed from%' THEN 'Price Changes'
              ELSE 'Other Actions'
            END as action_type,
            COUNT(*) as count
          FROM users_logs
          GROUP BY action_type
          ORDER BY count DESC
        `,
        todayStats: `
          SELECT 
            COUNT(*) as total_actions,
            COUNT(DISTINCT field) as products_modified,
            COUNT(DISTINCT user) as active_users
          FROM users_logs 
          WHERE DATE(date_timer) = CURDATE()
        `,
        weekStats: `
          SELECT COUNT(*) as count
          FROM users_logs 
          WHERE date_timer >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        `
      };

      const results = {};
      for (const [key, query] of Object.entries(queries)) {
        const [rows] = await this.db.execute(query);
        results[key] = rows;
      }

      return results;

    } catch (error) {
      console.error('Error fetching log stats:', error);
      throw new Error('Failed to fetch log statistics');
    }
  }

  async getLogDetails(logId) {
    try {
      const [rows] = await this.db.execute(
        'SELECT * FROM users_logs WHERE id = ?',
        [logId]
      );
      
      if (rows.length === 0) {
        throw new Error('Log entry not found');
      }
      
      const log = rows[0];
      return {
        ...log,
        parsedLog: this.parseLogEntry(log.log)
      };

    } catch (error) {
      console.error('Error fetching log details:', error);
      throw new Error('Failed to fetch log details');
    }
  }
}

module.exports = LogsService;