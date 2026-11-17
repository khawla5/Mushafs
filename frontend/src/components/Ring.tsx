/** Fitness-watch style ring (section 12.2). Shows the number alongside the colour. */
export function Ring({ pct, color, label, sub }: { pct: number | null; color: string; label: string; sub?: string }) {
  const size = 64;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="ring" title={sub}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${pct === null ? '—' : `${pct}%`}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--text)">
          {pct === null ? '—' : `${pct}%`}
        </text>
      </svg>
      <span>{label}</span>
      {sub && <span className="faint" style={{ fontSize: '0.7rem' }}>{sub}</span>}
    </div>
  );
}
