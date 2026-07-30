import type { BrowserContext } from './browser-context'

/**
 * Semua window browser yang sedang hidup.
 *
 * Handler IPC menentukan sasarannya dari webContents pengirim, sehingga satu set
 * handler melayani berapa pun jumlah window — tidak perlu menutup satu instance
 * TabManager di dalam closure seperti waktu masih satu window.
 */
const byChromeContents = new Map<number, BrowserContext>()
const order: BrowserContext[] = []

export function addContext(context: BrowserContext): void {
  byChromeContents.set(context.chromeWebContentsId, context)
  order.push(context)
}

export function removeContext(context: BrowserContext): void {
  byChromeContents.delete(context.chromeWebContentsId)
  const index = order.indexOf(context)
  if (index !== -1) order.splice(index, 1)
}

export function contextFor(webContentsId: number): BrowserContext | null {
  return byChromeContents.get(webContentsId) ?? null
}

/** Window yang sedang membuka profil tertentu, bila ada. */
export function contextForProfile(profileId: string): BrowserContext | null {
  return order.find((c) => c.profileId === profileId) ?? null
}

export function allContexts(): readonly BrowserContext[] {
  return order
}

/** Window pertama yang masih hidup; dipakai saat pengirimnya tidak diketahui. */
export function firstContext(): BrowserContext | null {
  return order[0] ?? null
}
