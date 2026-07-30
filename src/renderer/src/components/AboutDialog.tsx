import { useEffect, useState } from 'react'
import type { AppInfo, UpdateState } from '@shared/types'
import { CHANGELOG } from '@shared/changelog'

interface Props {
  onClose: () => void
}

/** Kalimat status pembaruan. Dipisah agar JSX-nya tetap terbaca. */
function updateLabel(update: UpdateState): string {
  switch (update.status) {
    case 'checking':
      return 'Memeriksa pembaruan…'
    case 'downloading':
      return `Mengunduh versi ${update.version ?? ''} — ${update.percent}%`
    case 'ready':
      return `Versi ${update.version} siap dipasang.`
    case 'latest':
      return 'Sudah versi terbaru.'
    case 'error':
      return update.message ?? 'Gagal memeriksa pembaruan.'
    case 'unsupported':
      return update.message ?? 'Pembaruan tidak tersedia di mode ini.'
    default:
      return 'Belum diperiksa.'
  }
}

export default function AboutDialog({ onClose }: Props): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [update, setUpdate] = useState<UpdateState | null>(null)

  useEffect(() => {
    void window.browser.getAppInfo().then(setInfo)
    void window.browser.update.getState().then(setUpdate)
    return window.browser.update.onChanged(setUpdate)
  }, [])

  const busy = update?.status === 'checking' || update?.status === 'downloading'

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="dialog__title">{info?.name ?? 'DEV Browser'}</h2>
        <p className="about__version">Versi {info?.version ?? '—'}</p>

        <dl className="about__specs">
          <dt>Electron</dt>
          <dd>{info?.electron ?? '—'}</dd>
          <dt>Chromium</dt>
          <dd>{info?.chrome ?? '—'}</dd>
          <dt>Node</dt>
          <dd>{info?.node ?? '—'}</dd>
        </dl>

        <div className="upd">
          <span className={`upd__status upd__status--${update?.status ?? 'idle'}`}>
            {update ? updateLabel(update) : '…'}
          </span>
          {update?.status === 'ready' ? (
            <button
              className="page__action page__action--primary"
              onClick={() => void window.browser.update.install()}
            >
              Mulai ulang & pasang
            </button>
          ) : (
            <button
              className="page__action"
              disabled={busy || update?.status === 'unsupported'}
              onClick={() => void window.browser.update.check()}
            >
              Periksa pembaruan
            </button>
          )}
        </div>

        <h3 className="dialog__title dialog__title--sub">Riwayat perubahan</h3>

        {/* <details> dipakai apa adanya: buka/tutupnya ditangani browser, jadi
            tidak perlu state sendiri dan keyboard-nya sudah benar. Versi terbaru
            terbuka; sisanya terlipat agar daftarnya tetap ringkas. */}
        {CHANGELOG.map((entry, index) => (
          <details key={entry.version} className="cl" open={index === 0}>
            <summary className="cl__head">
              <span className="cl__version">{entry.version}</span>
              <span className="cl__date">{entry.date}</span>
              <span className="cl__count">{entry.changes.length} perubahan</span>
            </summary>
            <ul className="cl__list">
              {entry.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          </details>
        ))}

        <div className="dialog__actions">
          <button className="page__action page__action--primary" onClick={onClose}>
            Tutup
          </button>
        </div>
      </div>
    </div>
  )
}
