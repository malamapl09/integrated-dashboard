const SalesService = require('./salesService');
const exportService = require('../../shared/services/exportService');
const moment = require('moment');

class SalesExportController {
  constructor() {
    this.salesService = new SalesService();
  }

  /**
   * Export sales metrics to Excel
   */
  async exportSalesMetricsExcel(req, res) {
    try {
      const filters = {
        timeRange: req.query.timeRange || 'LAST_30_DAYS',
        storeId: req.query.storeId || null,
        dateFrom: req.query.dateFrom || null,
        dateTo: req.query.dateTo || null
      };

      const metrics = await this.salesService.getSalesMetrics(filters);
      const dailyTrends = await this.salesService.getDailyTrends(filters);

      // Prepare data for Excel export
      const metricsData = [{
        'Metric': 'Total Revenue',
        'Value': metrics.totalRevenue,
        'Currency': 'DOP'
      }, {
        'Metric': 'Total Orders',
        'Value': metrics.totalOrders,
        'Currency': ''
      }, {
        'Metric': 'Average Order Value',
        'Value': metrics.averageOrderValue,
        'Currency': 'DOP'
      }, {
        'Metric': 'Growth Rate',
        'Value': `${metrics.growthRate}%`,
        'Currency': ''
      }];

      const dailyData = dailyTrends.map(trend => ({
        'Date': trend.date,
        'Revenue': trend.revenue,
        'Orders': trend.orders,
        'Average Order Value': trend.averageOrderValue
      }));

      // Create workbook with multiple sheets
      const XLSX = require('xlsx');
      const workbook = XLSX.utils.book_new();

      // Metrics sheet
      const metricsWorksheet = XLSX.utils.json_to_sheet(metricsData);
      XLSX.utils.book_append_sheet(workbook, metricsWorksheet, 'Metrics');

      // Daily trends sheet
      const dailyWorksheet = XLSX.utils.json_to_sheet(dailyData);
      XLSX.utils.book_append_sheet(workbook, dailyWorksheet, 'Daily Trends');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=sales_metrics_${moment().format('YYYY-MM-DD')}.xlsx`);
      res.send(buffer);

    } catch (error) {
      console.error('Error exporting sales metrics to Excel:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export sales metrics to Excel'
      });
    }
  }

  /**
   * Export sales report to PDF
   */
  async exportSalesReportPDF(req, res) {
    try {
      const filters = {
        timeRange: req.query.timeRange || 'LAST_30_DAYS',
        storeId: req.query.storeId || null,
        dateFrom: req.query.dateFrom || null,
        dateTo: req.query.dateTo || null
      };

      const [metrics, dailyTrends, topProducts, storePerformance] = await Promise.all([
        this.salesService.getSalesMetrics(filters),
        this.salesService.getDailyTrends(filters),
        this.salesService.getTopProducts(filters),
        this.salesService.getStorePerformance(filters)
      ]);

      // Create comprehensive PDF report
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 50 });

      const pdfBuffer = await new Promise((resolve, reject) => {
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        try {
          // Title
          doc.fontSize(24).text('Sales Analytics Report', 50, 50, { align: 'center' });
          doc.fontSize(12).text(`Generated on ${moment().format('YYYY-MM-DD HH:mm:ss')}`, 50, 80, { align: 'center' });

          let yPos = 120;

          // Key Metrics Section
          doc.fontSize(16).text('Key Metrics', 50, yPos);
          yPos += 30;

          doc.fontSize(12)
             .text(`Total Revenue: ${new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(metrics.totalRevenue)}`, 50, yPos)
             .text(`Total Orders: ${metrics.totalOrders.toLocaleString()}`, 300, yPos);
          yPos += 20;

          doc.text(`Average Order Value: ${new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(metrics.averageOrderValue)}`, 50, yPos)
             .text(`Growth Rate: ${metrics.growthRate}%`, 300, yPos);
          yPos += 40;

          // Top Products Section
          doc.fontSize(16).text('Top Products', 50, yPos);
          yPos += 30;

          if (topProducts && topProducts.length > 0) {
            doc.fontSize(10).font('Helvetica-Bold');
            doc.text('Product', 50, yPos)
               .text('Revenue', 250, yPos)
               .text('Units Sold', 350, yPos)
               .text('Avg Price', 450, yPos);
            yPos += 20;

            doc.font('Helvetica').fontSize(9);
            topProducts.slice(0, 10).forEach(product => {
              doc.text(product.nombre || product.name, 50, yPos, { width: 180 })
                 .text(new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(product.revenue), 250, yPos)
                 .text(product.quantity ? product.quantity.toLocaleString() : 'N/A', 350, yPos)
                 .text(new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(product.averagePrice || 0), 450, yPos);
              yPos += 15;
            });
          }

          yPos += 30;

          // Store Performance Section (if available)
          if (storePerformance && storePerformance.length > 0) {
            doc.fontSize(16).text('Store Performance', 50, yPos);
            yPos += 30;

            doc.fontSize(10).font('Helvetica-Bold');
            doc.text('Store', 50, yPos)
               .text('Revenue', 200, yPos)
               .text('Orders', 300, yPos)
               .text('Growth', 400, yPos);
            yPos += 20;

            doc.font('Helvetica').fontSize(9);
            storePerformance.slice(0, 10).forEach(store => {
              doc.text(store.storeName || store.store_id, 50, yPos, { width: 130 })
                 .text(new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(store.revenue), 200, yPos)
                 .text(store.orders ? store.orders.toLocaleString() : 'N/A', 300, yPos)
                 .text(`${store.growthRate || 0}%`, 400, yPos);
              yPos += 15;
            });
          }

          doc.end();
        } catch (error) {
          reject(error);
        }
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=sales_report_${moment().format('YYYY-MM-DD')}.pdf`);
      res.send(pdfBuffer);

    } catch (error) {
      console.error('Error exporting sales report to PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export sales report to PDF'
      });
    }
  }

  /**
   * Export top products to Excel
   */
  async exportTopProductsExcel(req, res) {
    try {
      const filters = {
        timeRange: req.query.timeRange || 'LAST_30_DAYS',
        storeId: req.query.storeId || null,
        dateFrom: req.query.dateFrom || null,
        dateTo: req.query.dateTo || null,
        limit: 100 // Get more products for export
      };

      const topProducts = await this.salesService.getTopProducts(filters);

      const exportData = topProducts.map((product, index) => ({
        'Rank': index + 1,
        'Product Code': product.codigo || 'N/A',
        'Product Name': product.nombre || product.name,
        'Category': product.categoria || product.category || 'N/A',
        'Units Sold': product.quantity || 0,
        'Revenue': product.revenue || 0,
        'Average Price': product.averagePrice || (product.revenue / (product.quantity || 1)),
        'Percentage of Total': product.percentage || 0
      }));

      const excelBuffer = exportService.generateExcel({
        title: 'Top Products Report',
        data: exportData,
        sheetName: 'Top Products',
        metadata: {
          generatedBy: `${req.user.first_name} ${req.user.last_name}`,
          dateGenerated: new Date(),
          totalRecords: exportData.length,
          filters: JSON.stringify(filters)
        }
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=top_products_${moment().format('YYYY-MM-DD')}.xlsx`);
      res.send(excelBuffer);

    } catch (error) {
      console.error('Error exporting top products to Excel:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export top products to Excel'
      });
    }
  }

  /**
   * Export daily trends to Excel
   */
  async exportDailyTrendsExcel(req, res) {
    try {
      const filters = {
        timeRange: req.query.timeRange || 'LAST_30_DAYS',
        storeId: req.query.storeId || null,
        dateFrom: req.query.dateFrom || null,
        dateTo: req.query.dateTo || null
      };

      const dailyTrends = await this.salesService.getDailyTrends(filters);

      const exportData = dailyTrends.map(trend => ({
        'Date': trend.date,
        'Revenue': trend.revenue,
        'Orders': trend.orders,
        'Average Order Value': trend.averageOrderValue,
        'Growth Rate': trend.growthRate || 0,
        'Day of Week': moment(trend.date).format('dddd')
      }));

      const excelBuffer = exportService.generateExcel({
        title: 'Daily Sales Trends',
        data: exportData,
        sheetName: 'Daily Trends',
        metadata: {
          generatedBy: `${req.user.first_name} ${req.user.last_name}`,
          dateGenerated: new Date(),
          totalRecords: exportData.length
        }
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=daily_trends_${moment().format('YYYY-MM-DD')}.xlsx`);
      res.send(excelBuffer);

    } catch (error) {
      console.error('Error exporting daily trends to Excel:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export daily trends to Excel'
      });
    }
  }

  /**
   * Export store performance to Excel
   */
  async exportStorePerformanceExcel(req, res) {
    try {
      const filters = {
        timeRange: req.query.timeRange || 'LAST_30_DAYS',
        dateFrom: req.query.dateFrom || null,
        dateTo: req.query.dateTo || null
      };

      const storePerformance = await this.salesService.getStorePerformance(filters);

      const exportData = storePerformance.map((store, index) => ({
        'Rank': index + 1,
        'Store ID': store.store_id || store.storeId,
        'Store Name': store.storeName || `Store ${store.store_id}`,
        'Revenue': store.revenue,
        'Orders': store.orders,
        'Average Order Value': store.averageOrderValue,
        'Growth Rate': store.growthRate || 0,
        'Market Share': store.marketShare || 0
      }));

      const excelBuffer = exportService.generateExcel({
        title: 'Store Performance Report',
        data: exportData,
        sheetName: 'Store Performance',
        metadata: {
          generatedBy: `${req.user.first_name} ${req.user.last_name}`,
          dateGenerated: new Date(),
          totalRecords: exportData.length
        }
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=store_performance_${moment().format('YYYY-MM-DD')}.xlsx`);
      res.send(excelBuffer);

    } catch (error) {
      console.error('Error exporting store performance to Excel:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export store performance to Excel'
      });
    }
  }
}

module.exports = SalesExportController;