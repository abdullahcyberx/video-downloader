import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export class AppError extends Error {
    public statusCode: number;
    public isOperational: boolean;

    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    let { statusCode, message } = err;

    if (!err.isOperational) {
        statusCode = 500;
        message = 'Internal Server Error';
        logger.error(`[Unhandled Error] ${err.message}`, { stack: err.stack, path: req.path });
    } else {
        statusCode = statusCode || 500;
        logger.error(`[App Error] ${message}`, { statusCode, path: req.path });
    }

    res.status(statusCode).json({
        status: 'error',
        statusCode,
        message,
    });
};
