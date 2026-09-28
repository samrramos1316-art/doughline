// DoughTally wordmark: a loaf whose score line doubles as a rising trend line.
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#1c1917" />
      <path d="M7 20.5c0-5.5 4-9.5 9-9.5s9 4 9 9.5c0 1.1-.9 2-2 2H9c-1.1 0-2-.9-2-2Z" fill="#f59e0b" />
      <path d="M10.5 18.5l3.5-3 3 2 4.5-4.5" fill="none" stroke="#1c1917" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark />
      <span className={`text-lg font-semibold tracking-tight ${light ? "text-white" : "text-stone-900"}`}>DoughTally</span>
    </span>
  );
}
