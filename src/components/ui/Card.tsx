import { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Levanta levemente e aumenta a sombra no hover — use em cards clicáveis. */
  hoverable?: boolean
  /** Anima a entrada do card (fade + leve subida). Não afeta o layout ao redor. */
  animateIn?: boolean
}

export function Card({ className = '', hoverable = false, animateIn = false, children, ...rest }: CardProps) {
  return (
    <div
      className={`bg-surface rounded-2xl shadow-card border border-line/60 transition-shadow duration-200 ${
        hoverable ? 'hover:shadow-lg hover:-translate-y-0.5 transition-transform' : ''
      } ${animateIn ? 'animate-fade-in-up' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}
