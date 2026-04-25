import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { UploadService } from './upload.service';
import { uploadLimiter } from './middleware/rate-limit.middleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const uploadService = new UploadService();

export const uploadRouter = Router();

// POST /api/v1/upload
// Generic file upload endpoint — stores in R2, returns public URL
uploadRouter.post(
  '/',
  uploadLimiter,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file provided' });
        return;
      }

      const folder = (req.body.folder as string) || 'uploads';
      const allowedFolders = ['avatars', 'thumbnails', 'branding', 'uploads'];

      if (!allowedFolders.includes(folder)) {
        res.status(400).json({
          error: `Invalid folder. Allowed: ${allowedFolders.join(', ')}`,
        });
        return;
      }

      const result = await uploadService.upload(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        folder,
      );

      res.status(201).json({
        message: 'File uploaded successfully',
        ...result,
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Unsupported file type')) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof Error && error.message.startsWith('File too large')) {
        res.status(413).json({ error: error.message });
        return;
      }
      next(error);
    }
  },
);
