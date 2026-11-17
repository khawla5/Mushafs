import { Router } from 'express';
import { z } from 'zod';
import * as admin from '../controllers/admin.controller.js';
import * as users from '../controllers/users.controller.js';
import { MANAGEMENT, requireRoles } from '../middleware/auth.js';
import { idParam, validate } from '../middleware/validate.js';
import { settingsSchema } from '../services/settings.service.js';
import { ah } from '../utils/http.js';
import { password } from './auth.routes.js';

const router = Router();
const ROLES = ['admin', 'supervisor', 'production_manager', 'mujiz', 'technician', 'reader', 'reviewer', 'mixing_lead'] as const;

// Users & roles (ADM-01)
router.get('/users', requireRoles(...MANAGEMENT), validate(z.object({ role: z.enum(ROLES).optional(), active: z.enum(['true', 'false']).optional() }), 'query'), ah(users.listUsers));
router.post(
  '/users',
  requireRoles('admin'),
  validate(z.object({
    email: z.string().trim().toLowerCase().email(),
    full_name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(30).nullable().optional(),
    roles: z.array(z.enum(ROLES)).min(1),
    password,
    locale: z.enum(['ar', 'en']).default('ar'),
  })),
  ah(users.createUser),
);
router.patch(
  '/users/:id',
  requireRoles('admin'),
  validate(idParam, 'params'),
  validate(z.object({
    full_name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    roles: z.array(z.enum(ROLES)).min(1).optional(),
    is_active: z.boolean().optional(),
    locale: z.enum(['ar', 'en']).optional(),
  }).strict()),
  ah(users.updateUser),
);
router.post('/users/:id/reset-password', requireRoles('admin'), validate(idParam, 'params'), validate(z.object({ password })), ah(users.resetPassword));

// Settings (ADM-02): readable by everyone signed in (clients need e.g. auto-pass), editable by center management
router.get('/settings', ah(admin.readSettings));
router.put('/settings', requireRoles('admin'), validate(settingsSchema.partial().strict()), ah(admin.writeSettings));

// Note types (configurable by center management)
router.get('/note-types', validate(z.object({ all: z.enum(['true', 'false']).optional() }), 'query'), ah(admin.listNoteTypes));
const noteType = z.object({
  code: z.string().trim().regex(/^[a-z_]{2,40}$/),
  name_ar: z.string().trim().min(1).max(80),
  name_en: z.string().trim().min(1).max(80),
  severity: z.number().int().min(1).max(5).default(1),
  is_clear_error: z.boolean().default(false),
  is_technical: z.boolean().default(false),
  sort_order: z.number().int().min(0).max(100).default(10),
});
router.post('/note-types', requireRoles('admin'), validate(noteType), ah(admin.createNoteType));
router.patch(
  '/note-types/:id',
  requireRoles('admin'),
  validate(idParam, 'params'),
  validate(noteType.omit({ code: true }).partial().extend({ is_active: z.boolean().optional() }).strict()),
  ah(admin.updateNoteType),
);

// Audit log (ADM-03)
router.get(
  '/audit',
  requireRoles('admin', 'supervisor'),
  validate(z.object({
    entity: z.string().max(40).optional(),
    user_id: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
    offset: z.coerce.number().int().min(0).default(0),
  }), 'query'),
  ah(admin.listAudit),
);

// Notifications (ADM-04)
router.get('/notifications', ah(admin.listNotifications));
router.get('/notifications/stream', admin.notificationStream);
router.post('/notifications/read-all', ah(admin.markAllRead));
router.post('/notifications/:id/read', validate(idParam, 'params'), ah(admin.markRead));

// Quran reference data
router.get('/quran/surahs', ah(admin.surahs));

export default router;
