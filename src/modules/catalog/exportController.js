const CatalogService = require('./catalogService');
const exportService = require('../../shared/services/exportService');
const moment = require('moment');

class CatalogExportController {
  constructor() {
    this.catalogService = new CatalogService();
  }

  /**
   * Export ERP vs PIM comparison to Excel
   */
  async exportERPvsPIMExcel(req, res) {
    try {
      const comparison = await this.catalogService.getERPvsPIMComparison();

      const exportData = comparison.products.map(product => ({
        'SKU': product.sku,
        'Product Name': product.name,
        'Status': product.status,
        'ERP Stock': product.erpStock || 0,
        'PIM Stock': product.pimStock || 0,
        'Stock Difference': product.stockDifference || 0,
        'ERP Price': product.erpPrice || 0,
        'PIM Price': product.pimPrice || 0,
        'Price Difference': product.priceDifference || 0,
        'Last Updated ERP': product.erpLastUpdated || 'N/A',
        'Last Updated PIM': product.pimLastUpdated || 'N/A',
        'Action Required': product.actionRequired || 'None'
      }));

      // Add summary data
      const summaryData = [
        { 'Metric': 'Total Products Analyzed', 'Value': comparison.summary.totalProducts },
        { 'Metric': 'Products in Sync', 'Value': comparison.summary.inSync },
        { 'Metric': 'Products Out of Sync', 'Value': comparison.summary.outOfSync },
        { 'Metric': 'Only in ERP', 'Value': comparison.summary.onlyInERP },
        { 'Metric': 'Only in PIM', 'Value': comparison.summary.onlyInPIM },
        { 'Metric': 'Sync Percentage', 'Value': `${comparison.summary.syncPercentage}%` }
      ];

      // Create workbook with multiple sheets
      const XLSX = require('xlsx');
      const workbook = XLSX.utils.book_new();

      // Summary sheet
      const summaryWorksheet = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Summary');

      // Detailed comparison sheet
      const comparisonWorksheet = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(workbook, comparisonWorksheet, 'Product Comparison');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=erp_pim_comparison_${moment().format('YYYY-MM-DD')}.xlsx`);
      res.send(buffer);

    } catch (error) {
      console.error('Error exporting ERP vs PIM comparison to Excel:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export ERP vs PIM comparison to Excel'
      });
    }
  }

  /**
   * Export category-based comparison to Excel
   */
  async exportCategoryComparisonExcel(req, res) {
    try {
      const categoryComparison = await this.catalogService.getCategoryBasedComparison();

      const exportData = [];

      categoryComparison.categories.forEach(category => {
        category.products.forEach(product => {
          exportData.push({
            'Category': category.area,
            'SKU': product.sku,
            'Product Name': product.name,
            'Status': product.status,
            'Stock Level': product.stock || 0,
            'Price': product.price || 0,
            'Stock Threshold': category.threshold,
            'Days Since Update': product.daysSinceUpdate || 0,
            'Action Required': product.actionRequired || 'None',
            'Priority': product.priority || 'Low'
          });
        });
      });

      // Add category summary
      const categorySummary = categoryComparison.categories.map(category => ({
        'Category': category.area,
        'Total Products': category.totalProducts,
        'Active Products': category.activeProducts,
        'Obsolete Products': category.obsoleteProducts,
        'Stock Threshold': category.threshold,
        'Average Stock Level': category.averageStock || 0,
        'Last Sync Date': category.lastSyncDate || 'N/A'
      }));

      // Create workbook with multiple sheets
      const XLSX = require('xlsx');
      const workbook = XLSX.utils.book_new();

      // Category summary sheet
      const summaryWorksheet = XLSX.utils.json_to_sheet(categorySummary);
      XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Category Summary');

      // Detailed products sheet
      const productsWorksheet = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(workbook, productsWorksheet, 'Products by Category');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=category_comparison_${moment().format('YYYY-MM-DD')}.xlsx`);
      res.send(buffer);

    } catch (error) {
      console.error('Error exporting category comparison to Excel:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export category comparison to Excel'
      });
    }
  }

  /**
   * Export catalog status report to PDF
   */
  async exportCatalogStatusPDF(req, res) {
    try {
      const [erpPimComparison, categoryComparison] = await Promise.all([
        this.catalogService.getERPvsPIMComparison(),
        this.catalogService.getCategoryBasedComparison()
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
          doc.fontSize(24).text('Catalog Status Report', 50, 50, { align: 'center' });
          doc.fontSize(12).text(`Generated on ${moment().format('YYYY-MM-DD HH:mm:ss')}`, 50, 80, { align: 'center' });

          let yPos = 120;

          // ERP vs PIM Summary Section
          doc.fontSize(16).text('ERP vs PIM Synchronization Status', 50, yPos);
          yPos += 30;

          doc.fontSize(12)
             .text(`Total Products: ${erpPimComparison.summary.totalProducts}`, 50, yPos)
             .text(`Sync Percentage: ${erpPimComparison.summary.syncPercentage}%`, 300, yPos);
          yPos += 20;

          doc.text(`In Sync: ${erpPimComparison.summary.inSync}`, 50, yPos)
             .text(`Out of Sync: ${erpPimComparison.summary.outOfSync}`, 200, yPos)
             .text(`Only in ERP: ${erpPimComparison.summary.onlyInERP}`, 350, yPos);
          yPos += 20;

          doc.text(`Only in PIM: ${erpPimComparison.summary.onlyInPIM}`, 50, yPos);
          yPos += 40;

          // Category Analysis Section
          doc.fontSize(16).text('Category Analysis', 50, yPos);
          yPos += 30;

          doc.fontSize(10).font('Helvetica-Bold');
          doc.text('Category', 50, yPos)
             .text('Total Products', 150, yPos)
             .text('Active', 250, yPos)
             .text('Obsolete', 320, yPos)
             .text('Threshold', 390, yPos)
             .text('Avg Stock', 460, yPos);
          yPos += 20;

          doc.font('Helvetica').fontSize(9);
          categoryComparison.categories.forEach(category => {
            doc.text(category.area, 50, yPos, { width: 90 })
               .text(category.totalProducts.toString(), 150, yPos)
               .text(category.activeProducts.toString(), 250, yPos)
               .text(category.obsoleteProducts.toString(), 320, yPos)
               .text(category.threshold.toString(), 390, yPos)
               .text((category.averageStock || 0).toFixed(0), 460, yPos);
            yPos += 15;

            // Check if we need a new page
            if (yPos > 700) {
              doc.addPage();
              yPos = 50;
            }
          });

          yPos += 30;

          // Recommendations Section
          doc.fontSize(16).text('Recommendations', 50, yPos);
          yPos += 30;

          const recommendations = [
            'Sync products that are out of sync between ERP and PIM',
            'Review obsolete products for potential discontinuation',
            'Update stock levels for products below threshold',
            'Verify pricing discrepancies between systems',
            'Schedule regular automated sync processes'
          ];

          doc.fontSize(11);
          recommendations.forEach(rec => {
            doc.text(`• ${rec}`, 50, yPos, { width: 500 });
            yPos += 20;
          });

          doc.end();
        } catch (error) {
          reject(error);
        }
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=catalog_status_${moment().format('YYYY-MM-DD')}.pdf`);
      res.send(pdfBuffer);

    } catch (error) {
      console.error('Error exporting catalog status to PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export catalog status to PDF'
      });
    }
  }

  /**
   * Export inventory report to Excel
   */
  async exportInventoryReportExcel(req, res) {
    try {
      const { category, stockThreshold = 10 } = req.query;

      // Get PIM products with stock information
      const pimProducts = await this.catalogService.getPIMProducts({ 
        category, 
        includeStock: true,
        limit: 10000 
      });

      const exportData = pimProducts.map(product => ({
        'SKU': product.sku,
        'Product Name': product.name,
        'Category': product.category || 'Uncategorized',
        'Current Stock': product.stock || 0,
        'Price': product.price || 0,
        'Stock Status': (product.stock || 0) < stockThreshold ? 'Low Stock' : 'In Stock',
        'Last Updated': product.lastUpdated || 'N/A',
        'Supplier': product.supplier || 'N/A',
        'Reorder Point': stockThreshold,
        'Needs Reorder': (product.stock || 0) < stockThreshold ? 'Yes' : 'No'
      }));

      // Calculate summary statistics
      const totalProducts = exportData.length;
      const lowStockProducts = exportData.filter(p => p['Stock Status'] === 'Low Stock').length;
      const totalStockValue = exportData.reduce((sum, p) => sum + ((p['Current Stock'] || 0) * (p['Price'] || 0)), 0);

      const summaryData = [
        { 'Metric': 'Total Products', 'Value': totalProducts },
        { 'Metric': 'Products in Stock', 'Value': totalProducts - lowStockProducts },
        { 'Metric': 'Low Stock Products', 'Value': lowStockProducts },
        { 'Metric': 'Low Stock Percentage', 'Value': `${((lowStockProducts / totalProducts) * 100).toFixed(1)}%` },
        { 'Metric': 'Total Inventory Value', 'Value': new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(totalStockValue) },
        { 'Metric': 'Stock Threshold Used', 'Value': stockThreshold }
      ];

      // Create workbook with multiple sheets
      const XLSX = require('xlsx');
      const workbook = XLSX.utils.book_new();

      // Summary sheet
      const summaryWorksheet = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Inventory Summary');

      // Detailed inventory sheet
      const inventoryWorksheet = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(workbook, inventoryWorksheet, 'Detailed Inventory');

      // Low stock items sheet
      const lowStockData = exportData.filter(p => p['Stock Status'] === 'Low Stock');
      if (lowStockData.length > 0) {
        const lowStockWorksheet = XLSX.utils.json_to_sheet(lowStockData);
        XLSX.utils.book_append_sheet(workbook, lowStockWorksheet, 'Low Stock Items');
      }

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=inventory_report_${moment().format('YYYY-MM-DD')}.xlsx`);
      res.send(buffer);

    } catch (error) {
      console.error('Error exporting inventory report to Excel:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export inventory report to Excel'
      });
    }
  }
}

module.exports = CatalogExportController;