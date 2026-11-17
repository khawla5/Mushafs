import { Router } from 'express';
import { z } from 'zod';
import * as s from '../controllers/sessions.controller.js';
import * as insights from '../controllers/insights.controller.js';
import * as work from '../controllers/work.controller.js';
import { MANAGEMENT, requireRoles } from '../middleware/auth.js';
import { audioUpload } from '../middleware/upload.js';
import { idParam, optionalText, trimmed, validate } from '../middleware/validate.js';
import { ah } from '../utils/http.js';

const router = Router();
const id = validate(idParam, 'params');

router.get('/me/work', ah(work.myWork));

// Sessions
router.get('/sessions/:id', id, ah(s.getSession));
router.post('/sessions/:id/versions', id, audioUpload, ah(s.uploadVersion));
router.post('/sessions/:id/pass', id, ah(s.pass));
router.post('/sessions/:id/extra-round', requireRoles(...MANAGEMENT), id, validate(z.object({ reviewer_id: z.number().int().positive() })), ah(s.extraRound));
router.post('/sessions/:id/forward-notes', requireRoles('admin', 'production_manager'), id, ah(s.forward));

// Versions (streaming & download)
router.get('/versions/:id/stream', id, validate(z.object({ quality: z.enum(['light', 'original']).optional() }), 'query'), ah(s.streamVersion));
router.get('/versions/:id/download', id, ah(s.downloadVersion));

// Rounds & notes
const noteBody = z.object({
  note_type_id: z.number().int().positive(),
  surah: z.number().int().min(1).max(114),
  ayah: z.number().int().min(1).max(286),
  timestamp_sec: z.number().min(0).max(24 * 3600),
  body: trimmed(4000),
});
router.post('/rounds/:id/notes', id, validate(noteBody), ah(s.addNote));
router.post('/rounds/:id/submit', id, ah(s.submit));
router.patch('/notes/:id', id, validate(noteBody.partial().strict()), ah(s.updateNote));
router.delete('/notes/:id', id, ah(s.deleteNote));
router.post('/notes/:id/decision', id, validate(z.object({ decision: z.enum(['accept', 'reject', 'studio', 'technician']), comment: optionalText(1000) })), ah(s.decide));

// Corrections
router.patch(
  '/corrections/:id',
  id,
  validate(z.object({ is_rerecord: z.boolean(), ayah_from: z.number().int().min(1).max(286), ayah_to: z.number().int().min(1).max(286) })),
  ah(s.updateCorrection),
);
router.post('/corrections/:id/verify', id, ah(s.verifyCorrection));

// Dashboard & reports (section 12)
router.get('/dashboard', validate(z.object({ view: z.enum(['general', 'detailed']).optional() }), 'query'), ah(insights.getDashboard));
router.get('/reports', requireRoles(...MANAGEMENT), insights.listReports);
router.get(
  '/reports/:name',
  requireRoles(...MANAGEMENT),
  validate(z.object({ project_id: z.coerce.number().int().positive().optional(), year: z.coerce.number().int().min(2000).max(2100).optional() }), 'query'),
  ah(insights.getReport),
);

export default router;
