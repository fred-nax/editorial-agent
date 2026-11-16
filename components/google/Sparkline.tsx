/** Mini graphique SVG maison (sans dépendance). */
export function Sparkline({
  values,
  className = "",
  stroke = "#0F5270",
}: {
  values: number[];
  className?: string;
  stroke?: string;
}) {
  const width = 240;
  const height = 56;
  const pad = 4;
  if (values.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        role="img"
        aria-label="Aucune donnée"
      >
        <text x="8" y="32" className="fill-slate-400 text-[10px]">
          Pas de série
        </text>
      </svg>
    );
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = pad + i * step;
      const y = height - pad - ((v - min) / span) * (height - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}
