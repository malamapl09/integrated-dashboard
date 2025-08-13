const { database } = require('../../shared/database');
const exportService = require('../../shared/services/exportService');
const moment = require('moment');

class QuotesExportController {
  constructor() {
    this.db = database.sqlite;
  }

  /**
   * Export quotes list to Excel
   */
  async exportQuotesExcel(req, res) {
    try {
      const { status, client_id, date_from, date_to } = req.query;

      let whereClause = '1=1';
      const params = [];

      if (status) {
        whereClause += ' AND q.status = ?';
        params.push(status);
      }

      if (client_id) {
        whereClause += ' AND q.client_id = ?';
        params.push(client_id);
      }

      if (date_from) {
        whereClause += ' AND DATE(q.created_at) >= ?';
        params.push(date_from);
      }

      if (date_to) {
        whereClause += ' AND DATE(q.created_at) <= ?';
        params.push(date_to);
      }

      const query = `
        SELECT 
          q.quote_number as 'Quote Number',
          c.name as 'Client Name',
          c.email as 'Client Email',
          c.company as 'Company',
          q.subtotal as 'Subtotal',
          q.itbis as 'ITBIS',
          q.total as 'Total',
          q.status as 'Status',
          q.valid_until as 'Valid Until',
          q.created_at as 'Created Date',
          (SELECT username FROM users WHERE id = q.created_by) as 'Created By'
        FROM quotes q
        JOIN clients c ON q.client_id = c.id
        WHERE ${whereClause}
        ORDER BY q.created_at DESC
      `;

      const [quotes] = await this.db.execute(query, params);

      const excelBuffer = exportService.generateExcel({
        title: 'Quotes Report',
        data: quotes,
        sheetName: 'Quotes',
        metadata: {
          generatedBy: `${req.user.first_name} ${req.user.last_name}`,
          dateGenerated: new Date(),
          totalRecords: quotes.length
        }
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=quotes_${moment().format('YYYY-MM-DD')}.xlsx`);
      res.send(excelBuffer);

    } catch (error) {
      console.error('Error exporting quotes to Excel:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export quotes to Excel'
      });
    }
  }

  /**
   * Export quotes list to PDF
   */
  async exportQuotesPDF(req, res) {
    try {
      const { status, client_id, date_from, date_to } = req.query;

      let whereClause = '1=1';
      const params = [];

      if (status) {
        whereClause += ' AND q.status = ?';
        params.push(status);
      }

      if (client_id) {
        whereClause += ' AND q.client_id = ?';
        params.push(client_id);
      }

      if (date_from) {
        whereClause += ' AND DATE(q.created_at) >= ?';
        params.push(date_from);
      }

      if (date_to) {
        whereClause += ' AND DATE(q.created_at) <= ?';
        params.push(date_to);
      }

      const query = `
        SELECT 
          q.quote_number,
          c.name as client_name,
          c.company,
          q.total,
          q.status,
          q.valid_until,
          q.created_at
        FROM quotes q
        JOIN clients c ON q.client_id = c.id
        WHERE ${whereClause}
        ORDER BY q.created_at DESC
      `;

      const [quotes] = await this.db.execute(query, params);

      const columns = [
        { key: 'quote_number', header: 'Quote #', align: 'left' },
        { key: 'client_name', header: 'Client', align: 'left' },
        { key: 'company', header: 'Company', align: 'left' },
        { key: 'total', header: 'Total', align: 'right', type: 'currency' },
        { key: 'status', header: 'Status', align: 'center' },
        { key: 'created_at', header: 'Date', align: 'center', type: 'date' }
      ];

      const pdfBuffer = await exportService.generatePDF({
        title: 'Quotes Report',
        data: quotes,
        columns: columns,
        metadata: {
          generatedBy: `${req.user.first_name} ${req.user.last_name}`,
          dateGenerated: new Date(),
          totalRecords: quotes.length
        }
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=quotes_${moment().format('YYYY-MM-DD')}.pdf`);
      res.send(pdfBuffer);

    } catch (error) {
      console.error('Error exporting quotes to PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export quotes to PDF'
      });
    }
  }

  /**
   * Export single quote as PDF
   */
  async exportQuotePDF(req, res) {
    try {
      const { id } = req.params;

      // Get quote details
      const [quotes] = await this.db.execute(
        `SELECT q.*, c.name as client_name, c.email, c.phone, c.company, c.address
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
      const client = {
        name: quote.client_name,
        email: quote.email,
        phone: quote.phone,
        company: quote.company,
        address: quote.address
      };

      const pdfBuffer = await exportService.generateQuotePDF(quote, client, items);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=quote_${quote.quote_number}.pdf`);
      res.send(pdfBuffer);

    } catch (error) {
      console.error('Error exporting quote PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export quote PDF'
      });
    }
  }

  /**
   * Export clients list to Excel
   */
  async exportClientsExcel(req, res) {
    try {
      const [clients] = await this.db.execute(`
        SELECT 
          name as 'Client Name',
          email as 'Email',
          phone as 'Phone',
          company as 'Company',
          address as 'Address',
          rnc as 'RNC',
          created_at as 'Created Date',
          (SELECT COUNT(*) FROM quotes WHERE client_id = clients.id) as 'Total Quotes',
          (SELECT COALESCE(SUM(total), 0) FROM quotes WHERE client_id = clients.id) as 'Total Value'
        FROM clients 
        WHERE active = 1
        ORDER BY name
      `);

      const excelBuffer = exportService.generateExcel({
        title: 'Clients Report',
        data: clients,
        sheetName: 'Clients',
        metadata: {
          generatedBy: `${req.user.first_name} ${req.user.last_name}`,
          dateGenerated: new Date(),
          totalRecords: clients.length
        }
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=clients_${moment().format('YYYY-MM-DD')}.xlsx`);
      res.send(excelBuffer);

    } catch (error) {
      console.error('Error exporting clients to Excel:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export clients to Excel'
      });
    }
  }

  /**
   * Export sales summary to PDF
   */
  async exportSalesSummaryPDF(req, res) {
    try {
      const [summary] = await this.db.execute(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as quotes_count,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_quotes,
          SUM(CASE WHEN status = 'approved' THEN total ELSE 0 END) as approved_value,
          SUM(total) as total_value
        FROM quotes 
        WHERE created_at >= DATE('now', '-30 days')
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `);

      const columns = [
        { key: 'date', header: 'Date', align: 'left', type: 'date' },
        { key: 'quotes_count', header: 'Quotes', align: 'center', type: 'number' },
        { key: 'approved_quotes', header: 'Approved', align: 'center', type: 'number' },
        { key: 'approved_value', header: 'Approved Value', align: 'right', type: 'currency' },
        { key: 'total_value', header: 'Total Value', align: 'right', type: 'currency' }
      ];

      const pdfBuffer = await exportService.generatePDF({
        title: 'Sales Summary Report (Last 30 Days)',
        data: summary,
        columns: columns,
        metadata: {
          generatedBy: `${req.user.first_name} ${req.user.last_name}`,
          dateGenerated: new Date(),
          totalRecords: summary.length
        }
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=sales_summary_${moment().format('YYYY-MM-DD')}.pdf`);
      res.send(pdfBuffer);

    } catch (error) {
      console.error('Error exporting sales summary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export sales summary'
      });
    }
  }
}

module.exports = QuotesExportController;