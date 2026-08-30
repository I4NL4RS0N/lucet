import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'lucet/styles.css'
import 'lucet-react/styles.css'
import { ComponentsStage } from './ComponentsStage'
import '../primitives/primitives.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ComponentsStage />
  </StrictMode>,
)
