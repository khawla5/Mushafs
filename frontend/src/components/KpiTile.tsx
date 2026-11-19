import type { ReactNode } from 'react';
import { Icon } from './Icon';

const PALETTES = {
  sand: ['#fdebd3', '#f6d0a0', '#e0ac74'],
  terracotta: ['#f1d9cc', '#c99079', '#9E6752'],
  sage: ['#dfe4e8', '#8396a4', '#2D4354'],
  mist: ['#e8e8e1', '#b1b3a8', '#73766A'],
} as const;

export type KpiTone = keyof typeof PALETTES;

/** Layered hills drawn at the bottom of a tile (echoes the background artwork). */
function Hills({ tone }: { tone: KpiTone }) {
  const [a, b, c] = PALETTES[tone];
  return (
    <svg className="kpi-hills" viewBox="0 0 300 48" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 22 C40 10 80 26 130 18 C180 10 220 24 260 14 C280 10 292 12 300 14 L300 48 L0 48 Z" fill={a} />
      <path d="M0 32 C50 20 90 36 150 28 C200 22 240 34 300 24 L300 48 L0 48 Z" fill={b} />
      <path d="M0 42 C60 34 110 44 170 38 C220 34 260 42 300 36 L300 48 L0 48 Z" fill={c} />
    </svg>
  );
}

export function KpiTile({ icon, label, value, sub, tone }: { icon: string; label: string; value: ReactNode; sub?: ReactNode; tone: KpiTone }) {
  return (
    <div className="card kpi-tile">
      <div className="kpi-icon"><Icon name={icon} size={26} /></div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value num">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
      <Hills tone={tone} />
    </div>
  );
}
