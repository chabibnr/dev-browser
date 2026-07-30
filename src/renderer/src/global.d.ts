import type { BrowserAPI } from '../../preload'

declare global {
  interface Window {
    browser: BrowserAPI
  }
}

export {}
