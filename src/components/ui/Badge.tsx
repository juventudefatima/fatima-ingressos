export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'danger'
}) {
  const tones = {
    neutral: 'bg-ink/5 text-ink/70',
    success: 'bg-primary-light text-primary-dark',
    warning: 'bg-accent/20 text-accent-dark',
    danger: 'bg-danger/10 text-danger',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  )
}
