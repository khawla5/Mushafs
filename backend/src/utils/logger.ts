import pino from 'pino';

const level = process.env.LOG_LEVEL || 'info';
const pretty = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

export const logger = pino({
  level,
  redact: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.national_id', '*.iban'],
  ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } } : {}),
});
