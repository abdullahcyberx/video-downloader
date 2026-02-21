import { Worker, Job } from 'bullmq';
import { redisConnection, DOWNLOAD_QUEUE_NAME } from './queue';
import { ytDlpService } from '../services/ytDlpService';
import { logger } from '../utils/logger';

export interface DownloadJobData {
    url: string;
    format: 'video' | 'audio';
}

export const initWorker = () => {
    const worker = new Worker<DownloadJobData>(
        DOWNLOAD_QUEUE_NAME,
        async (job: Job) => {
            logger.info(`Processing job ${job.id} for URL: ${job.data.url}`);

            try {
                const result = await ytDlpService.downloadVideo(job.data.url, job.data.format, (progress) => {
                    job.updateProgress(progress).catch((err) => {
                        logger.error(`Error updating progress for job ${job.id}:`, err);
                    });
                });

                logger.info(`Job ${job.id} completed successfully. File saved at: ${result.filePath}`);
                return { filePath: result.filePath };
            } catch (err: any) {
                logger.error(`Job ${job.id} failed:`, err);
                throw err;
            }
        },
        { connection: redisConnection }
    );

    worker.on('failed', (job, err) => {
        logger.error(`Worker job ${job?.id} failed:`, err);
    });

    worker.on('completed', (job) => {
        logger.info(`Worker job ${job.id} completed`);
    });

    logger.info('Worker initialized and listening to queue...');
    return worker;
};
