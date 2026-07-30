import type { Event, Input } from 'electron'
import { displayTitle } from '@shared/types'
import { getSession } from './session-store'
import { openResponsive } from './responsive'
import { openManagerWindow } from './manager-bridge'
import type { BrowserContext } from './browser-context'

/**
 * Shortcut ditangani di main process lewat `before-input-event`.
 *
 * Ini bukan pilihan gaya: saat pengguna sedang membaca sebuah halaman, fokus
 * keyboard berada di view halaman, bukan di UI chrome. Listener `keydown` di
 * React tidak akan pernah menerima Ctrl+T atau Ctrl+W. Satu-satunya tempat yang
 * melihat semua penekanan tombol adalah main process.
 */
export function handleInput(
  context: BrowserContext,
  tabId: string,
  input: Input,
  event: Event,
  onNewWindow: () => void
): void {
  if (input.type !== 'keyDown') return

  const { tm, shell } = context
  const mod = input.control || input.meta
  const key = input.key.toLowerCase()
  const consume = (): void => event.preventDefault()

  if (mod && input.shift && key === 'o') {
    consume()
    void openManagerWindow()
    return
  }

  if (mod && input.shift && key === 'm') {
    consume()
    const tab = tm.active
    if (tab) openResponsive(tab.url, getSession(tab.sessionId), displayTitle(tab.toState()))
    return
  }

  if (mod && !input.alt) {
    switch (key) {
      case 'n':
        consume()
        onNewWindow()
        return
      case 't':
        consume()
        tm.create()
        tm.sendCommand({ type: 'focusAddressBar' })
        return
      case 'w':
        consume()
        tm.close(tabId)
        return
      case 'l':
        consume()
        shell.focusChrome()
        tm.sendCommand({ type: 'focusAddressBar' })
        return
      case 'f':
        consume()
        shell.setMode('strip-find')
        shell.focusChrome()
        tm.sendCommand({ type: 'openFind' })
        tm.notify()
        return
      case 'r':
        consume()
        tm.active?.reload()
        return
      case 'tab':
        consume()
        tm.cycle(input.shift ? -1 : 1)
        return
    }

    // Ctrl+1..8 lompat ke tab ke-n, Ctrl+9 ke tab terakhir (seperti Chrome).
    if (/^[1-9]$/.test(key)) {
      consume()
      tm.activateIndex(key === '9' ? -1 : Number(key) - 1)
      return
    }
  }

  if (input.alt && !mod) {
    if (key === 'arrowleft') {
      consume()
      tm.active?.goBack()
      return
    }
    if (key === 'arrowright') {
      consume()
      tm.active?.goForward()
      return
    }
  }

  switch (key) {
    case 'f2': {
      consume()
      const activeId = tm.activeTabId
      if (activeId) {
        shell.focusChrome()
        tm.sendCommand({ type: 'startRename', tabId: activeId })
      }
      return
    }
    case 'f12':
      consume()
      tm.active?.toggleDevTools()
      return
    case 'f5':
      consume()
      tm.active?.reload()
      return
    case 'escape':
      // Escape ditangani di sini saja, baik fokus ada di find bar, dialog, maupun
      // halaman, supaya tidak ada dua jalur penutupan yang bisa berbeda hasilnya.
      if (shell.getMode() === 'strip-find') {
        consume()
        tm.active?.stopFind()
        shell.setMode('strip')
        tm.sendCommand({ type: 'closeFind' })
        tm.notify()
      } else if (shell.getMode() === 'overlay') {
        consume()
        // UI menutup dialognya sendiri saat melihat mode kembali ke `strip`.
        shell.setMode('strip')
        tm.notify()
      }
      return
  }
}
