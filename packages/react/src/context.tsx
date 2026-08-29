import { createContext, createElement, useContext } from 'react'
import type { ReactNode } from 'react'
import type { Lucet } from 'lucet'

const LucetContext = createContext<Lucet | null>(null)

export interface LucetProviderProps {
  lucet: Lucet
  children: ReactNode
}

export function LucetProvider({ lucet, children }: LucetProviderProps) {
  return createElement(LucetContext.Provider, { value: lucet }, children)
}

export function useLucet(): Lucet {
  const lucet = useContext(LucetContext)
  if (!lucet) throw new Error('useLucet must be used inside <LucetProvider>')
  return lucet
}
