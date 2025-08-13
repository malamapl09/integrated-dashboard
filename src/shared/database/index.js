const mysql = require('mysql2/promise');
const oracledb = require('oracledb');
const path = require('path');
const fs = require('fs');
const SQLiteConnectionPool = require('./connectionPool');
require('dotenv').config();

// Configure Oracle client path
const oracleClientPath = path.join(__dirname, '../../../oracle_client');
process.env.LD_LIBRARY_PATH = oracleClientPath;

// SQLite Configuration (for quotes, clients, users)
const dbPath = path.join(__dirname, '../../../data/database.sqlite');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Create SQLite connection pool
const sqlitePool = new SQLiteConnectionPool(dbPath, {
  maxConnections: 15,
  idleTimeout: 30000,
  busyTimeout: 30000
});

// MySQL Configuration (for PIM/products and user logs)
let mysqlPool = null;
if (process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE) {
  const mysqlConfig = {
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: process.env.MYSQL_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
    charset: 'utf8mb4'
  };

  mysqlPool = mysql.createPool(mysqlConfig);
  console.log('MySQL database connection configured for:', process.env.MYSQL_HOST);
} else {
  console.warn('MySQL configuration not found. Some features may be limited.');
}

// Oracle Configuration (for ERP/sales data)
let oraclePool = null;

async function initializeOracle() {
  if (process.env.ORACLE_HOST && process.env.ORACLE_USER && process.env.ORACLE_DATABASE) {
    try {
      // Initialize Oracle client library
      oracledb.initOracleClient({ libDir: oracleClientPath });
      
      const oracleConfig = {
        user: process.env.ORACLE_USER,
        password: process.env.ORACLE_PASSWORD,
        connectString: `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${process.env.ORACLE_HOST})(PORT=${process.env.ORACLE_PORT || 1521}))(CONNECT_DATA=(SID=${process.env.ORACLE_DATABASE})))`,
        poolMin: 2,
        poolMax: 10,
        poolIncrement: 1,
        poolTimeout: 60,
        stmtCacheSize: 30
      };

      // Create Oracle connection pool
      oraclePool = await oracledb.createPool(oracleConfig);
      console.log('Oracle database connection pool configured for:', process.env.ORACLE_HOST);
    } catch (error) {
      console.error('Oracle configuration failed:', error.message);
      console.warn('Oracle will not be available. Sales data will use fallback.');
    }
  } else {
    console.log('Oracle configuration not found. Sales data will use MySQL fallback.');
  }
}

// Database wrapper functions
const database = {
  // SQLite operations (quotes, clients, users)
  sqlite: {
    async execute(sql, params = []) {
      return await sqlitePool.execute(sql, params);
    },

    async getConnection() {
      const transaction = await sqlitePool.beginTransaction();
      return {
        async execute(sql, params = []) {
          return await transaction.execute(sql, params);
        },
        async beginTransaction() {
          return Promise.resolve();
        },
        async commit() {
          return await transaction.commit();
        },
        async rollback() {
          return await transaction.rollback();
        },
        release() {
          // Handled by transaction commit/rollback
        }
      };
    },

    getStats() {
      return sqlitePool.getStats();
    },

    async cleanup() {
      sqlitePool.cleanupIdleConnections();
    }
  },

  // MySQL operations (PIM, user logs)
  mysql: {
    async execute(sql, params = []) {
      if (!mysqlPool) {
        throw new Error('MySQL connection not configured');
      }
      return await mysqlPool.execute(sql, params);
    },

    async getConnection() {
      if (!mysqlPool) {
        throw new Error('MySQL connection not configured');
      }
      return await mysqlPool.getConnection();
    },

    getPool() {
      return mysqlPool;
    }
  },

  // Oracle operations (ERP, sales data)
  oracle: {
    async execute(sql, params = []) {
      if (!oraclePool) {
        throw new Error('Oracle connection not configured');
      }
      
      let connection;
      try {
        connection = await oraclePool.getConnection();
        const result = await connection.execute(sql, params, { 
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          autoCommit: true 
        });
        
        // Convert Oracle result format to MySQL-like format
        return [result.rows || [], result.metaData || []];
      } finally {
        if (connection) {
          await connection.close();
        }
      }
    },

    async getConnection() {
      if (!oraclePool) {
        throw new Error('Oracle connection not configured');
      }
      return await oraclePool.getConnection();
    },

    getPool() {
      return oraclePool;
    },

    isAvailable() {
      return oraclePool !== null;
    }
  }
};

// Create secure default admin user
async function createDefaultAdminUser() {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(path.join(__dirname, '../../data/database.sqlite'));
    
    // Check if any users exist
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    
    if (userCount.count === 0) {
      const crypto = require('crypto');
      const bcrypt = require('bcrypt');
      
      // Generate secure random password
      const defaultPassword = crypto.randomBytes(16).toString('hex');
      const passwordHash = await bcrypt.hash(defaultPassword, 12);
      
      // Insert default admin user
      const insertUser = db.prepare(`
        INSERT INTO users (username, email, password_hash, first_name, last_name, role)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      insertUser.run('admin', 'admin@plazalama.com', passwordHash, 'Admin', 'User', 'admin');
      
      console.log('🔐 DEFAULT ADMIN USER CREATED:');
      console.log('   Username: admin');
      console.log(`   Password: ${defaultPassword}`);
      console.log('   ⚠️  SAVE THIS PASSWORD - IT WILL NOT BE SHOWN AGAIN!');
    }
    
    db.close();
  } catch (error) {
    console.error('Error creating default admin user:', error);
  }
}

// Initialize SQLite database schema
async function initializeSQLiteDatabase() {
  return new Promise((resolve, reject) => {
    const schema = `
      -- Users table (authentication and authorization)
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        active BOOLEAN DEFAULT 1,
        last_login DATETIME,
        password_changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        FOREIGN KEY (created_by) REFERENCES users(id)
      );

      -- User sessions table (for token management)
      CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_id TEXT UNIQUE NOT NULL,
        refresh_token TEXT UNIQUE NOT NULL,
        expires_at DATETIME NOT NULL,
        refresh_expires_at DATETIME NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- Clients table
      CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        company TEXT,
        address TEXT,
        rnc TEXT,
        active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        FOREIGN KEY (created_by) REFERENCES users(id)
      );

      -- Quotes table
      CREATE TABLE IF NOT EXISTS quotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_number TEXT UNIQUE NOT NULL,
        client_id INTEGER NOT NULL,
        subtotal DECIMAL(10, 2) NOT NULL,
        itbis DECIMAL(10, 2) DEFAULT 0,
        total DECIMAL(10, 2) NOT NULL,
        notes TEXT,
        valid_until DATE,
        status TEXT DEFAULT 'draft',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        updated_by INTEGER,
        FOREIGN KEY (client_id) REFERENCES clients(id),
        FOREIGN KEY (created_by) REFERENCES users(id),
        FOREIGN KEY (updated_by) REFERENCES users(id)
      );

      -- Quote items table
      CREATE TABLE IF NOT EXISTS quote_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_id INTEGER NOT NULL,
        product_id TEXT NOT NULL,
        product_ean TEXT,
        product_name TEXT,
        product_description TEXT,
        quantity DECIMAL(10, 3) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        itbis DECIMAL(10, 2) DEFAULT 0,
        total DECIMAL(10, 2) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);
      CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(active);
      CREATE INDEX IF NOT EXISTS idx_quotes_client_id ON quotes(client_id);
      CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at);
      CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id ON quote_items(quote_id);

      -- Create default admin user (only if no users exist)
      -- Note: Password will be generated dynamically and logged to console on first run

      -- Sample client (only if no clients exist)
      INSERT INTO clients (name, email, phone, company, address, rnc) 
      SELECT 'Mario Lama', 'mario@example.com', '(809) 123-4567', 'Empresa Demo', 'Santo Domingo, República Dominicana', '101-12345-6'
      WHERE NOT EXISTS (SELECT 1 FROM clients LIMIT 1);
    `;

    // Using raw SQLite connection for schema creation
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening SQLite database:', err.message);
        reject(err);
      } else {
        db.exec(schema, async (err) => {
          if (err) {
            console.error('Error initializing SQLite database:', err.message);
            reject(err);
          } else {
            console.log('SQLite database initialized successfully');
            
            // Create secure default admin user if no users exist
            await createDefaultAdminUser();
            
            resolve();
          }
          db.close();
        });
      }
    });
  });
}

// Test all database connections
async function testConnections() {
  try {
    // Test SQLite
    await initializeSQLiteDatabase();
    console.log('SQLite database connection test successful');
    
    // Initialize and test Oracle
    await initializeOracle();
    if (oraclePool) {
      try {
        const [rows] = await database.oracle.execute('SELECT 1 as test FROM DUAL');
        console.log('Oracle database connected successfully!');
      } catch (error) {
        console.error('Oracle database connection failed:', error.message);
        console.warn('Oracle connection will not be available. Sales will use MySQL fallback.');
        oraclePool = null; // Clear failed pool
      }
    }
    
    // Test MySQL if configured
    if (mysqlPool) {
      try {
        const connection = await mysqlPool.getConnection();
        const [rows] = await connection.execute('SELECT 1 as test');
        console.log('MySQL database connected successfully!');
        connection.release();
      } catch (error) {
        console.error('MySQL database connection failed:', error.message);
        console.warn('Will use limited functionality without MySQL');
      }
    } else {
      console.log('MySQL database not configured');
    }
    
  } catch (error) {
    console.error('Database connection test failed:', error.message);
    throw error;
  }
}

module.exports = { 
  database,
  testConnections,
  initializeSQLiteDatabase
};