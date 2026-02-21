import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { apiLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/error';
import { logger } from './utils/logger';

// We will mount routes here later
import videoRoutes from './routes/video.routes';

const app: Express = express();

// Security Middlewares
app.use(helmet());
app.use(cors({
    origin: '*', // Adjust for production environments
    methods: ['GET', 'POST', 'OPTIONS'],
}));

// Parsing Middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend files
app.use(express.static('public'));

// Logging Middleware
app.use((req: Request, res: Response, next) => {
    logger.info(`[${req.method}] ${req.originalUrl}`);
    next();
});

// App Rate Limiter
app.use('/api/', apiLimiter);

// Health Check
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// API Routes mounting (commented out until routes are created)
app.use('/api/video', videoRoutes);

// 404 Handler
app.use((req: Request, res: Response) => {
    res.status(404).json({ status: 'error', message: 'Not Found' });
});

// Error handling middleware
app.use(errorHandler);

export default app;
