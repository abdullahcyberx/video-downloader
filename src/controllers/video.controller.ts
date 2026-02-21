import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { ytDlpService } from '../services/ytDlpService';
import { downloadQueue } from '../jobs/queue';
import { AppError } from '../middleware/error';
import { logger } from '../utils/logger';

export const videoController = {
    async getInfo(req: Request, res: Response, next: NextFunction) {
        try {
            const { url } = req.body;
            const info = await ytDlpService.getInfo(url);

            res.status(200).json({
                status: 'success',
                data: {
                    title: info.title,
                    thumbnail: info.thumbnail,
                    duration: info.duration,
                    formats: info.formats,
                }
            });
        } catch (err) {
            next(err);
        }
    },

    async startDownload(req: Request, res: Response, next: NextFunction) {
        try {
            const { url, format } = req.body;

            // Add job to BullMQ
            const job = await downloadQueue.add('download', { url, format });

            res.status(202).json({
                status: 'success',
                message: 'Download job queued successfully',
                data: {
                    jobId: job.id
                }
            });
        } catch (err) {
            next(err);
        }
    },

    async getStatus(req: Request, res: Response, next: NextFunction) {
        try {
            const jobId = req.params.jobId as string;
            const job = await downloadQueue.getJob(jobId);

            if (!job) {
                return next(new AppError('Job not found', 404));
            }

            const state = await job.getState();
            const progress = job.progress;

            res.status(200).json({
                status: 'success',
                data: {
                    jobId: job.id,
                    state,         // 'completed', 'failed', 'delayed', 'active', 'waiting', etc.
                    progress,      // numeric percentage
                    result: job.returnvalue || null,
                    failedReason: job.failedReason || null
                }
            });
        } catch (err) {
            next(err);
        }
    },

    async getFile(req: Request, res: Response, next: NextFunction) {
        try {
            const jobId = req.params.jobId as string;
            const job = await downloadQueue.getJob(jobId);

            if (!job) {
                return next(new AppError('Job not found', 404));
            }

            const state = await job.getState();
            if (state !== 'completed') {
                return next(new AppError('File not ready or job failed', 400));
            }

            const { filePath } = job.returnvalue;

            if (!filePath || !fs.existsSync(filePath)) {
                return next(new AppError('File no longer available on server', 404));
            }

            // Stream the file and then delete it
            res.download(filePath, (err) => {
                if (err) {
                    logger.error(`Error sending file for job ${jobId}: `, err);
                } else {
                    // File successfully sent, auto-delete it
                    fs.unlink(filePath, (unlinkErr) => {
                        if (unlinkErr) {
                            logger.error(`Failed to delete file ${filePath} after download`, unlinkErr);
                        } else {
                            logger.info(`Successfully deleted file ${filePath} after download`);
                        }
                    });
                }
            });

        } catch (err) {
            next(err);
        }
    }
};
