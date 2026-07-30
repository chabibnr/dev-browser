import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import Downloads from './pages/Downloads'
import Responsive from './pages/Responsive'
import Passwords from './pages/Passwords'
import Manager from './pages/Manager'
import { initStore } from './store'
import './styles.css'

/**
 * Bundle yang sama melayani tiga peran: UI chrome window utama, halaman internal
 * seperti browser://downloads, dan UI window uji responsif. Hash pada URL yang
 * membedakannya.
 */
const route = window.location.hash.replace(/^#/, '')

function Root(): React.JSX.Element {
  if (route.startsWith('/manager')) return <Manager />
  if (route.startsWith('/responsive')) return <Responsive />
  if (route.startsWith('/downloads')) return <Downloads />
  if (route.startsWith('/passwords')) return <Passwords />
  return <App />
}

// Store tab hanya relevan untuk UI chrome window utama.
if (route === '' || route === '/') initStore()

const container = document.getElementById('root')
if (!container) throw new Error('#root tidak ditemukan')

createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>
)
