import type { Session } from 'electron'
import { ResponsiveWindow } from './window'

/**
 * Hanya satu window uji responsif yang hidup pada satu waktu.
 *
 * Membuka lebih dari satu berarti belasan proses renderer sekaligus, dan tiap
 * window akan berebut menulis pengaturan device yang sama. Permintaan berikutnya
 * mengarahkan ulang window yang sudah ada.
 */
let current: ResponsiveWindow | null = null

export function openResponsive(url: string, session: Session, sessionLabel: string): void {
  if (current) {
    current.setURL(url)
    current.focus()
    return
  }
  current = new ResponsiveWindow(url, session, sessionLabel, () => {
    current = null
  })
}

export function responsiveWindow(): ResponsiveWindow | null {
  return current
}
