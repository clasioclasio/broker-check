export function Colonnade({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 360" fill="none" className={className} aria-hidden="true">
      <path d="M20 90 210 20l190 70H20Z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M20 90h380v14H20z" stroke="currentColor" strokeWidth="1.2" />
      {[50, 120, 190, 260, 330].map((x) => (
        <g key={x}>
          <rect x={x} y="116" width="40" height="190" stroke="currentColor" strokeWidth="1.2" />
          {[140, 160, 180, 200, 220, 240, 260].map((_, i) => (
            <path key={i} d={`M${x + 8 + i * 4} 124v174`} stroke="currentColor" strokeWidth=".6" opacity=".5" />
          ))}
          <rect x={x - 6} y="108" width="52" height="8" stroke="currentColor" strokeWidth="1.2" />
          <rect x={x - 6} y="306" width="52" height="8" stroke="currentColor" strokeWidth="1.2" />
        </g>
      ))}
      <path d="M8 322h404v10H8zM0 332h420v14H0z" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="210" cy="62" r="9" stroke="hsl(38 40% 61%)" strokeWidth="1.4" />
    </svg>
  );
}

export function Scales({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={className} aria-hidden="true">
      <path d="M60 14v88M40 104h40M22 34h76" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="60" cy="14" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M22 34 8 70h28L22 34ZM98 34 84 70h28L98 34Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 70c0 8 6 12 14 12s14-4 14-12M84 70c0 8 6 12 14 12s14-4 14-12" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2 sm:gap-3">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${light ? 'bg-accent text-primary' : 'bg-primary text-accent'}`}>
        <Scales className="h-6 w-6" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="whitespace-nowrap font-display text-sm font-semibold tracking-[0.08em] sm:text-base">BROKER CHECK</span>
        <span className="mt-1 text-xs font-medium tracking-[0.12em] opacity-80">Legal Analytics</span>
      </span>
    </span>
  );
}
