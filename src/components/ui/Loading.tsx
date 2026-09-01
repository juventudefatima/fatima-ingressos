export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink/60">
      <div className="dot-spinner" role="status" aria-label={label}>
        <div className="dot-spinner__dot" />
        <div className="dot-spinner__dot" />
        <div className="dot-spinner__dot" />
        <div className="dot-spinner__dot" />
        <div className="dot-spinner__dot" />
        <div className="dot-spinner__dot" />
        <div className="dot-spinner__dot" />
        <div className="dot-spinner__dot" />
      </div>
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-ink/10 ${className}`} />
}
