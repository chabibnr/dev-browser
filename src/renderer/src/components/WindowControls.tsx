interface Props {
  isMaximized: boolean
}

/**
 * Tombol minimize / maximize / close untuk window frameless.
 *
 * Digambar sendiri, bukan memakai Window Controls Overlay bawaan: variabel
 * `env(titlebar-area-*)` milik WCO tidak dijamin sampai ke child WebContentsView
 * pada BaseWindow, sedangkan seluruh UI kita hidup di dalam child view.
 *
 * Ukuran 46x40 mengikuti ukuran tombol title bar Windows.
 */
export default function WindowControls({ isMaximized }: Props): React.JSX.Element {
  return (
    <div className="wc">
      <button className="wc__btn" title="Minimalkan" onClick={() => void window.browser.minimizeWindow()}>
        <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
          <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>

      <button
        className="wc__btn"
        title={isMaximized ? 'Kembalikan ukuran' : 'Maksimalkan'}
        onClick={() => void window.browser.toggleMaximizeWindow()}
      >
        <svg viewBox="0 0 10 10" width="10" height="10" fill="none" aria-hidden="true">
          {isMaximized ? (
            <>
              <path d="M2.5 2.5V0.5h7v7h-2" stroke="currentColor" strokeWidth="1" />
              <rect x="0.5" y="2.5" width="7" height="7" stroke="currentColor" strokeWidth="1" />
            </>
          ) : (
            <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" />
          )}
        </svg>
      </button>

      <button
        className="wc__btn wc__btn--close"
        title="Tutup"
        onClick={() => void window.browser.closeWindow()}
      >
        <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
          <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  )
}
