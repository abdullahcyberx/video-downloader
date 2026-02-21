import dotenv from 'dotenv';
import path from 'path';
import os from 'os';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  nodeEnv: process.env.NODE_ENV || 'development',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '1073741824', 10),
  tmpDir: process.env.TMP_DIR || path.join(os.tmpdir(), 'yt-downloads'),
};
