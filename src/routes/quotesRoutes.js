const express = require('express');
const QuotesController = require('../modules/quotes/quotesController');
const QuotesExportController = require('../modules/quotes/exportController');
const authMiddleware = require('../shared/middleware/authMiddleware');

const router = express.Router();
const quotesController = new QuotesController();
const exportController = new QuotesExportController();

// All quotes routes require authentication
router.use(authMiddleware.authenticate());

// Quote management routes
router.get('/', quotesController.getQuotes.bind(quotesController));
router.get('/stats', quotesController.getStats.bind(quotesController));
router.post('/', quotesController.createQuote.bind(quotesController));

// Client management routes
router.get('/clients', quotesController.getClients.bind(quotesController));
router.post('/clients', quotesController.createClient.bind(quotesController));

// Product search route
router.get('/products', quotesController.searchProducts.bind(quotesController));

// Quote reminder functionality
router.post('/send-reminders', quotesController.sendQuoteReminders.bind(quotesController));

// Quote by ID routes (must come after specific routes to avoid conflicts)
router.get('/:id', quotesController.getQuoteById.bind(quotesController));
router.put('/:id', quotesController.updateQuote.bind(quotesController));

// Export routes
router.get('/export/excel', exportController.exportQuotesExcel.bind(exportController));
router.get('/export/pdf', exportController.exportQuotesPDF.bind(exportController));
router.get('/export/clients/excel', exportController.exportClientsExcel.bind(exportController));
router.get('/export/summary/pdf', exportController.exportSalesSummaryPDF.bind(exportController));
router.get('/:id/export/pdf', exportController.exportQuotePDF.bind(exportController));

module.exports = router;