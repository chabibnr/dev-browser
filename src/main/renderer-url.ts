import path from 'node:path'
import type { WebContents } from 'electron'

/**
 * Memuat bundle renderer (UI chrome & halaman internal) ke sebuah WebContents.
 * Dev server dipakai bila ada, selain itu berkas hasil build.
 */
export function loadRenderer(wc: WebContents, hash = ''): Promise<void> {
  const devURL = process.env['ELECTRON_RENDERER_URL']
  if (devURL) {
    return wc.loadURL(hash ? `${devURL}/#${hash}` : devURL)
  }
  const file = path.join(__dirname, '../renderer/index.html')
  return hash ? wc.loadFile(file, { hash }) : wc.loadFile(file)
}

export const INTERNAL_SCHEME = 'browser://'

export function isInternalURL(url: string): boolean {
  return url.startsWith(INTERNAL_SCHEME)
}

/** "browser://downloads" -> "/downloads" */
export function internalHash(url: string): string {
  return '/' + url.slice(INTERNAL_SCHEME.length).replace(/\/+$/, '')
}
