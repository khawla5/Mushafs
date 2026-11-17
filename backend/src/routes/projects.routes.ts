import { Router } from 'express';
import { z } from 'zod';
import * as att from '../controllers/attendance.controller.js';
import * as p from '../controllers/projects.controller.js';
import * as prod from '../controllers/production.controller.js';
import { MANAGEMENT, requireRoles } from '../middleware/auth.js';
import { idParam, isoDate, optionalText, trimmed, validate } from '../middleware/validate.js';
import { ah } from '../utils/http.js';

const router = Router();
const weekdays = z.array(z.number().int().min(0).max(6)).max(7).transform((a) => [...new Set(a)].sort());
const TEAM_ROLES = ['mujiz', 'technician', 'reviewer1', 'reviewer2', 'final_reviewer', 'mixing_lead'] as const;

router.get('/templates', ah(p.listTemplates));
router.get('/projects', validate(z.object({ status: z.string().max(30).optional(), type: z.enum(['mushaf', 'hadith', 'recitation']).optional() }), 'query'), ah(p.listProjects));
router.post(
  '/projects',
  requireRoles('admin', 'production_manager'),
  validate(z.object({
    title: trimmed(200),
    project_type: z.enum(['mushaf', 'hadith', 'recitation']),
    riwayah: trimmed(80),
    reader_id: z.number().int().positive(),
    session_count: z.number().int().min(1).max(600).optional(),
    recording_weekdays: weekdays.default([]),
    sessions_per_day: z.number().int().min(1).max(4).default(1),
    description: optionalText(2000),
  })),
  ah(p.createProject),
);

router.use('/projects/:id', validate(idParam, 'params'));
router.get('/projects/:id', ah(p.getProject));
router.patch(
  '/projects/:id',
  requireRoles(...MANAGEMENT),
  validate(z.object({
    title: trimmed(200).optional(),
    riwayah: trimmed(80).optional(),
    description: optionalText(2000),
    recording_weekdays: weekdays.optional(),
    sessions_per_day: z.number().int().min(1).max(4).optional(),
  }).strict()),
  ah(p.updateProject),
);
router.post('/projects/:id/approve', requireRoles('admin'), ah(p.approve));
router.post('/projects/:id/start', requireRoles('admin', 'production_manager'), ah(p.start));
router.post('/projects/:id/complete', requireRoles('admin', 'production_manager'), ah(p.complete));
router.post('/projects/:id/cancel', requireRoles('admin'), validate(z.object({ reason: optionalText(500) })), ah(p.cancel));

// Team
router.get('/projects/:id/team/history', ah(p.teamHistory));
router.post(
  '/projects/:id/team',
  requireRoles('admin', 'production_manager'),
  validate(z.object({ team_role: z.enum(TEAM_ROLES), user_id: z.number().int().positive(), reason: optionalText(500) })),
  ah(p.assignMember),
);
router.delete(
  '/projects/:id/team/:memberId',
  requireRoles('admin', 'production_manager'),
  validate(z.object({ id: z.coerce.number().int().positive(), memberId: z.coerce.number().int().positive() }), 'params'),
  ah(p.removeMember),
);

// Sessions grid, general notes, journey
router.get('/projects/:id/sessions', ah(p.projectSessions));
router.get('/projects/:id/general-notes', ah(p.listGeneralNotes));
router.post('/projects/:id/general-notes', validate(z.object({ body: trimmed(4000), references_text: optionalText(2000) })), ah(p.addGeneralNote));
router.get('/projects/:id/journey', ah(p.journey));

// Attendance & excuses
router.get('/projects/:id/today', ah(att.today));
router.post(
  '/projects/:id/checkin',
  validate(z.object({
    role: z.enum(['reader', 'mujiz', 'technician']),
    outcome: z.enum(['full', 'two_sessions', 'corrections_only', 'incomplete']).optional(),
    outcome_note: optionalText(500),
  })),
  ah(att.checkIn),
);
router.post('/projects/:id/excuses', validate(z.object({ date_from: isoDate, date_to: isoDate, reason: trimmed(500) })), ah(att.createExcuse));

// Quality & mixing & final review
router.get('/projects/:id/quality', ah(prod.listQuality));
router.post('/projects/:id/quality/random', ah(prod.requestRandomSample));
router.get('/projects/:id/raw-archive', ah(prod.rawArchive));
router.get('/projects/:id/final-review', ah(prod.finalAssignments));
router.post(
  '/projects/:id/final-review',
  requireRoles('admin', 'production_manager'),
  validate(z.object({
    split: z.enum(['whole', 'half', 'third', 'quarter']),
    parts: z.array(z.object({ reviewer_id: z.number().int().positive(), from: z.number().int().min(1), to: z.number().int().min(1) })).min(1).max(4),
  })),
  ah(prod.finalReview),
);

// Distribution log
const distribution = z.object({
  recipient: trimmed(200),
  channel: z.enum(['netia', 'satellite', 'direct', 'portal', 'other']),
  country: optionalText(80),
  city: optionalText(80),
  output_version: optionalText(80),
  delivered_on: isoDate,
  notes: optionalText(1000),
  feedback: optionalText(2000),
});
router.get('/projects/:id/distributions', ah(prod.listDistributions));
router.post('/projects/:id/distributions', requireRoles(...MANAGEMENT), validate(distribution), ah(prod.addDistribution));

// Standalone resources
const standalone = Router();
standalone.patch('/distributions/:id', requireRoles(...MANAGEMENT), validate(idParam, 'params'), validate(distribution.partial().strict()), ah(prod.updateDistribution));
standalone.delete('/distributions/:id', requireRoles(...MANAGEMENT), validate(idParam, 'params'), ah(prod.deleteDistribution));
standalone.post('/quality/:id/rate', validate(idParam, 'params'), validate(z.object({ verdict: z.enum(['approved', 'not_suitable']), notes: optionalText(2000) })), ah(prod.rateQuality));
standalone.patch('/excuses/:id', requireRoles(...MANAGEMENT), validate(idParam, 'params'), validate(z.object({ status: z.enum(['accepted', 'rejected']) })), ah(att.setExcuseStatus));
standalone.get(
  '/attendance',
  validate(z.object({ project_id: z.coerce.number().int().positive().optional(), user_id: z.coerce.number().int().positive().optional() }), 'query'),
  ah(att.attendanceLog),
);

export { standalone as productionRoutes };
export default router;
