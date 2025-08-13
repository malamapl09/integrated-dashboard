const PDFDocument = require('pdfkit');
const path = require('path');
const cache = require('../utils/cache');

async function generateQuotePDF(quote) {
  // Check if PDF is already cached
  const cacheKey = `pdf:quote:${quote.id}:${quote.updated_at || quote.created_at}`;
  const cachedPDF = cache.get(cacheKey);
  
  if (cachedPDF) {
    console.log('Returning cached PDF for quote:', quote.id);
    return cachedPDF;
  }

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        
        // Cache the PDF for 1 hour
        cache.set(cacheKey, pdfData, 3600);
        
        resolve(pdfData);
      });

      // Company Header with Logo
      const logoPath = path.join(__dirname, '../../Logo Plaza Lama.png');
      try {
        doc.image(logoPath, 50, 40, { width: 200 });
      } catch (logoError) {
        // Fallback to text if logo not found
        doc.fontSize(24)
           .fillColor('#d32f2f')
           .text(process.env.COMPANY_NAME || 'Plaza Lama, S.A.', 50, 50);
        
        doc.fontSize(12)
           .fillColor('#666')
           .text('La Mejor Opción', 50, 80);
      }

      // Company Info (top right)
      const rightColumn = 400;
      doc.fontSize(10)
         .fillColor('black')
         .text(`RNC: ${process.env.COMPANY_RNC || '101-17111-1'}`, rightColumn, 40)
         .text(`Cotización #: ${quote.quote_number}`, rightColumn, 55)
         .text(`Fecha: ${new Date(quote.created_at).toLocaleDateString()}`, rightColumn, 70)
         .text(`Teléfono: ${process.env.COMPANY_PHONE || '+1-829-564-6711'}`, rightColumn, 85);

      // Client Information (positioned below logo)
      doc.fontSize(12)
         .fillColor('black')
         .text('Nombre o nombre de la empresa:', 50, 120)
         .fontSize(14)
         .text(quote.client_company || quote.client_name, 50, 135);

      if (quote.client_rnc) {
        doc.fontSize(10)
           .text(`RNC: ${quote.client_rnc}`, 50, 155);
      }

      // Quote Title
      doc.fontSize(16)
         .fillColor('black')
         .text('COTIZACIÓN', 50, 190, { align: 'center' });

      // Table Header
      const tableTop = 220;
      const itemCodeX = 50;
      const descriptionX = 150;
      const qtyX = 350;
      const priceX = 400;
      const itbisX = 450;
      const totalX = 500;

      // Header background (Plaza Lama blue)
      doc.rect(50, tableTop, 500, 25)
         .fillColor('#1D3F87')
         .fill();

      doc.fillColor('white')
         .fontSize(10)
         .text('EAN', itemCodeX + 5, tableTop + 8)
         .text('Descripción', descriptionX + 5, tableTop + 8)
         .text('Cant', qtyX + 5, tableTop + 8)
         .text('Precio', priceX + 5, tableTop + 8)
         .text('ITBIS', itbisX + 5, tableTop + 8)
         .text('Total', totalX + 5, tableTop + 8);

      // Table rows
      let yPosition = tableTop + 30;
      
      quote.items.forEach((item, index) => {
        // Alternate row colors
        if (index % 2 === 1) {
          doc.rect(50, yPosition - 5, 500, 25)
             .fillColor('#f5f5f5')
             .fill();
        }

        const productName = item.product_name || item.name || item.description || item.product_description || 'Producto';
        
        doc.fillColor('black')
           .fontSize(9)
           .text(item.ean || item.product_ean || '', itemCodeX + 5, yPosition)
           .text(productName, descriptionX + 5, yPosition, { width: 180 })
           .text(item.quantity.toString(), qtyX + 5, yPosition)
           .text(item.price.toFixed(2), priceX + 5, yPosition)
           .text((item.itbis || 0).toFixed(2), itbisX + 5, yPosition)
           .text(item.total.toFixed(2), totalX + 5, yPosition);

        yPosition += 25;
      });

      // Totals section
      yPosition += 20;
      
      doc.fontSize(12)
         .text(`Subtotal: ${quote.subtotal.toFixed(2)}`, 400, yPosition)
         .text(`ITBIS: ${quote.itbis.toFixed(2)}`, 400, yPosition + 20)
         .fontSize(14)
         .text(`Total: ${quote.total.toFixed(2)}`, 400, yPosition + 40);

      // Notes section
      if (quote.notes) {
        yPosition += 80;
        doc.fontSize(12)
           .text('Notas:', 50, yPosition)
           .fontSize(10)
           .text(quote.notes, 50, yPosition + 20, { width: 500 });
      }

      // Valid until
      if (quote.valid_until) {
        yPosition += 60;
        doc.fontSize(10)
           .text(`Válida hasta: ${new Date(quote.valid_until).toLocaleDateString()}`, 50, yPosition);
      }

      // Disclaimer
      const disclaimerY = doc.page.height - 150;
      doc.fontSize(8)
         .fillColor('black')
         .text('Estos precios están sujetos a cambios sin previo aviso; favor verificar antes de realizar su compra. El tiempo de vigencia de la cotización es de 7 días calendario. En caso de incluir productos en oferta con fechas específicas, la vigencia corresponderá a la fecha en que finalice dicha oferta.', 
               50, disclaimerY, { width: 500, align: 'justify' });

      // Footer
      doc.fontSize(8)
         .fillColor('#666')
         .text('Cotización generada automáticamente', 50, doc.page.height - 100, { align: 'center' })
         .text(`Fecha de generación: ${new Date().toLocaleString()}`, 50, doc.page.height - 85, { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { generateQuotePDF };