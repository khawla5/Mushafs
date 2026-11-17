import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as c from '../controllers/auth.controller.js';
import * as profile from '../controllers/profile.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { documentUpload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { ah } from '../utils/http.js';

const router = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

export const password = z.string().min(8, 'At least 8 characters').max(128);

router.post(
  '/login',
  loginLimiter,
  validate(z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128) })),
  ah(c.login),
);
router.post('/logout', ah(c.logout));
router.get('/me', requireAuth, ah(c.me));
router.patch(
  '/me',
  requireAuth,
  validate(
    z.object({
      locale: z.enum(['ar', 'en']).optional(),
      full_name: z.string().trim().min(1).max(120).optional(),
      phone: z.string().trim().max(30).nullable().optional(),
      current_password: z.string().max(128).optional(),
      new_password: password.optional(),
    }).strict(),
  ),
  ah(c.updateMe),
);

// Personal data (RDR-01): own profile, or another user's for admins
const privateSchema = z.object({
  national_id: z.string().trim().regex(/^[0-9A-Za-z]{5,20}$/, 'Invalid ID number').optional(),
  iban: z.string().trim().toUpperCase().transform((v) => v.replace(/\s+/g, '')).pipe(z.string().regex(/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/, 'Invalid IBAN')).optional(),
}).strict();

router.get('/private/:userId', requireAuth, ah(profile.getPrivate));
router.put('/private/:userId', requireAuth, validate(privateSchema), ah(profile.updatePrivate));
router.post('/private/:userId/document', requireAuth, documentUpload, ah(profile.uploadDocument));
router.get('/private/:userId/document', requireAuth, ah(profile.downloadDocument));

export default router;
