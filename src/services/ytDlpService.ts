import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export interface VideoInfo {
    id: string;
    title: string;
    thumbnail: string;
    duration: number;
    formats: any[];
}

export const ytDlpService = {
    async getInfo(url: string): Promise<VideoInfo> {
        return new Promise(async (resolve, reject) => {
            const args = [
                '--dump-json',
                '--no-playlist',
                '--js-runtimes', 'node',
                // Heavy anti-bot evasion for Railway IPs
                '--impersonate', 'Chrome',
                '--force-ipv4',
                '--extractor-args', 'youtube:player_client=ios,android,web',
            ];

            let cookiesFilePath: string | null = null;
            if (config.youtubeCookies) {
                logger.info(`YOUTUBE_COOKIES env var detected. Length: ${config.youtubeCookies.length}, Has Newlines: ${config.youtubeCookies.includes('\n')}`);
                if (!config.youtubeCookies.includes('\n')) {
                    logger.warn(`YOUTUBE_COOKIES string lacks newlines! It may have been mangled by Railway UI. The Netscape format requires newlines.`);
                }
                await fs.mkdir(config.tmpDir, { recursive: true });
                cookiesFilePath = path.join(config.tmpDir, `cookies-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.txt`);
                // Replace literal \n occurrences if they got escaped into physical characters
                const sanitizedCookies = config.youtubeCookies.replace(/\\n/g, '\n');
                await fs.writeFile(cookiesFilePath, sanitizedCookies, 'utf8');
                args.push('--cookies', cookiesFilePath);
            }

            args.push(url);

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
                // Cleanup temp cookies file if created
                if (cookiesFilePath) {
                    try {
                        await fs.unlink(cookiesFilePath);
                    } catch (err) {
                        logger.error(`Failed to delete temporary cookies file: ${cookiesFilePath}`, err);
                    }
                }

                if (code === 0) {
                    try {
                        const info = JSON.parse(stdoutData);
                        resolve({
                            id: info.id,
                            title: info.title,
                            thumbnail: info.thumbnail,
                            duration: info.duration,
                            formats: info.formats,
                        });
                    } catch (e: any) {
                        logger.error(`Failed to parse yt-dlp output: ${e.message}`, { stderr: stderrData });
                        reject(new Error(`Failed to parse yt-dlp output: ${e.message}`));
                    }
                } else {
                    logger.error(`yt-dlp process exited with code ${code}`, { stderr: stderrData });
                    reject(new Error(`yt-dlp process exited with code ${code}: ${stderrData}`));
                }
            });
        });
    },

    async downloadVideo(
        url: string,
        format: 'video' | 'audio',
        onProgress: (progress: number) => void
    ): Promise<{ filePath: string }> {
        await fs.mkdir(config.tmpDir, { recursive: true });

        // Create a unique filename based on timestamp and a random string
        const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const outputTemplate = path.join(config.tmpDir, `%(id)s-${uniqueId}.%(ext)s`);

        const args = [
            '--newline',
            '--no-playlist',
            '--js-runtimes', 'node',
            // Heavy anti-bot evasion for Railway IPs
            '--impersonate', 'Chrome',
            '--force-ipv4',
            '--extractor-args', 'youtube:player_client=ios,android,web',
            '-o', outputTemplate,
        ];

        if (format === 'audio') {
            args.push('-x', '--audio-format', 'mp3');
        } else {
            // Strictly enforce H.264 (avc) video and AAC (mp4a) audio codecs to ensure broad native player compatibility
            args.push('-f', 'bestvideo[vcodec^=avc]+bestaudio[acodec^=mp4a]/best', '--merge-output-format', 'mp4');
        }

        return new Promise(async (resolve, reject) => {
            let cookiesFilePath: string | null = null;
            if (config.youtubeCookies) {
                cookiesFilePath = path.join(config.tmpDir, `cookies-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.txt`);
                const sanitizedCookies = config.youtubeCookies.replace(/\\n/g, '\n');
                await fs.writeFile(cookiesFilePath, sanitizedCookies, 'utf8');
                args.push('--cookies', cookiesFilePath);
            }

            args.push(url);

            logger.info(`Starting yt-dlp spawn with args: ${args.join(' ')}`);
            const ytDlp = spawn('yt-dlp', args);

            let finalFilePaths: string[] = [];
            let stderrData = '';

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

            ytDlp.on('close', async (code) => {
                if (cookiesFilePath) {
                    try {
                        await fs.unlink(cookiesFilePath);
                    } catch (err) {
                        logger.error(`Failed to delete temporary cookies file: ${cookiesFilePath}`, err);
                    }
                }
                if (code === 0) {
                    try {
                        // Find the actual existing file from candidates (since yt-dlp handles temporary naming too)
                        let actualPath = '';
                        // sometimes it just prints "has already been downloaded"
                        if (finalFilePaths.length === 0) {
                            // we might need to fallback. For a robust solution, yt-dlp can output the final filename with --print
                            // But since we just watch stdout, let's rely on finding the file in tmpDir that starts with the id
                            // Actually, a better approach is to tell yt-dlp to just download it, then we read the folder
                            // However, since we used a uniqueId, we can just glob/search the tmpDir for it.
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
                                reject(new Error(`yt-dlp finished but final file path could not be determined. Output: ${stderrData}`));
                                return;
                            }
                        }

                        onProgress(100);
                        resolve({ filePath: actualPath.trim() });
                    } catch (err) {
                        reject(err);
                    }
                } else {
                    logger.error(`yt-dlp failed: ${stderrData}`);
                    reject(new Error(`yt-dlp process exited with code ${code}`));
                }
            });
        });
    }
};
