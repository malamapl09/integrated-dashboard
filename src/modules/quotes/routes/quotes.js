const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { generateQuotePDF } = require('../services/pdfGenerator');
const emailService = require('../services/emailService');
const quoteWorkflowService = require('../services/quoteWorkflowService');
const inventoryService = require('../services/inventoryService');
const cache = require('../utils/cache');
const { authenticate, authorize, validateOwnership } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const cacheKey = `quotes:${userRole}:${userId}`;
    
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    let query = `
      SELECT q.*, c.name as client_name, c.company as client_company,
             u.first_name as creator_first_name, u.last_name as creator_last_name
      FROM quotes q
      LEFT JOIN clients c ON q.client_id = c.id
      LEFT JOIN users u ON q.created_by = u.id
    `;
    let params = [];

    // Filter by user permissions
    if (userRole === 'user') {
      query += ' WHERE q.created_by = ?';
      params.push(userId);
    }
    // Admins and managers can see all quotes

    query += ' ORDER BY q.created_at DESC';

    const [rows] = await pool.execute(query, params);
    
    // Cache for 2 minutes
    cache.set(cacheKey, rows, 120);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching quotes:', error);
    res.status(500).json({ error: 'Failed to fetch quotes' });
  }
});

router.get('/:id', authenticate, validateOwnership('quote'), async (req, res) => {
  try {
    const [quoteRows] = await pool.execute(`
      SELECT q.*, c.*
      FROM quotes q
      LEFT JOIN clients c ON q.client_id = c.id
      WHERE q.id = ?
    `, [req.params.id]);

    if (quoteRows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const [itemRows] = await pool.execute(`
      SELECT qi.*, qi.product_name, qi.product_description, qi.product_ean as ean
      FROM quote_items qi
      WHERE qi.quote_id = ?
      ORDER BY qi.id
    `, [req.params.id]);

    const quote = {
      ...quoteRows[0],
      items: itemRows
    };

    res.json(quote);
  } catch (error) {
    console.error('Error fetching quote:', error);
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

router.post('/', authenticate, async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { client_id, items, notes, valid_until } = req.body;
    console.log('Creating quote with data:', { client_id, items: items?.length, notes, valid_until });
    
    if (!client_id || !items || items.length === 0) {
      return res.status(400).json({ error: 'Client and items are required' });
    }

    let subtotal = 0;
    let itbis = 0;

    items.forEach(item => {
      const itemTotal = item.quantity * item.price;
      subtotal += itemTotal;
      itbis += item.itbis || 0;
    });

    const total = subtotal + itbis;

    const [quoteResult] = await connection.execute(
      'INSERT INTO quotes (client_id, subtotal, itbis, total, notes, valid_until, created_at, quote_number, created_by) VALUES (?, ?, ?, ?, ?, ?, datetime("now"), ?, ?)',
      [client_id, subtotal, itbis, total, notes, valid_until, `Q${Date.now()}`, req.user.id]
    );

    const quoteId = quoteResult.insertId;

    for (const item of items) {
      console.log('Inserting quote item:', item);
      const insertData = [
        quoteId, 
        item.product_id || item.id, 
        item.ean || item.product_ean, 
        item.name || item.product_name, 
        item.description || item.product_description || '', 
        item.quantity, 
        item.price, 
        item.itbis || 0, 
        item.quantity * item.price + (item.itbis || 0)
      ];
      console.log('Insert parameters:', insertData);
      
      await connection.execute(
        'INSERT INTO quote_items (quote_id, product_id, product_ean, product_name, product_description, quantity, price, itbis, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        insertData
      );
    }

    await connection.commit();

    // Invalidate quotes cache
    cache.delete('quotes:all');

    const [newQuote] = await connection.execute(`
      SELECT q.*, c.*
      FROM quotes q
      LEFT JOIN clients c ON q.client_id = c.id
      WHERE q.id = ?
    `, [quoteId]);

    // Check stock availability and optionally reserve stock
    if (items && items.length > 0) {
      try {
        const stockCheck = await inventoryService.checkQuoteStockAvailability(items);
        
        // Log stock availability info
        console.log(`Stock check for quote ${newQuote[0].quote_number}:`, {
          overall_available: stockCheck.overall_available,
          items_with_issues: stockCheck.items.filter(item => !item.is_available).length
        });

        // If stock reservations are enabled, reserve stock for new quotes
        const stockReservationsEnabled = true; // Could be from settings
        if (stockReservationsEnabled && stockCheck.overall_available) {
          try {
            await inventoryService.reserveStockForQuote(quoteId, items, 30);
            console.log(`Stock reserved for quote ${newQuote[0].quote_number}`);
          } catch (reservationError) {
            console.warn('Failed to reserve stock:', reservationError.message);
            // Don't fail the quote creation, just log the warning
          }
        }
      } catch (stockError) {
        console.warn('Stock check failed for quote:', stockError.message);
        // Don't fail the quote creation, just log the warning
      }
    }

    res.status(201).json(newQuote[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Error creating quote:', error);
    res.status(500).json({ error: 'Failed to create quote' });
  } finally {
    connection.release();
  }
});

router.get('/:id/pdf', authenticate, validateOwnership('quote'), async (req, res) => {
  try {
    const [quoteRows] = await pool.execute(`
      SELECT q.*, c.name as client_name, c.email as client_email, c.phone as client_phone, 
             c.company as client_company, c.address as client_address, c.rnc as client_rnc
      FROM quotes q
      LEFT JOIN clients c ON q.client_id = c.id
      WHERE q.id = ?
    `, [req.params.id]);

    if (quoteRows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const [itemRows] = await pool.execute(`
      SELECT qi.*, qi.product_name, qi.product_description, qi.product_ean as ean
      FROM quote_items qi
      WHERE qi.quote_id = ?
      ORDER BY qi.id
    `, [req.params.id]);

    const quote = {
      ...quoteRows[0],
      items: itemRows
    };

    const pdfBuffer = await generateQuotePDF(quote);
    
    const clientName = (quote.client_company || quote.client_name || 'Cliente')
      .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .substring(0, 30); // Limit length
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="cotizacion_${quote.quote_number}_${clientName}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// Send quote via email
router.post('/:id/email', 
  authenticate, 
  validateOwnership('quote'),
  [
    body('recipientEmail').isEmail().withMessage('Email válido es requerido'),
    body('subject').optional().isLength({ max: 200 }).withMessage('El asunto no puede exceder 200 caracteres'),
    body('customMessage').optional().isLength({ max: 1000 }).withMessage('El mensaje no puede exceder 1000 caracteres')
  ],
  async (req, res) => {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const quoteId = req.params.id;
      const { recipientEmail, subject, customMessage, useQueue = false } = req.body;

      // Check if email service is configured
      if (!emailService.isConfigured()) {
        return res.status(503).json({
          error: 'Email service not configured',
          message: 'El servicio de correo no está configurado. Contacte al administrador.'
        });
      }

      // Get quote with full details
      const [quoteRows] = await pool.execute(`
        SELECT q.*, c.name as client_name, c.email as client_email, c.phone as client_phone, 
               c.company as client_company, c.address as client_address, c.rnc as client_rnc
        FROM quotes q
        LEFT JOIN clients c ON q.client_id = c.id
        WHERE q.id = ?
      `, [quoteId]);

      if (quoteRows.length === 0) {
        return res.status(404).json({ error: 'Quote not found' });
      }

      const [itemRows] = await pool.execute(`
        SELECT qi.*, qi.product_name, qi.product_description, qi.product_ean as ean
        FROM quote_items qi
        WHERE qi.quote_id = ?
        ORDER BY qi.id
      `, [quoteId]);

      const quote = {
        ...quoteRows[0],
        items: itemRows
      };

      // Generate PDF
      const pdfBuffer = await generateQuotePDF(quote);

      // Prepare client data
      const clientData = {
        name: quote.client_name,
        email: recipientEmail, // Use provided email instead of client's default
        company: quote.client_company,
        phone: quote.client_phone,
        address: quote.client_address,
        rnc: quote.client_rnc
      };

      // Prepare sender data
      const senderData = {
        firstName: req.user.firstName || 'Usuario',
        lastName: req.user.lastName || 'Sistema',
        email: req.user.email,
        userId: req.user.id
      };

      // Email options
      const emailOptions = {
        subject: subject || undefined, // Use default if not provided
        customMessage: customMessage || undefined,
        senderName: `${senderData.firstName} ${senderData.lastName}`
      };

      // Send email
      const result = await emailService.sendQuoteEmail(
        quote, 
        clientData, 
        senderData, 
        pdfBuffer, 
        emailOptions,
        useQueue
      );

      // Log email activity (you could store this in database for tracking)
      console.log(`Quote ${quote.quote_number} emailed to ${recipientEmail} by user ${req.user.id}`);

      res.json({
        success: true,
        message: 'Cotización enviada por correo exitosamente',
        details: {
          recipient: result.recipient,
          messageId: result.messageId,
          quoteNumber: quote.quote_number
        }
      });

    } catch (error) {
      console.error('Error sending quote email:', error);
      res.status(500).json({
        error: 'Failed to send email',
        message: error.message
      });
    }
  }
);

// Test email configuration
router.post('/test-email',
  authenticate,
  authorize(['admin']),
  [
    body('testEmail').isEmail().withMessage('Email válido es requerido')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { testEmail } = req.body;

      if (!emailService.isConfigured()) {
        return res.status(503).json({
          error: 'Email service not configured',
          message: 'El servicio de correo no está configurado.'
        });
      }

      const result = await emailService.sendTestEmail(
        testEmail, 
        `${req.user.firstName} ${req.user.lastName}`
      );

      res.json({
        success: true,
        message: 'Email de prueba enviado exitosamente',
        details: {
          recipient: testEmail,
          messageId: result.messageId
        }
      });

    } catch (error) {
      console.error('Error sending test email:', error);
      res.status(500).json({
        error: 'Failed to send test email',
        message: error.message
      });
    }
  }
);

// Get email service status
router.get('/email-status', authenticate, (req, res) => {
  res.json({
    configured: emailService.isConfigured(),
    message: emailService.isConfigured() 
      ? 'Email service is configured and ready'
      : 'Email service is not configured. Check SMTP settings.'
  });
});

module.exports = router;