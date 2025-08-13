const LogsService = require('./logsService');
const exportService = require('../../shared/services/exportService');
const moment = require('moment');

class LogsExportController {
  constructor() {
    this.logsService = new LogsService();
  }

  /**
   * Export user activity logs to Excel
   */
  async exportLogsExcel(req, res) {
    try {
      const filters = {
        user: req.query.user || '',
        sku: req.query.sku || '',
        action: req.query.action || '',
        startDate: req.query.startDate || null,
        endDate: req.query.endDate || null,
        limit: parseInt(req.query.limit) || 10000
      };

      const logs = await this.logsService.getLogs(filters);

      const exportData = logs.map(log => ({
        'Date': log.fecha || log.date,
        'Time': log.hora || log.time,
        'User': log.usuario || log.user,
        'Action Type': log.tipo_accion || log.action_type,
        'SKU': log.sku,
        'Product Name': log.nombre_producto || log.product_name,
        'Old Value': log.valor_anterior || log.old_value,
        'New Value': log.valor_nuevo || log.new_value,
        'Category': log.categoria || log.category,
        'Section': log.seccion || log.section,
        'IP Address': log.ip || 'N/A',
        'User Agent': log.user_agent || 'N/A'
      }));

      const excelBuffer = exportService.generateExcel({
        title: 'User Activity Logs Report',
        data: exportData,
        sheetName: 'Activity Logs',
        metadata: {
          generatedBy: `${req.user.first_name} ${req.user.last_name}`,
          dateGenerated: new Date(),
          totalRecords: exportData.length,
          filters: JSON.stringify(filters)
        }
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=user_activity_logs_${moment().format('YYYY-MM-DD')}.xlsx`);
      res.send(excelBuffer);

    } catch (error) {
      console.error('Error exporting logs to Excel:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export logs to Excel'
      });
    }
  }

  /**
   * Export user activity summary to PDF
   */
  async exportActivitySummaryPDF(req, res) {
    try {
      const filters = {
        startDate: req.query.startDate || moment().subtract(30, 'days').format('YYYY-MM-DD'),
        endDate: req.query.endDate || moment().format('YYYY-MM-DD')
      };

      const [stats, topUsers, topActions] = await Promise.all([
        this.logsService.getLogsStats(filters),
        this.logsService.getTopUsers(filters),
        this.logsService.getTopActions(filters)
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
          doc.fontSize(24).text('User Activity Summary Report', 50, 50, { align: 'center' });
          doc.fontSize(12).text(`Period: ${filters.startDate} to ${filters.endDate}`, 50, 80, { align: 'center' });
          doc.fontSize(12).text(`Generated on ${moment().format('YYYY-MM-DD HH:mm:ss')}`, 50, 100, { align: 'center' });

          let yPos = 140;

          // Statistics Section
          doc.fontSize(16).text('Activity Statistics', 50, yPos);
          yPos += 30;

          doc.fontSize(12)
             .text(`Total Activities: ${stats.totalActivities || 0}`, 50, yPos)
             .text(`Unique Users: ${stats.uniqueUsers || 0}`, 300, yPos);
          yPos += 20;

          doc.text(`Products Modified: ${stats.productsModified || 0}`, 50, yPos)
             .text(`Daily Average: ${stats.dailyAverage || 0}`, 300, yPos);
          yPos += 40;

          // Top Users Section
          doc.fontSize(16).text('Most Active Users', 50, yPos);
          yPos += 30;

          if (topUsers && topUsers.length > 0) {
            doc.fontSize(10).font('Helvetica-Bold');
            doc.text('User', 50, yPos)
               .text('Activities', 200, yPos)
               .text('Last Activity', 300, yPos)
               .text('Top Action', 450, yPos);
            yPos += 20;

            doc.font('Helvetica').fontSize(9);
            topUsers.slice(0, 10).forEach(user => {
              doc.text(user.usuario || user.user, 50, yPos, { width: 140 })
                 .text((user.total_activities || user.activities || 0).toString(), 200, yPos)
                 .text(user.last_activity ? moment(user.last_activity).format('MM/DD/YY') : 'N/A', 300, yPos)
                 .text(user.top_action || user.topAction || 'N/A', 450, yPos, { width: 100 });
              yPos += 15;
            });
          }

          yPos += 30;

          // Top Actions Section
          doc.fontSize(16).text('Most Common Actions', 50, yPos);
          yPos += 30;

          if (topActions && topActions.length > 0) {
            doc.fontSize(10).font('Helvetica-Bold');
            doc.text('Action Type', 50, yPos)
               .text('Count', 200, yPos)
               .text('Percentage', 300, yPos)
               .text('Avg per Day', 450, yPos);
            yPos += 20;

            doc.font('Helvetica').fontSize(9);
            topActions.forEach(action => {
              const percentage = stats.totalActivities > 0 ? 
                ((action.count / stats.totalActivities) * 100).toFixed(1) : '0';
              const avgPerDay = stats.totalActivities > 0 ? 
                (action.count / 30).toFixed(1) : '0';

              doc.text(action.tipo_accion || action.action_type, 50, yPos, { width: 140 })
                 .text(action.count.toString(), 200, yPos)
                 .text(`${percentage}%`, 300, yPos)
                 .text(avgPerDay, 450, yPos);
              yPos += 15;
            });
          }

          yPos += 40;

          // Insights Section
          doc.fontSize(16).text('Key Insights', 50, yPos);
          yPos += 30;

          const insights = [
            `Peak activity period: ${stats.peakHour || 'Unknown'} hours`,
            `Most active day: ${stats.mostActiveDay || 'Unknown'}`,
            `Average activities per user: ${stats.avgActivitiesPerUser || 0}`,
            `Data quality score: ${stats.dataQualityScore || 'Unknown'}%`
          ];

          doc.fontSize(11);
          insights.forEach(insight => {
            doc.text(`• ${insight}`, 50, yPos, { width: 500 });
            yPos += 18;
          });

          doc.end();
        } catch (error) {
          reject(error);
        }
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=activity_summary_${moment().format('YYYY-MM-DD')}.pdf`);
      res.send(pdfBuffer);

    } catch (error) {
      console.error('Error exporting activity summary to PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export activity summary to PDF'
      });
    }
  }

  /**
   * Export user performance report to Excel
   */
  async exportUserPerformanceExcel(req, res) {
    try {
      const filters = {
        startDate: req.query.startDate || moment().subtract(30, 'days').format('YYYY-MM-DD'),
        endDate: req.query.endDate || moment().format('YYYY-MM-DD')
      };

      const userPerformance = await this.logsService.getUserPerformanceReport(filters);

      const exportData = userPerformance.map(user => ({
        'User': user.usuario || user.user,
        'Total Activities': user.total_activities || user.activities || 0,
        'Products Modified': user.products_modified || user.productsModified || 0,
        'Title Changes': user.title_changes || user.titleChanges || 0,
        'Price Updates': user.price_updates || user.priceUpdates || 0,
        'Stock Updates': user.stock_updates || user.stockUpdates || 0,
        'Category Changes': user.category_changes || user.categoryChanges || 0,
        'First Activity': user.first_activity || user.firstActivity || 'N/A',
        'Last Activity': user.last_activity || user.lastActivity || 'N/A',
        'Active Days': user.active_days || user.activeDays || 0,
        'Avg Activities/Day': user.avg_per_day || user.avgPerDay || 0,
        'Performance Score': user.performance_score || user.performanceScore || 0
      }));

      const excelBuffer = exportService.generateExcel({
        title: 'User Performance Report',
        data: exportData,
        sheetName: 'User Performance',
        metadata: {
          generatedBy: `${req.user.first_name} ${req.user.last_name}`,
          dateGenerated: new Date(),
          totalRecords: exportData.length,
          reportPeriod: `${filters.startDate} to ${filters.endDate}`
        }
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=user_performance_${moment().format('YYYY-MM-DD')}.xlsx`);
      res.send(excelBuffer);

    } catch (error) {
      console.error('Error exporting user performance to Excel:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export user performance to Excel'
      });
    }
  }

  /**
   * Export product modification history to Excel
   */
  async exportProductHistoryExcel(req, res) {
    try {
      const { sku } = req.query;
      
      if (!sku) {
        return res.status(400).json({
          success: false,
          message: 'SKU parameter is required'
        });
      }

      const productHistory = await this.logsService.getProductHistory(sku);

      const exportData = productHistory.map(log => ({
        'Date': log.fecha || log.date,
        'Time': log.hora || log.time,
        'User': log.usuario || log.user,
        'Action': log.tipo_accion || log.action_type,
        'Field Changed': log.campo_modificado || log.field_changed,
        'Old Value': log.valor_anterior || log.old_value,
        'New Value': log.valor_nuevo || log.new_value,
        'Change Impact': log.impacto || log.impact,
        'Reason': log.razon || log.reason || 'N/A',
        'Approved By': log.aprobado_por || log.approved_by || 'N/A'
      }));

      const excelBuffer = exportService.generateExcel({
        title: `Product Modification History - SKU: ${sku}`,
        data: exportData,
        sheetName: 'Product History',
        metadata: {
          generatedBy: `${req.user.first_name} ${req.user.last_name}`,
          dateGenerated: new Date(),
          totalRecords: exportData.length,
          productSKU: sku
        }
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=product_history_${sku}_${moment().format('YYYY-MM-DD')}.xlsx`);
      res.send(excelBuffer);

    } catch (error) {
      console.error('Error exporting product history to Excel:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export product history to Excel'
      });
    }
  }
}

module.exports = LogsExportController;