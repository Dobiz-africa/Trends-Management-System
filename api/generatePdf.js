const PDFDocument = require('pdfkit');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { html, filename } = req.body;

    if (!html || !filename) {
      return res.status(400).json({ error: 'Missing html or filename' });
    }

    // Create PDF document
    const doc = new PDFDocument({
      size: 'A4',
      margin: 20,
      bufferPages: true
    });

    // Set response headers for download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}.pdf"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    // Pipe PDF to response
    doc.pipe(res);

    // Strip HTML tags and format text for readability
    let text = html
      .replace(/<style[^>]*>.*?<\/style>/gs, '') // Remove style tags
      .replace(/<script[^>]*>.*?<\/script>/gs, '') // Remove script tags
      .replace(/<br\s*\/?>/gi, '\n') // Convert br to newline
      .replace(/<\/p>/gi, '\n') // Convert closing p to newline
      .replace(/<\/div>/gi, '\n') // Convert closing div to newline
      .replace(/<[^>]*>/g, '') // Remove all other HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');

    // Add title if provided
    if (filename) {
      doc.fontSize(14).font('Helvetica-Bold').text(filename, { align: 'center' });
      doc.moveDown(0.5);
    }

    // Add content
    doc.fontSize(10).font('Helvetica').text(text, {
      align: 'left',
      width: 550,
      lineGap: 4
    });

    // Finalize PDF
    doc.end();

  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate PDF',
      message: error.message 
    });
  }
}