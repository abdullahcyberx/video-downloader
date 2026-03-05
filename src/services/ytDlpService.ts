import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error';

export interface VideoInfo {
    id: string;
    title: string;
    thumbnail: string;
    duration: number;
    formats: any[];
}

const parseStderrForError = (stderr: string): Error => {
    const lowerErr = stderr.toLowerCase();

    if (lowerErr.includes('requested format is not available')) {
        return new AppError('Format not available, try another quality', 400);
    }
    if (lowerErr.includes('sign in to confirm you’re not a bot') || lowerErr.includes('js challenge') || lowerErr.includes('challenge provider') || lowerErr.includes('http error 403') || lowerErr.includes('blocked')) {
        return new AppError('Video temporarily unavailable due to YouTube restrictions', 400);
    }
    if (lowerErr.includes('video unavailable')) {
        return new AppError('Video unavailable', 400);
    }
    if (lowerErr.includes('private video')) {
        return new AppError('Private video', 400);
    }
    if (lowerErr.includes('age restricted') || lowerErr.includes('sign in to confirm your age')) {
        return new AppError('Age restricted video', 400);
    }
    if (lowerErr.includes('no space left on device') || lowerErr.includes('disk full')) {
        return new AppError('Server is currently out of disk space. Please contact administrator.', 500);
    }
    if (lowerErr.includes('ffprobe or avprobe not found') || lowerErr.includes('ffmpeg not found')) {
        return new AppError('ffmpeg is missing from the server. Please contact administrator.', 500);
    }
    return new AppError(`Download failed: ${stderr.trim().split('\n').pop() || 'Unknown error'}`, 400);
};

export const ytDlpService = {
    async getInfo(url: string): Promise<VideoInfo> {
        return new Promise(async (resolve, reject) => {
            const args = [
                '--dump-json',
                '--no-playlist',
                '--no-warnings',
                '--force-ipv4',
                url
            ];

            const ytDlp = spawn('yt-dlp', args);

            let stdoutData = '';
            let stderrData = '';

            ytDlp.stdout.on('data', (data) => {
                stdoutData += data.toString();
            });

            ytDlp.stderr.on('data', (data) => {
                stderrData += data.toString();
            });

            ytDlp.on('close', async (code) => {
                if (code === 0) {
                    try {
                        const info = JSON.parse(stdoutData);

                        const availableFormats = [];
                        const has1080 = info.formats?.some((f: any) => f.height === 1080) || false;
                        const has720 = info.formats?.some((f: any) => f.height === 720) || false;
                        const has480 = info.formats?.some((f: any) => f.height === 480) || false;

                        if (has1080) availableFormats.push({ formatId: '1080', label: '1080p Video - High Quality' });
                        if (has720) availableFormats.push({ formatId: '720', label: '720p Video - Good Quality' });
                        if (has480) availableFormats.push({ formatId: '480', label: '480p Video - Normal Quality' });

                        if (availableFormats.length === 0) {
                            availableFormats.push({ formatId: '1080', label: 'Video - Best Available' });
                        }

                        availableFormats.push({ formatId: 'audio', label: 'Audio Only - MP3' });

                        resolve({
                            id: info.id,
                            title: info.title,
                            thumbnail: info.thumbnail,
                            duration: info.duration,
                            formats: availableFormats,
                        });
                    } catch (e: any) {
                        logger.error(`Failed to parse yt-dlp output: ${e.message}`, { stderr: stderrData });
                        reject(new AppError(`Failed to parse yt-dlp output: ${e.message}`, 500));
                    }
                } else {
                    logger.error(`yt-dlp process exited with code ${code}`, { stderr: stderrData });
                    reject(parseStderrForError(stderrData));
                }
            });
        });
    },

    async downloadVideo(
        url: string,
        format: '1080' | '720' | '480' | 'audio',
        onProgress: (progress: number) => void
    ): Promise<{ filePath: string }> {
        await fs.mkdir(config.tmpDir, { recursive: true });

        // Create a unique filename based on timestamp and a random string
        const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const outputTemplate = path.join(config.tmpDir, `%(id)s-${uniqueId}.%(ext)s`);

        const args = [
            '--newline',
            '--no-playlist',
            '--no-warnings',
            '--no-part',
            '--concurrent-fragments', '1',
            '-r', '5M',
            '--force-ipv4',
            '-o', outputTemplate,
        ];

        if (format === 'audio') {
            args.push('-x', '--audio-format', 'mp3');
        } else {
            // Updated fallback format chain explicitly requested by user
            args.push(
                '-f', `bestvideo[height<=${format}]+bestaudio/best[height<=${format}]/best[ext=mp4]/best`,
                '--merge-output-format', 'mp4'
            );
        }

        return new Promise(async (resolve, reject) => {
            args.push(url);

            logger.info(`Starting yt-dlp spawn with args: ${args.join(' ')}`);
            const ytDlp = spawn('yt-dlp', args);

            let finalFilePaths: string[] = [];
            let stderrData = '';

            // 5 minute timeout protection
            const timeoutDuration = 5 * 60 * 1000;
            const timeoutId = setTimeout(() => {
                logger.error(`yt-dlp process timed out after 5 minutes for url ${url}`);
                ytDlp.kill('SIGKILL');
            }, timeoutDuration);

            // Helper to clean up partial files on failure
            const cleanupPartialFiles = async () => {
                try {
                    const files = await fs.readdir(config.tmpDir);
                    for (const file of files) {
                        if (file.includes(uniqueId)) {
                            await fs.unlink(path.join(config.tmpDir, file)).catch(() => { });
                        }
                    }
                } catch (e) {
                    logger.error(`Failed to cleanup partial files for id ${uniqueId}`, e);
                }
            };

            // parseStderrForError moved to module scope

            ytDlp.stdout.on('data', (data) => {
                const output = data.toString();

                // Parse progress from output
                // Example output snippet: [download]  15.3% of ~50.00MiB at 3.00MiB/s ETA 00:14
                const progressMatch = output.match(/\[download\]\s+([\d\.]+)%/);
                if (progressMatch && progressMatch[1]) {
                    const progress = parseFloat(progressMatch[1]);
                    if (!isNaN(progress)) {
                        onProgress(progress);
                    }
                }

                // Try to match the final destination if it gets explicitly merged or downloaded
                const destMatch1 = output.match(/\[download\] Destination: (.*)/);
                const destMatch2 = output.match(/\[(?:ffmpeg|Merger)\] Merging formats into "(.*)"/);
                const destMatch3 = output.match(/\[ExtractAudio\] Destination: (.*)/);

                if (destMatch1) finalFilePaths.push(destMatch1[1]);
                if (destMatch2) finalFilePaths.push(destMatch2[1]);
                if (destMatch3) finalFilePaths.push(destMatch3[1]);
            });

            ytDlp.stderr.on('data', (data) => {
                stderrData += data.toString();
            });

            ytDlp.on('close', async (code, signal) => {
                clearTimeout(timeoutId);

                if (signal === 'SIGKILL') {
                    await cleanupPartialFiles();
                    return reject(new Error('Process Timeout (5 minutes exceeded)'));
                }

                if (code === 0) {
                    try {
                        let actualPath = '';
                        if (finalFilePaths.length === 0) {
                            const files = await fs.readdir(config.tmpDir);
                            const matchedFile = files.find(f => f.includes(uniqueId));
                            if (matchedFile) {
                                actualPath = path.join(config.tmpDir, matchedFile);
                            }
                        } else {
                            // The last destination printed by yt-dlp is usually the final path
                            actualPath = finalFilePaths[finalFilePaths.length - 1];
                        }

                        if (!actualPath && finalFilePaths.length === 0) {
                            // try searching by unique id if output parser failed completely
                            const files = await fs.readdir(config.tmpDir);
                            const matchedFile = files.find(f => f.includes(uniqueId));
                            if (matchedFile) {
                                actualPath = path.join(config.tmpDir, matchedFile);
                            } else {
                                await cleanupPartialFiles();
                                reject(new Error(`yt-dlp finished but final file path could not be determined. Output: ${stderrData}`));
                                return;
                            }
                        }

                        onProgress(100);
                        resolve({ filePath: actualPath.trim() });
                    } catch (err) {
                        await cleanupPartialFiles();
                        reject(err);
                    }
                } else {
                    logger.error(`yt-dlp failed: ${stderrData}`);
                    await cleanupPartialFiles();
                    reject(parseStderrForError(stderrData));
                }
            });

            ytDlp.on('error', async (err) => {
                clearTimeout(timeoutId);
                logger.error(`yt-dlp process spawn error:`, err);
                await cleanupPartialFiles();
                reject(new Error(`Failed to start yt-dlp process: ${err.message}`));
            });
        });
    }
};
