/**
 * Memetakan webContents UI ke window pemiliknya.
 *
 * Dibutuhkan karena `BaseWindow` tidak punya webContents sendiri — UI kita
 * hidup di dalam child `WebContentsView`, sehingga `BaseWindow.fromWebContents`
 * tidak bisa dipakai. Tanpa peta ini, tombol minimize/maximize/close harus
 * punya channel IPC terpisah untuk tiap window.
 */
export interface WindowControls {
  minimize(): void
  toggleMaximize(): void
  close(): void
}

const registry = new Map<number, WindowControls>()

export function registerWindow(webContentsId: number, controls: WindowControls): void {
  registry.set(webContentsId, controls)
}

export function unregisterWindow(webContentsId: number): void {
  registry.delete(webContentsId)
}

export function controlsFor(webContentsId: number): WindowControls | null {
  return registry.get(webContentsId) ?? null
}
