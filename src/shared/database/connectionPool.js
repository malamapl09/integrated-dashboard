const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class SQLiteConnectionPool {
  constructor(dbPath, options = {}) {
    this.dbPath = dbPath;
    this.maxConnections = options.maxConnections || 10;
    this.idleTimeout = options.idleTimeout || 30000; // 30 seconds
    this.busyTimeout = options.busyTimeout || 30000;
    
    this.availableConnections = [];
    this.busyConnections = new Set();
    this.connectionCount = 0;
    this.waitingQueue = [];
    
    this.stats = {
      totalQueries: 0,
      activeConnections: 0,
      peakConnections: 0,
      averageQueryTime: 0,
      slowQueries: 0
    };
    
    // Initialize with minimum connections
    this.initializePool();
  }

  async initializePool() {
    const minConnections = Math.min(3, this.maxConnections);
    for (let i = 0; i < minConnections; i++) {
      await this.createConnection();
    }
  }

  async createConnection() {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Optimize each connection
        this.optimizeConnection(db);
        
        const connectionWrapper = {
          db,
          id: ++this.connectionCount,
          createdAt: Date.now(),
          lastUsed: Date.now(),
          queryCount: 0,
          pool: this
        };

        this.availableConnections.push(connectionWrapper);
        this.stats.activeConnections++;
        this.stats.peakConnections = Math.max(this.stats.peakConnections, this.stats.activeConnections);
        
        resolve(connectionWrapper);
      });
    });
  }

  optimizeConnection(db) {
    // Apply performance optimizations to each connection
    const pragmas = [
      'PRAGMA foreign_keys = ON',
      'PRAGMA journal_mode = WAL',
      'PRAGMA synchronous = NORMAL',
      'PRAGMA cache_size = 10000',
      'PRAGMA temp_store = MEMORY',
      'PRAGMA mmap_size = 268435456', // 256MB
      'PRAGMA page_size = 4096',
      'PRAGMA optimize'
    ];

    pragmas.forEach(pragma => {
      db.run(pragma, (err) => {
        if (err) console.warn(`Failed to apply pragma: ${pragma}`, err.message);
      });
    });

    // Set busy timeout
    db.run(`PRAGMA busy_timeout = ${this.busyTimeout}`);
  }

  async getConnection() {
    // Return available connection if exists
    if (this.availableConnections.length > 0) {
      const connection = this.availableConnections.pop();
      this.busyConnections.add(connection);
      connection.lastUsed = Date.now();
      return connection;
    }

    // Create new connection if under limit
    if (this.connectionCount < this.maxConnections) {
      const connection = await this.createConnection();
      this.availableConnections.pop(); // Remove from available since we're using it
      this.busyConnections.add(connection);
      return connection;
    }

    // Wait for available connection
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
        }
        reject(new Error('Connection timeout'));
      }, 10000); // 10 second timeout

      this.waitingQueue.push({ resolve, reject, timeout });
    });
  }

  releaseConnection(connection) {
    if (this.busyConnections.has(connection)) {
      this.busyConnections.delete(connection);
      
      // Serve waiting queue first
      if (this.waitingQueue.length > 0) {
        const waiter = this.waitingQueue.shift();
        clearTimeout(waiter.timeout);
        this.busyConnections.add(connection);
        connection.lastUsed = Date.now();
        waiter.resolve(connection);
        return;
      }

      // Return to available pool
      connection.lastUsed = Date.now();
      this.availableConnections.push(connection);
    }
  }

  async execute(sql, params = []) {
    const startTime = Date.now();
    const connection = await this.getConnection();
    
    return new Promise((resolve, reject) => {
      const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
      
      if (isSelect) {
        connection.db.all(sql, params, (err, result) => {
          const queryTime = Date.now() - startTime;
          
          // Update statistics
          this.stats.totalQueries++;
          connection.queryCount++;
          
          if (queryTime > 1000) { // Slow query threshold: 1 second
            this.stats.slowQueries++;
            console.warn(`Slow query detected (${queryTime}ms):`, sql.substring(0, 100));
          }
          
          // Update average query time
          this.stats.averageQueryTime = (this.stats.averageQueryTime * (this.stats.totalQueries - 1) + queryTime) / this.stats.totalQueries;
          
          this.releaseConnection(connection);
          
          if (err) {
            reject(err);
          } else {
            resolve([result]);
          }
        });
      } else {
        connection.db.run(sql, params, function(err) {
          const queryTime = Date.now() - startTime;
          
          // Update statistics
          connection.pool.stats.totalQueries++;
          connection.queryCount++;
          
          if (queryTime > 1000) { // Slow query threshold: 1 second
            connection.pool.stats.slowQueries++;
            console.warn(`Slow query detected (${queryTime}ms):`, sql.substring(0, 100));
          }
          
          // Update average query time
          connection.pool.stats.averageQueryTime = (connection.pool.stats.averageQueryTime * (connection.pool.stats.totalQueries - 1) + queryTime) / connection.pool.stats.totalQueries;
          
          connection.pool.releaseConnection(connection);
          
          if (err) {
            reject(err);
          } else {
            resolve([{ insertId: this.lastID, affectedRows: this.changes }]);
          }
        });
      }
    });
  }

  async beginTransaction() {
    const connection = await this.getConnection();
    
    return new Promise((resolve, reject) => {
      connection.db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          this.releaseConnection(connection);
          reject(err);
        } else {
          resolve({
            connection,
            execute: (sql, params = []) => this.executeInTransaction(connection, sql, params),
            commit: () => this.commitTransaction(connection),
            rollback: () => this.rollbackTransaction(connection)
          });
        }
      });
    });
  }

  async executeInTransaction(connection, sql, params = []) {
    return new Promise((resolve, reject) => {
      const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
      
      if (isSelect) {
        connection.db.all(sql, params, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve([result]);
          }
        });
      } else {
        connection.db.run(sql, params, function(err) {
          if (err) {
            reject(err);
          } else {
            resolve([{ insertId: this.lastID, affectedRows: this.changes }]);
          }
        });
      }
    });
  }

  async commitTransaction(connection) {
    return new Promise((resolve, reject) => {
      connection.db.run('COMMIT', (err) => {
        this.releaseConnection(connection);
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async rollbackTransaction(connection) {
    return new Promise((resolve, reject) => {
      connection.db.run('ROLLBACK', (err) => {
        this.releaseConnection(connection);
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // Cleanup idle connections
  cleanupIdleConnections() {
    const now = Date.now();
    const idleConnections = this.availableConnections.filter(
      conn => now - conn.lastUsed > this.idleTimeout
    );

    idleConnections.forEach(conn => {
      const index = this.availableConnections.indexOf(conn);
      if (index !== -1) {
        this.availableConnections.splice(index, 1);
        conn.db.close();
        this.stats.activeConnections--;
      }
    });
  }

  getStats() {
    return {
      ...this.stats,
      availableConnections: this.availableConnections.length,
      busyConnections: this.busyConnections.size,
      waitingQueue: this.waitingQueue.length,
      totalConnections: this.connectionCount
    };
  }

  async close() {
    // Close all connections
    [...this.availableConnections, ...this.busyConnections].forEach(conn => {
      conn.db.close();
    });
    
    this.availableConnections = [];
    this.busyConnections.clear();
    this.stats.activeConnections = 0;
  }
}

module.exports = SQLiteConnectionPool;