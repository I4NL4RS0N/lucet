import { createContext, createElement, useContext } from 'react'
import type { ComponentType, ReactNode } from 'react'
import type { IconName } from './StateIcon'

/**
 * Icons as a slot, not a dependency.
 *
 * Same shape as the token interop. A component library that ships an icon set
 * makes an adoption decision on its host's behalf, and it is the kind of
 * dependency people reject a library over. But a library with no icons of its
 * own has no opinion, and a host whose product runs Lucide everywhere would
 * find our glyphs foreign next to their own.
 *
 * So: we draw a complete default set, and a host can replace any subset of it.
 * Ours is the fallback, exactly as our palette is the fallback when a shadcn
 * host defines none.
 *
 *   import { Icons } from 'lucet-react'
 *   import { OctagonX, TriangleAlert } from 'lucide-react'
 *
 *   <Icons.Provider icons={{ down: OctagonX, degraded: TriangleAlert }}>
 *     <App />
 *   </Icons.Provider>
 *
 * The map is partial on purpose. Override the three that clash with your set
 * and inherit the rest; there is no all-or-nothing switch.
 */

export interface IconProps {
  /** Pixel size. Hosts should treat this as authoritative. */
  size?: number
  className?: string
}

export type IconComponent = ComponentType<IconProps>

/** Any subset. Names not supplied fall back to Lucet's own glyph. */
export type IconOverrides = Partial<Record<IconName, IconComponent>>

const IconContext = createContext<IconOverrides>({})

export interface IconProviderProps {
  icons: IconOverrides
  children: ReactNode
}

function IconProvider({ icons, children }: IconProviderProps) {
  return createElement(IconContext.Provider, { value: icons }, children)
}

/** Returns the host's component for a name, or null to use ours. */
export function useIconOverride(name: IconName): IconComponent | null {
  return useContext(IconContext)[name] ?? null
}

export const Icons = { Provider: IconProvider }
