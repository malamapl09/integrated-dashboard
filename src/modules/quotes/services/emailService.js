const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

class EmailService {
  constructor() {
    this.transporter = null;
    this.configured = false;
    this.initializeTransporter();
  }

  initializeTransporter() {
    const config = {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    };

    // Check if all required config is present
    if (!config.host || !config.auth.user || !config.auth.pass) {
      console.warn('Email service not configured. Missing SMTP configuration.');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport(config);
      this.configured = true;
      console.log('Email service configured successfully');
      
      // Verify connection
      this.verifyConnection();
    } catch (error) {
      console.error('Failed to configure email service:', error.message);
    }
  }

  async verifyConnection() {
    if (!this.transporter) return false;

    try {
      await this.transporter.verify();
      console.log('SMTP connection verified successfully');
      return true;
    } catch (error) {
      console.error('SMTP connection verification failed:', error.message);
      this.configured = false;
      return false;
    }
  }

  isConfigured() {
    return this.configured && this.transporter;
  }

  // Generate HTML email template for quotes
  generateQuoteEmailHTML(quote, clientData, senderData) {
    const companyName = process.env.COMPANY_NAME || 'Plaza Lama, S.A.';
    const companyPhone = process.env.COMPANY_PHONE || '+1-829-564-6711';
    const companyAddress = process.env.COMPANY_ADDRESS || 'Santo Domingo, República Dominicana';
    
    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cotización ${quote.quote_number}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
        }
        .email-container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #1D3F87 0%, #4a90e2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 600;
        }
        .company-name {
            margin: 10px 0 0 0;
            font-size: 16px;
            opacity: 0.9;
        }
        .content {
            padding: 30px;
        }
        .greeting {
            font-size: 18px;
            margin-bottom: 20px;
            color: #2c3e50;
        }
        .quote-info {
            background: #f8f9ff;
            border-left: 4px solid #1D3F87;
            padding: 20px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
        }
        .quote-info h3 {
            margin: 0 0 15px 0;
            color: #1D3F87;
            font-size: 20px;
        }
        .info-row {
            display: flex;
            justify-content: space-between;
            margin: 8px 0;
            padding: 5px 0;
            border-bottom: 1px solid #e9ecef;
        }
        .info-row:last-child {
            border-bottom: none;
        }
        .info-label {
            font-weight: 600;
            color: #555;
        }
        .info-value {
            color: #333;
        }
        .products-section {
            margin: 25px 0;
        }
        .products-table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
            font-size: 14px;
        }
        .products-table th {
            background: #1D3F87;
            color: white;
            padding: 12px 8px;
            text-align: left;
            font-weight: 600;
        }
        .products-table td {
            padding: 12px 8px;
            border-bottom: 1px solid #e9ecef;
        }
        .products-table tr:nth-child(even) {
            background: #f8f9fa;
        }
        .total-section {
            background: #e8f4fd;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: right;
        }
        .total-row {
            display: flex;
            justify-content: space-between;
            margin: 8px 0;
            padding: 5px 0;
        }
        .total-final {
            font-size: 18px;
            font-weight: bold;
            color: #1D3F87;
            border-top: 2px solid #1D3F87;
            padding-top: 10px;
            margin-top: 10px;
        }
        .cta-section {
            text-align: center;
            margin: 30px 0;
        }
        .cta-button {
            display: inline-block;
            background: #00d09c;
            color: white;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            transition: background 0.3s ease;
        }
        .cta-button:hover {
            background: #00b386;
        }
        .footer {
            background: #f8f9fa;
            padding: 25px;
            text-align: center;
            border-top: 1px solid #e9ecef;
            color: #666;
            font-size: 14px;
        }
        .contact-info {
            margin: 15px 0;
        }
        .notes {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 6px;
            padding: 15px;
            margin: 20px 0;
        }
        .notes h4 {
            margin: 0 0 10px 0;
            color: #856404;
        }
        @media (max-width: 600px) {
            body {
                padding: 10px;
            }
            .content {
                padding: 20px;
            }
            .info-row {
                flex-direction: column;
            }
            .products-table {
                font-size: 12px;
            }
            .products-table th,
            .products-table td {
                padding: 8px 4px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1>Nueva Cotización</h1>
            <div class="company-name">${companyName}</div>
        </div>
        
        <div class="content">
            <div class="greeting">
                Estimado/a ${clientData.name || 'Cliente'},
            </div>
            
            <p>Esperamos que se encuentre bien. Adjuntamos la cotización solicitada con el detalle de productos y precios.</p>
            
            <div class="quote-info">
                <h3>Información de la Cotización</h3>
                <div class="info-row">
                    <span class="info-label">Número de Cotización:</span>
                    <span class="info-value"><strong>${quote.quote_number}</strong></span>
                </div>
                <div class="info-row">
                    <span class="info-label">Fecha:</span>
                    <span class="info-value">${new Date(quote.created_at).toLocaleDateString('es-ES')}</span>
                </div>
                ${quote.valid_until ? `
                <div class="info-row">
                    <span class="info-label">Válida hasta:</span>
                    <span class="info-value">${new Date(quote.valid_until).toLocaleDateString('es-ES')}</span>
                </div>
                ` : ''}
                <div class="info-row">
                    <span class="info-label">Generada por:</span>
                    <span class="info-value">${senderData.firstName} ${senderData.lastName}</span>
                </div>
            </div>

            <div class="products-section">
                <h3>Productos Cotizados</h3>
                <table class="products-table">
                    <thead>
                        <tr>
                            <th>Descripción</th>
                            <th>Cantidad</th>
                            <th>Precio Unit.</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${quote.items.map(item => `
                        <tr>
                            <td>
                                <strong>${item.product_name}</strong>
                                ${item.product_description ? `<br><small style="color: #666;">${item.product_description}</small>` : ''}
                                ${item.ean ? `<br><small style="color: #999;">EAN: ${item.ean}</small>` : ''}
                            </td>
                            <td>${item.quantity}</td>
                            <td>$${parseFloat(item.price).toFixed(2)}</td>
                            <td><strong>$${parseFloat(item.total).toFixed(2)}</strong></td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <div class="total-section">
                <div class="total-row">
                    <span>Subtotal:</span>
                    <span>$${parseFloat(quote.subtotal).toFixed(2)}</span>
                </div>
                <div class="total-row">
                    <span>ITBIS:</span>
                    <span>$${parseFloat(quote.itbis).toFixed(2)}</span>
                </div>
                <div class="total-row total-final">
                    <span>Total:</span>
                    <span>$${parseFloat(quote.total).toFixed(2)}</span>
                </div>
            </div>

            ${quote.notes ? `
            <div class="notes">
                <h4>Notas Adicionales</h4>
                <p>${quote.notes.replace(/\n/g, '<br>')}</p>
            </div>
            ` : ''}

            <div class="cta-section">
                <p>¿Tiene alguna pregunta sobre esta cotización?</p>
                <a href="tel:${companyPhone}" class="cta-button">Contactar Ahora</a>
            </div>

            <p>Quedamos atentos a sus comentarios y esperamos poder servirle pronto.</p>
            <p>Saludos cordiales,</p>
            <p><strong>${senderData.firstName} ${senderData.lastName}</strong><br>
            ${companyName}</p>
        </div>
        
        <div class="footer">
            <div class="contact-info">
                <strong>${companyName}</strong><br>
                ${companyAddress}<br>
                Teléfono: ${companyPhone}
            </div>
            <p><small>Esta cotización fue generada automáticamente por nuestro sistema de cotizaciones.</small></p>
        </div>
    </div>
</body>
</html>`;
  }

  // Generate plain text version for email clients that don't support HTML
  generateQuoteEmailText(quote, clientData, senderData) {
    const companyName = process.env.COMPANY_NAME || 'Plaza Lama, S.A.';
    const companyPhone = process.env.COMPANY_PHONE || '+1-829-564-6711';
    const companyAddress = process.env.COMPANY_ADDRESS || 'Santo Domingo, República Dominicana';

    let text = `NUEVA COTIZACIÓN - ${quote.quote_number}\n`;
    text += `${companyName}\n`;
    text += `${'='.repeat(50)}\n\n`;
    
    text += `Estimado/a ${clientData.name || 'Cliente'},\n\n`;
    text += `Esperamos que se encuentre bien. Adjuntamos la cotización solicitada con el detalle de productos y precios.\n\n`;
    
    text += `INFORMACIÓN DE LA COTIZACIÓN:\n`;
    text += `- Número de Cotización: ${quote.quote_number}\n`;
    text += `- Fecha: ${new Date(quote.created_at).toLocaleDateString('es-ES')}\n`;
    if (quote.valid_until) {
      text += `- Válida hasta: ${new Date(quote.valid_until).toLocaleDateString('es-ES')}\n`;
    }
    text += `- Generada por: ${senderData.firstName} ${senderData.lastName}\n\n`;
    
    text += `PRODUCTOS COTIZADOS:\n`;
    text += `${'-'.repeat(50)}\n`;
    
    quote.items.forEach(item => {
      text += `${item.product_name}\n`;
      if (item.product_description) {
        text += `  ${item.product_description}\n`;
      }
      if (item.ean) {
        text += `  EAN: ${item.ean}\n`;
      }
      text += `  Cantidad: ${item.quantity} | Precio: $${parseFloat(item.price).toFixed(2)} | Total: $${parseFloat(item.total).toFixed(2)}\n\n`;
    });
    
    text += `${'-'.repeat(50)}\n`;
    text += `Subtotal: $${parseFloat(quote.subtotal).toFixed(2)}\n`;
    text += `ITBIS: $${parseFloat(quote.itbis).toFixed(2)}\n`;
    text += `TOTAL: $${parseFloat(quote.total).toFixed(2)}\n`;
    text += `${'-'.repeat(50)}\n\n`;
    
    if (quote.notes) {
      text += `NOTAS ADICIONALES:\n${quote.notes}\n\n`;
    }
    
    text += `¿Tiene alguna pregunta sobre esta cotización?\n`;
    text += `Contáctenos al: ${companyPhone}\n\n`;
    text += `Quedamos atentos a sus comentarios y esperamos poder servirle pronto.\n\n`;
    text += `Saludos cordiales,\n`;
    text += `${senderData.firstName} ${senderData.lastName}\n`;
    text += `${companyName}\n`;
    text += `${companyAddress}\n`;
    text += `Teléfono: ${companyPhone}\n\n`;
    text += `Esta cotización fue generada automáticamente por nuestro sistema de cotizaciones.`;
    
    return text;
  }

  async sendQuoteEmail(quote, clientData, senderData, pdfBuffer, options = {}, useQueue = false) {
    // If using queue, delegate to queue service
    if (useQueue) {
      const emailQueueService = require('./emailQueueService');
      const emailData = {
        type: 'quote',
        quoteId: quote.id,
        recipientEmail: clientData.email,
        senderUserId: senderData.userId || null,
        quote,
        clientData,
        senderData,
        pdfBuffer: pdfBuffer.toString('base64'), // Convert buffer to string for JSON storage
        options,
        subject: options.subject || `Cotización ${quote.quote_number} - ${process.env.COMPANY_NAME || 'Plaza Lama, S.A.'}`
      };
      
      const queueId = await emailQueueService.addToQueue(emailData, options.priority || 0);
      return {
        success: true,
        queued: true,
        queueId,
        message: 'Email queued for delivery'
      };
    }

    if (!this.isConfigured()) {
      throw new Error('Email service is not configured. Please check SMTP settings.');
    }

    const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;
    const companyName = process.env.COMPANY_NAME || 'Plaza Lama, S.A.';

    const mailOptions = {
      from: {
        name: options.senderName || `${senderData.firstName} ${senderData.lastName} - ${companyName}`,
        address: fromEmail
      },
      to: {
        name: clientData.name,
        address: clientData.email
      },
      subject: options.subject || `Cotización ${quote.quote_number} - ${companyName}`,
      html: this.generateQuoteEmailHTML(quote, clientData, senderData),
      text: this.generateQuoteEmailText(quote, clientData, senderData),
      attachments: [
        {
          filename: `cotizacion-${quote.quote_number}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    };

    // Add custom message if provided
    if (options.customMessage) {
      const customMessageHTML = `<div style="background: #e8f5e8; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 0 6px 6px 0;">
        <h4 style="margin: 0 0 10px 0; color: #155724;">Mensaje Personalizado:</h4>
        <p style="margin: 0; color: #155724;">${options.customMessage.replace(/\n/g, '<br>')}</p>
      </div>`;
      
      mailOptions.html = mailOptions.html.replace(
        '<p>Esperamos que se encuentre bien.',
        `${customMessageHTML}<p>Esperamos que se encuentre bien.`
      );
      
      mailOptions.text = mailOptions.text.replace(
        'Esperamos que se encuentre bien.',
        `MENSAJE PERSONALIZADO:\n${options.customMessage}\n\nEsperamos que se encuentre bien.`
      );
    }

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('Quote email sent successfully:', info.messageId);
      
      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
        recipient: clientData.email
      };
    } catch (error) {
      console.error('Failed to send quote email:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  async sendTestEmail(toEmail, fromName = null, useQueue = false) {
    // If using queue, delegate to queue service
    if (useQueue) {
      const emailQueueService = require('./emailQueueService');
      const emailData = {
        type: 'test',
        recipientEmail: toEmail,
        senderUserId: null,
        senderName: fromName
      };
      
      const queueId = await emailQueueService.addToQueue(emailData);
      return {
        success: true,
        queued: true,
        queueId,
        message: 'Test email queued for delivery'
      };
    }
    if (!this.isConfigured()) {
      throw new Error('Email service is not configured. Please check SMTP settings.');
    }

    const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;
    const companyName = process.env.COMPANY_NAME || 'Plaza Lama, S.A.';

    const mailOptions = {
      from: {
        name: fromName || companyName,
        address: fromEmail
      },
      to: toEmail,
      subject: `Test Email - ${companyName} Cotizador System`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1D3F87;">Email Configuration Test</h2>
          <p>This is a test email from the ${companyName} quote system.</p>
          <p>If you receive this email, your SMTP configuration is working correctly!</p>
          <hr>
          <p><small>Sent at: ${new Date().toLocaleString()}</small></p>
        </div>
      `,
      text: `Email Configuration Test\n\nThis is a test email from the ${companyName} quote system.\nIf you receive this email, your SMTP configuration is working correctly!\n\nSent at: ${new Date().toLocaleString()}`
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('Test email sent successfully:', info.messageId);
      return {
        success: true,
        messageId: info.messageId,
        response: info.response
      };
    } catch (error) {
      console.error('Failed to send test email:', error);
      throw new Error(`Failed to send test email: ${error.message}`);
    }
  }

  /**
   * Send email with template support for quote reminders
   */
  async sendEmail(emailData) {
    if (!this.isConfigured()) {
      throw new Error('Email service is not configured. Please check SMTP settings.');
    }

    const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;
    const companyName = process.env.COMPANY_NAME || 'Plaza Lama, S.A.';

    let mailOptions = {
      from: {
        name: emailData.data?.createdByName || companyName,
        address: emailData.data?.createdByEmail || fromEmail
      },
      to: emailData.to,
      subject: emailData.subject
    };

    // Handle different template types
    if (emailData.template === 'quote_reminder') {
      const { clientName, quoteNumber, total, validUntil, daysUntilExpiry } = emailData.data;
      
      mailOptions.html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1D3F87;">Recordatorio de Cotización</h2>
          <p>Estimado/a ${clientName},</p>
          <p>Le recordamos que su cotización <strong>#${quoteNumber}</strong> por valor de <strong>$${parseFloat(total).toFixed(2)}</strong> 
             ${daysUntilExpiry === 1 ? 'vence mañana' : `vence en ${daysUntilExpiry} días`} (${new Date(validUntil).toLocaleDateString('es-ES')}).</p>
          <p>Para proceder con su orden o si tiene alguna pregunta, no dude en contactarnos.</p>
          <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 5px;">
            <h4 style="margin: 0 0 10px 0;">Detalles de la Cotización:</h4>
            <p><strong>Número:</strong> ${quoteNumber}<br>
               <strong>Total:</strong> $${parseFloat(total).toFixed(2)}<br>
               <strong>Válida hasta:</strong> ${new Date(validUntil).toLocaleDateString('es-ES')}</p>
          </div>
          <p>Saludos cordiales,<br>${companyName}</p>
        </div>
      `;
      
      mailOptions.text = `Recordatorio de Cotización\n\nEstimado/a ${clientName},\n\nLe recordamos que su cotización #${quoteNumber} por valor de $${parseFloat(total).toFixed(2)} ${daysUntilExpiry === 1 ? 'vence mañana' : `vence en ${daysUntilExpiry} días`} (${new Date(validUntil).toLocaleDateString('es-ES')}).\n\nPara proceder con su orden o si tiene alguna pregunta, no dude en contactarnos.\n\nDetalles:\nNúmero: ${quoteNumber}\nTotal: $${parseFloat(total).toFixed(2)}\nVálida hasta: ${new Date(validUntil).toLocaleDateString('es-ES')}\n\nSaludos cordiales,\n${companyName}`;
    } else {
      // Generic template
      mailOptions.html = `<div style="font-family: Arial, sans-serif; padding: 20px;">${emailData.message || 'Email content'}</div>`;
      mailOptions.text = emailData.message || 'Email content';
    }

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('Template email sent successfully:', info.messageId);
      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
        recipient: emailData.to
      };
    } catch (error) {
      console.error('Failed to send template email:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }
}

module.exports = new EmailService();