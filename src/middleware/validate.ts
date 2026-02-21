import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AppError } from './error';

export const validate = (schema: Joi.ObjectSchema) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const { error, value } = schema.validate(req.body, { abortEarly: false, allowUnknown: true });

        if (error) {
            const errorMessage = error.details.map((details) => details.message).join(', ');
            return next(new AppError(`Validation Error: ${errorMessage}`, 400));
        }

        // Attach validated value to request object
        req.body = value;
        return next();
    };
};

export const urlSchema = Joi.object({
    url: Joi.string()
        .uri({ scheme: ['http', 'https'] })
        .pattern(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be|twitter\.com|x\.com|facebook\.com|instagram\.com|tiktok\.com|vimeo\.com|dailymotion\.com|twitch\.tv)\/.+$/)
        .required()
        .messages({
            'string.pattern.base': 'URL must be a valid link from a supported platform (e.g., YouTube, Twitter, TikTok, etc.)'
        }),
});

export const downloadSchema = urlSchema.keys({
    format: Joi.string().valid('video', 'audio').default('video'),
});
