/**
 * Identity avatar: initials on a disc. Promoted when the prompt input's turn
 * lock needed to show WHO holds the turn — in a multiplayer thread, the
 * clearest possible statement of "someone else is here" is their face, and
 * initials are the face this library can always derive.
 *
 * Identity only, deliberately: a bare avatar is a mark, not a control. When
 * one needs to be pressed it gets wrapped in a button by the pattern that
 * needs it (the lab stages that variant).
 */

export interface AvatarProps {
  /** The person's name. Initials are derived, so they can never disagree with it. */
  name: string
  size?: 'sm' | 'lg'
  /** Emphasis fill — for the assistant, or the thread owner. */
  solid?: boolean
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase()
}

export function Avatar({ name, size, solid = false }: AvatarProps) {
  return (
    <span
      className={`lucet-avatar${size ? ` lucet-avatar--${size}` : ''}${solid ? ' lucet-avatar--solid' : ''}`}
      title={name}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  )
}
