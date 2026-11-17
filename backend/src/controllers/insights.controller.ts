import type { Request, Response } from 'express';
import { isManagement } from '../middleware/auth.js';
import { dashboard } from '../services/dashboard.service.js';
import { REPORTS, type ReportName } from '../services/reports.service.js';
import { notFound } from '../utils/http.js';

/** Detailed view (delays, stalls) is for management only; general view shows progress only. */
export async function getDashboard(req: Request, res: Response) {
  const requested = req.query.view === 'detailed' ? 'detailed' : 'general';
  const view = requested === 'detailed' && isManagement(req.user) ? 'detailed' : 'general';
  res.json(await dashboard(view));
}

export async function getReport(req: Request, res: Response) {
  const name = req.params.name as ReportName;
  const fn = REPORTS[name];
  if (!fn) throw notFound('report_not_found');
  const projectId = req.query.project_id ? Number(req.query.project_id) : null;
  const year = req.query.year ? Number(req.query.year) : null;
  res.json({ report: name, data: await fn({ projectId, year }) });
}

export function listReports(_req: Request, res: Response) {
  res.json({ reports: Object.keys(REPORTS) });
}
