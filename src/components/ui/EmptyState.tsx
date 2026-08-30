export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="text-center py-16 px-4">
      <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-primary-light flex items-center justify-center text-2xl">
        🎫
      </div>
      <h3 className="font-display font-semibold text-lg">{title}</h3>
      {description && <p className="text-ink/60 text-sm mt-1 max-w-sm mx-auto">{description}</p>}
    </div>
  )
}
