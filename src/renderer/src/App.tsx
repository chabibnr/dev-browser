import { useEffect, useRef, useState } from 'react'
import { useAppState } from './store'
import TabStrip from './components/TabStrip'
import Toolbar from './components/Toolbar'
import FindBar from './components/FindBar'
import SessionDialog from './components/SessionDialog'
import AboutDialog from './components/AboutDialog'
import SaveBar from './components/SaveBar'

/**
 * Hanya satu overlay yang boleh terbuka.
 *
 * Menu konteks TIDAK ada di sini: keduanya digambar sistem lewat Menu native,
 * sehingga tidak perlu melebarkan lapisan UI dan halaman tetap terlihat.
 * Yang tersisa hanyalah dialog, yang memang wajar menutupi halaman.
 */
type Overlay = { type: 'session' } | { type: 'about' } | null

export default function App(): React.JSX.Element {
  const state = useAppState()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const addressRef = useRef<HTMLInputElement>(null)

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId) ?? null

  useEffect(() => {
    // Shortcut dan item menu native ditangkap di main process, lalu dikirim ke
    // sini sebagai perintah UI.
    return window.browser.onCommand((command) => {
      switch (command.type) {
        case 'focusAddressBar':
          addressRef.current?.focus()
          addressRef.current?.select()
          break
        case 'startRename':
          setRenamingId(command.tabId)
          break
        case 'openAbout':
          setOverlay({ type: 'about' })
          void window.browser.setChromeMode('overlay')
          break
        case 'openFind':
        case 'closeFind':
          // Mode layout adalah sumber kebenarannya; render mengikuti state.mode.
          break
      }
    })
  }, [])

  // Main process bisa keluar dari mode overlay sendiri (mis. Escape), jadi
  // dialog ikut ditutup agar tidak tertinggal terbuka.
  useEffect(() => {
    if (state.mode !== 'overlay') setOverlay(null)
  }, [state.mode])

  function openOverlay(next: NonNullable<Overlay>): void {
    setOverlay(next)
    void window.browser.setChromeMode('overlay')
  }

  function closeOverlay(): void {
    setOverlay(null)
    void window.browser.setChromeMode('strip')
  }

  return (
    <div className="chrome">
      <TabStrip
        tabs={state.tabs}
        activeTabId={state.activeTabId}
        renamingId={renamingId}
        isMaximized={state.isMaximized}
        onStartRename={setRenamingId}
        onEndRename={() => setRenamingId(null)}
        onContextMenu={(tabId, x, y) => void window.browser.showTabMenu(tabId, x, y)}
      />
      <Toolbar
        tab={activeTab}
        addressRef={addressRef}
        activeDownloads={state.activeDownloads}
        onOpenSession={() => openOverlay({ type: 'session' })}
        credentialCount={state.credentialCount}
      />
      {/* Tinggi find bar di CSS harus sama dengan FINDBAR_HEIGHT, karena main
          process menggeser view halaman ke bawah sebanyak nilai itu. */}
      {state.mode === 'strip-find' && <FindBar key={state.activeTabId} tabId={state.activeTabId} />}
      {/* Tinggi bilah ini harus sama dengan SAVEBAR_HEIGHT: main process
          menggeser view halaman ke bawah sebanyak nilai itu. */}
      {state.mode === 'strip-save' && state.savePrompt && <SaveBar prompt={state.savePrompt} />}

      {overlay?.type === 'session' && activeTab && (
        <SessionDialog tab={activeTab} onClose={closeOverlay} />
      )}

      {overlay?.type === 'about' && <AboutDialog onClose={closeOverlay} />}
    </div>
  )
}
