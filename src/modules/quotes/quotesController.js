const { database } = require('../../shared/database');

class QuotesController {
  constructor() {
    this.db = database.sqlite;
  }

  /**
   * Get all quotes
   */
  async getQuotes(req, res) {
    try {
      const { page = 1, limit = 10, status, client_id } = req.query;
      const offset = (page - 1) * limit;

      let whereClause = '';
      const params = [];

      if (status) {
        whereClause += 'WHERE status = ?';
        params.push(status);
      }

      if (client_id) {
        whereClause += whereClause ? ' AND client_id = ?' : 'WHERE client_id = ?';
        params.push(client_id);
      }

      const countQuery = `SELECT COUNT(*) as total FROM quotes ${whereClause}`;
      const [countResult] = await this.db.execute(countQuery, params);
      const total = countResult[0].total;

      const quotesQuery = `
        SELECT q.*, c.name as client_name, c.email as client_email
        FROM quotes q
        JOIN clients c ON q.client_id = c.id
        ${whereClause}
        ORDER BY q.created_at DESC
        LIMIT ? OFFSET ?
      `;

      const [quotes] = await this.db.execute(quotesQuery, [...params, parseInt(limit), offset]);

      res.json({
        success: true,
        data: {
          quotes,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('Error fetching quotes:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch quotes'
      });
    }
  }

  /**
   * Get quote by ID
   */
  async getQuoteById(req, res) {
    try {
      const { id } = req.params;

      const [quotes] = await this.db.execute(
        `SELECT q.*, c.name as client_name, c.email as client_email, c.phone, c.company
         FROM quotes q
         JOIN clients c ON q.client_id = c.id
         WHERE q.id = ?`,
        [id]
      );

      if (!quotes.length) {
        return res.status(404).json({
          success: false,
          message: 'Quote not found'
        });
      }

      // Get quote items
      const [items] = await this.db.execute(
        'SELECT * FROM quote_items WHERE quote_id = ? ORDER BY id',
        [id]
      );

      const quote = quotes[0];
      quote.items = items;

      res.json({
        success: true,
        data: quote
      });
    } catch (error) {
      console.error('Error fetching quote:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch quote'
      });
    }
  }

  /**
   * Create new quote
   */
  async createQuote(req, res) {
    try {
      const { client_id, items, notes, valid_until } = req.body;
      const user_id = req.user.id;

      if (!client_id || !items || !items.length) {
        return res.status(400).json({
          success: false,
          message: 'Client ID and items are required'
        });
      }

      // Calculate totals
      let subtotal = 0;
      let totalItbis = 0;

      for (const item of items) {
        const itemTotal = parseFloat(item.quantity) * parseFloat(item.price);
        const itemItbis = itemTotal * 0.18; // 18% ITBIS
        subtotal += itemTotal;
        totalItbis += itemItbis;
      }

      const total = subtotal + totalItbis;

      // Generate quote number
      const [lastQuote] = await this.db.execute(
        'SELECT quote_number FROM quotes ORDER BY id DESC LIMIT 1'
      );

      let nextNumber = 1;
      if (lastQuote.length > 0) {
        const lastNumber = parseInt(lastQuote[0].quote_number.replace('COT-', ''));
        nextNumber = lastNumber + 1;
      }

      const quoteNumber = `COT-${nextNumber.toString().padStart(6, '0')}`;

      // Insert quote
      const [quoteResult] = await this.db.execute(
        `INSERT INTO quotes (quote_number, client_id, subtotal, itbis, total, notes, valid_until, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [quoteNumber, client_id, subtotal, totalItbis, total, notes, valid_until, user_id, user_id]
      );

      const quoteId = quoteResult.insertId;

      // Insert quote items
      for (const item of items) {
        const itemTotal = parseFloat(item.quantity) * parseFloat(item.price);
        const itemItbis = itemTotal * 0.18;

        await this.db.execute(
          `INSERT INTO quote_items (quote_id, product_id, product_ean, product_name, product_description, quantity, price, itbis, total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [quoteId, item.product_id || '', item.product_ean || '', item.product_name, item.product_description || '', item.quantity, item.price, itemItbis, itemTotal + itemItbis]
        );
      }

      res.status(201).json({
        success: true,
        data: {
          id: quoteId,
          quote_number: quoteNumber,
          total
        },
        message: 'Quote created successfully'
      });
    } catch (error) {
      console.error('Error creating quote:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to create quote'
      });
    }
  }

  /**
   * Update quote
   */
  async updateQuote(req, res) {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;
      const user_id = req.user.id;

      const [result] = await this.db.execute(
        'UPDATE quotes SET status = ?, notes = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, notes, user_id, id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Quote not found'
        });
      }

      res.json({
        success: true,
        message: 'Quote updated successfully'
      });
    } catch (error) {
      console.error('Error updating quote:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update quote'
      });
    }
  }

  /**
   * Get clients
   */
  async getClients(req, res) {
    try {
      const [clients] = await this.db.execute(
        'SELECT * FROM clients WHERE active = 1 ORDER BY name'
      );

      res.json({
        success: true,
        data: clients
      });
    } catch (error) {
      console.error('Error fetching clients:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch clients'
      });
    }
  }

  /**
   * Create client
   */
  async createClient(req, res) {
    try {
      const { name, email, phone, company, address, rnc } = req.body;
      const user_id = req.user.id;

      if (!name || !email) {
        return res.status(400).json({
          success: false,
          message: 'Name and email are required'
        });
      }

      const [result] = await this.db.execute(
        'INSERT INTO clients (name, email, phone, company, address, rnc, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [name, email, phone, company, address, rnc, user_id]
      );

      res.status(201).json({
        success: true,
        data: { id: result.insertId },
        message: 'Client created successfully'
      });
    } catch (error) {
      console.error('Error creating client:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to create client'
      });
    }
  }

  /**
   * Get quote statistics
   */
  async getStats(req, res) {
    try {
      const [totalQuotes] = await this.db.execute('SELECT COUNT(*) as count FROM quotes');
      const [pendingQuotes] = await this.db.execute("SELECT COUNT(*) as count FROM quotes WHERE status = 'draft'");
      const [approvedQuotes] = await this.db.execute("SELECT COUNT(*) as count FROM quotes WHERE status = 'approved'");
      const [totalValue] = await this.db.execute('SELECT COALESCE(SUM(total), 0) as total FROM quotes');

      res.json({
        success: true,
        data: {
          totalQuotes: totalQuotes[0].count,
          pendingQuotes: pendingQuotes[0].count,
          approvedQuotes: approvedQuotes[0].count,
          totalValue: parseFloat(totalValue[0].total)
        }
      });
    } catch (error) {
      console.error('Error fetching quote stats:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch quote statistics'
      });
    }
  }

  /**
   * Search products for quotes
   */
  async searchProducts(req, res) {
    try {
      const { search } = req.query;
      
      if (!search || search.trim().length < 1) {
        return res.json({
          success: true,
          data: []
        });
      }

      const searchTerm = `%${search.trim()}%`;
      
      // Search in MySQL products table if available
      const { database } = require('../../shared/database');
      if (database.mysql) {
        const [products] = await database.mysql.execute(
          `SELECT wp.sku as id, wp.sku as ean, wp.title as name, wp.description, wp.price, 
                  (wp.price * 1.18) as price_with_tax, 
                  (wp.price * 0.18) as itbis,
                  COALESCE(wi.stock_quantity, 0) as stock_quantity
           FROM web_products wp
           LEFT JOIN web_inventory wi ON wp.sku = wi.sku
           WHERE (wp.title LIKE ? OR wp.sku LIKE ? OR wp.description LIKE ?) 
           AND wp.borrado = 0 
           ORDER BY wp.title 
           LIMIT 50`,
          [searchTerm, searchTerm, searchTerm]
        );

        res.json({
          success: true,
          data: products
        });
      } else {
        // Return mock data if no database connection
        res.json({
          success: true,
          data: []
        });
      }
    } catch (error) {
      console.error('Error searching products:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to search products'
      });
    }
  }
}

module.exports = QuotesController;