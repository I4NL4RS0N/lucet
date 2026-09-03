import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'lucet-core/styles.css'
import { About } from './About'
/* The lab pages' stylesheet carries the shell this page hangs from —
   the token mapping, .prim__main, .prim__title, .prim__lede. Reused
   rather than re-cut: one shell, one place it is defined. */
import '../primitives/primitives.css'
import './about.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <About />
  </StrictMode>,
)
