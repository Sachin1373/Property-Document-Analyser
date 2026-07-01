import { Router, Request, Response } from 'express';
import upload from '../middleware/upload';
import { extractTextFromPDF } from '../services/pdfExtractor';
import { analyseDocument } from '../services/openaiService';

const router = Router();

router.post('/analyse', upload.single('document'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const text = await extractTextFromPDF(req.file.buffer);

    if (!text || text.trim().length < 100) {
      return res.status(400).json({
        error: 'Could not extract text from PDF. File may be scanned/image-based.'
      });
    }

    const result = await analyseDocument(text);

    return res.json({ success: true, data: result });

  } catch (error) {
    console.error('Analysis error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Analysis failed'
    });
  }
});

export default router;
