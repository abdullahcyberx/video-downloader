import { Router } from 'express';
import { videoController } from '../controllers/video.controller';
import { validate, urlSchema, downloadSchema } from '../middleware/validate';
import { downloadLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/info', validate(urlSchema), videoController.getInfo);
router.post('/download', downloadLimiter, validate(downloadSchema), videoController.startDownload);
router.get('/status/:jobId', videoController.getStatus);
router.get('/file/:jobId', videoController.getFile);

export default router;
