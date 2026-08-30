import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'lucet/styles.css'
import { Primitives } from './Primitives'
import './primitives.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Primitives />
  </StrictMode>,
)
