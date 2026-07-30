import { useEffect, useState } from 'react'
import type { ResponsiveState } from '@shared/types'
import { prettyURL } from '@shared/url'
import Icon from '../components/Icon'
import WindowControls from '../components/WindowControls'
import DeviceManager from '../components/DeviceManager'
import ZoomStepper from '../components/ZoomStepper'

/**
 * UI window uji responsif.
 *
 * Halaman ini TIDAK menghitung tata letak. Main process mengirim posisi jadi
 * tiap viewport, dan di sini hanya digambar label serta bingkainya pada
 * koordinat itu. Viewport native menumpuk tepat di atas bingkai tersebut —
 * kalau posisinya dihitung dua kali, keduanya akan saling telat saat digulir.
 */
export default function Responsive(): React.JSX.Element {
  const [state, setState] = useState<ResponsiveState | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [managerOpen, setManagerOpen] = useState(false)

  useEffect(() => {
    void window.browser.responsive.getState().then((initial) => {
      if (initial) setState(initial)
    })
    return window.browser.responsive.onChanged(setState)
  }, [])

  function openManager(): void {
    setManagerOpen(true)
    // Viewport native harus disembunyikan dulu, kalau tidak ia akan menimpa dialog.
    void window.browser.responsive.setOverlay(true)
  }

  function closeManager(): void {
    setManagerOpen(false)
    void window.browser.responsive.setOverlay(false)
  }

  if (!state) return <div className="resp" />

  const value = draft ?? prettyURL(state.url)

  return (
    <div className="resp">
      <div className="resp__bar">
        <div className="resp__row">
          <span className="resp__title">Uji responsif</span>
          <span className="resp__session" title="Semua viewport memakai sesi tab ini">
            sesi: {state.sessionLabel}
          </span>
          <div className="resp__spacer" />
          <WindowControls isMaximized={state.isMaximized} />
        </div>

        <div className="resp__row resp__row--controls">
          <button
            className="toolbar__btn"
            title="Muat ulang semua viewport"
            onClick={() => void window.browser.responsive.reloadAll()}
          >
            <Icon name="reload" />
          </button>

          <input
            className="toolbar__address"
            placeholder="Alamat yang diuji"
            spellCheck={false}
            value={value}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void window.browser.responsive.goto(value)
                setDraft(null)
                e.currentTarget.blur()
              }
              if (e.key === 'Escape') {
                setDraft(null)
                e.currentTarget.blur()
              }
            }}
          />

          <label className="resp__toggle" title="Gulir, klik, dan ketikan diteruskan ke semua viewport">
            <input
              type="checkbox"
              checked={state.syncEnabled}
              onChange={(e) => void window.browser.responsive.setSync(e.target.checked)}
            />
            Sinkron
          </label>

          <span className="resp__zoomLabel">Zoom</span>
          <ZoomStepper
            zoom={state.zoom}
            onChange={(zoom) => void window.browser.responsive.setZoom(zoom)}
          />

          <button className="page__action" onClick={openManager}>
            Device ({state.selected.length})
          </button>
        </div>
      </div>

      {/* Label & bingkai digambar pada koordinat yang dikirim main. */}
      {!managerOpen &&
        state.rects.map((rect) => (
          <div key={rect.deviceId}>
            <div
              className="resp__label"
              style={{ left: rect.x, top: rect.y - 22, width: rect.width }}
            >
              <strong>{rect.name}</strong> {rect.deviceWidth}×{rect.deviceHeight}
              {rect.scale < 0.999 && <span className="resp__scale"> · {Math.round(rect.scale * 100)}%</span>}
            </div>
            <div
              className="resp__frame"
              style={{ left: rect.x - 1, top: rect.y - 1, width: rect.width + 2, height: rect.height + 2 }}
            />
          </div>
        ))}

      {!managerOpen && state.maxScrollY > 0 && (
        <input
          className="resp__scroll"
          type="range"
          min={0}
          max={state.maxScrollY}
          value={state.scrollY}
          onChange={(e) => void window.browser.responsive.setScroll(Number(e.target.value))}
          title="Gulir kisi device"
        />
      )}

      {managerOpen && (
        <DeviceManager
          devices={state.devices}
          selected={state.selected}
          onClose={closeManager}
        />
      )}
    </div>
  )
}
