import { SelectHTMLAttributes, forwardRef } from 'react'

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
}

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { label, className = '', id, children, ...rest },
  ref,
) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-ink/70 mb-1.5">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={`w-full rounded-xl border border-line px-4 py-3 text-base bg-surface text-ink outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary ${className}`}
        {...rest}
      >
        {children}
      </select>
    </div>
  )
})
