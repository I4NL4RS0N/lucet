import type { ButtonHTMLAttributes } from 'react'

/**
 * The one button.
 *
 * Not a baseline component in its own right, but every other component needs
 * one and letting each invent its own is how a system loses coherence in a
 * fortnight.
 */

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
}

export function Button({ variant = 'secondary', className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={className ? `lucet-button ${className}` : 'lucet-button'}
      data-variant={variant}
      {...props}
    />
  )
}
