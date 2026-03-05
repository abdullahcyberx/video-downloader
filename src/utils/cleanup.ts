import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger';

export const cleanOldTempFiles = async (dir: string, maxAgeMinutes: number) => {
    try {
        const files = await fs.readdir(dir);
        const now = Date.now();
        const maxAgeMs = maxAgeMinutes * 60 * 1000;

        let deletedCount = 0;

        for (const file of files) {
            const filePath = path.join(dir, file);
            try {
                const stats = await fs.stat(filePath);
                if (now - stats.mtimeMs > maxAgeMs) {
                    await fs.unlink(filePath);
                    deletedCount++;
                }
            } catch (err: any) {
                // Ignore errors for individual files (e.g., if it was just deleted by another process)
                if (err.code !== 'ENOENT') {
                    logger.error(`Failed to check or delete temp file ${filePath}`, err);
                }
            }
        }

        if (deletedCount > 0) {
            logger.info(`Cleaned up ${deletedCount} old temp files from ${dir}`);
        }
    } catch (err: any) {
        if (err.code !== 'ENOENT') {
            logger.error(`Failed to run temp directory cleanup on ${dir}`, err);
        }
    }
};
