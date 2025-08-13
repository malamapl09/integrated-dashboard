class BatchProcessor {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 100;
    this.flushInterval = options.flushInterval || 5000; // 5 seconds
    this.maxRetries = options.maxRetries || 3;
    
    this.batches = new Map();
    this.timers = new Map();
    
    // Start cleanup timer
    setInterval(() => this.cleanup(), 60000); // 1 minute
  }

  // Add operation to batch
  addToBatch(batchKey, operation) {
    if (!this.batches.has(batchKey)) {
      this.batches.set(batchKey, []);
      
      // Set timer to flush batch
      const timer = setTimeout(() => {
        this.flushBatch(batchKey);
      }, this.flushInterval);
      
      this.timers.set(batchKey, timer);
    }

    const batch = this.batches.get(batchKey);
    batch.push(operation);

    // Flush if batch is full
    if (batch.length >= this.batchSize) {
      this.flushBatch(batchKey);
    }
  }

  async flushBatch(batchKey) {
    const batch = this.batches.get(batchKey);
    const timer = this.timers.get(batchKey);

    if (!batch || batch.length === 0) {
      return;
    }

    // Clear timer
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(batchKey);
    }

    // Remove batch from queue
    this.batches.delete(batchKey);

    try {
      await this.processBatch(batchKey, batch);
      console.log(`Successfully processed batch ${batchKey} with ${batch.length} operations`);
    } catch (error) {
      console.error(`Failed to process batch ${batchKey}:`, error);
      
      // Retry logic
      for (let i = 0; i < this.maxRetries; i++) {
        try {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
          await this.processBatch(batchKey, batch);
          console.log(`Retry ${i + 1} successful for batch ${batchKey}`);
          break;
        } catch (retryError) {
          console.error(`Retry ${i + 1} failed for batch ${batchKey}:`, retryError);
          if (i === this.maxRetries - 1) {
            console.error(`All retries failed for batch ${batchKey}, operations lost`);
          }
        }
      }
    }
  }

  async processBatch(batchKey, operations) {
    switch (batchKey) {
      case 'cache_invalidation':
        await this.processCacheInvalidation(operations);
        break;
      case 'audit_log':
        await this.processAuditLog(operations);
        break;
      case 'analytics':
        await this.processAnalytics(operations);
        break;
      default:
        console.warn(`Unknown batch type: ${batchKey}`);
    }
  }

  async processCacheInvalidation(operations) {
    const cache = require('./cache');
    const uniqueKeys = [...new Set(operations.map(op => op.key))];
    
    uniqueKeys.forEach(key => {
      cache.delete(key);
    });
  }

  async processAuditLog(operations) {
    const { pool } = require('../config/database');
    
    // Batch insert audit logs
    const values = operations.map(op => [
      op.action,
      op.table_name,
      op.record_id,
      JSON.stringify(op.changes),
      op.user_id || null,
      new Date().toISOString()
    ]);

    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const flatValues = values.flat();

    await pool.execute(`
      INSERT INTO audit_log (action, table_name, record_id, changes, user_id, created_at)
      VALUES ${placeholders}
    `, flatValues);
  }

  async processAnalytics(operations) {
    // Group analytics by type
    const grouped = operations.reduce((acc, op) => {
      if (!acc[op.event_type]) {
        acc[op.event_type] = [];
      }
      acc[op.event_type].push(op);
      return acc;
    }, {});

    const { pool } = require('../config/database');

    for (const [eventType, events] of Object.entries(grouped)) {
      const aggregated = this.aggregateEvents(events);
      
      await pool.execute(`
        INSERT OR REPLACE INTO analytics_summary 
        (event_type, date, count, metadata, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `, [
        eventType,
        new Date().toISOString().split('T')[0],
        aggregated.count,
        JSON.stringify(aggregated.metadata),
        new Date().toISOString()
      ]);
    }
  }

  aggregateEvents(events) {
    const count = events.length;
    const metadata = events.reduce((acc, event) => {
      // Aggregate common metadata
      if (event.metadata) {
        Object.keys(event.metadata).forEach(key => {
          if (!acc[key]) acc[key] = [];
          acc[key].push(event.metadata[key]);
        });
      }
      return acc;
    }, {});

    // Calculate summaries for metadata
    Object.keys(metadata).forEach(key => {
      const values = metadata[key];
      if (typeof values[0] === 'number') {
        metadata[key] = {
          sum: values.reduce((a, b) => a + b, 0),
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values)
        };
      } else {
        metadata[key] = {
          unique: [...new Set(values)].length,
          most_common: this.getMostCommon(values)
        };
      }
    });

    return { count, metadata };
  }

  getMostCommon(arr) {
    const frequency = arr.reduce((acc, val) => {
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {});

    return Object.keys(frequency).reduce((a, b) => 
      frequency[a] > frequency[b] ? a : b
    );
  }

  // Force flush all batches
  async flushAll() {
    const batchKeys = [...this.batches.keys()];
    await Promise.all(batchKeys.map(key => this.flushBatch(key)));
  }

  // Cleanup old timers and empty batches
  cleanup() {
    for (const [key, batch] of this.batches.entries()) {
      if (batch.length === 0) {
        const timer = this.timers.get(key);
        if (timer) {
          clearTimeout(timer);
          this.timers.delete(key);
        }
        this.batches.delete(key);
      }
    }
  }

  getStats() {
    return {
      activeBatches: this.batches.size,
      totalOperations: Array.from(this.batches.values()).reduce((sum, batch) => sum + batch.length, 0),
      batchSizes: Array.from(this.batches.entries()).map(([key, batch]) => ({
        key,
        size: batch.length
      }))
    };
  }
}

// Global batch processor instance
const batchProcessor = new BatchProcessor({
  batchSize: 50,
  flushInterval: 3000
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Flushing batches before shutdown...');
  await batchProcessor.flushAll();
});

process.on('SIGINT', async () => {
  console.log('Flushing batches before shutdown...');
  await batchProcessor.flushAll();
  process.exit(0);
});

module.exports = batchProcessor;