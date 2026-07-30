import { useEffect, useState } from 'react'
import type { DownloadState } from '@shared/types'

/**
 * Halaman internal browser://downloads.
 *
 * Dibuat sebagai tab biasa, bukan panel melayang, supaya memakai ulang seluruh
 * mesin tab yang sudah ada dan tidak perlu overlay yang menutupi halaman.
 */
export default function Downloads(): React.JSX.Element {
  const [items, setItems] = useState<DownloadState[]>([])

  useEffect(() => {
    void window.browser.getDownloads().then(setItems)
    return window.browser.onDownloadsChanged(setItems)
  }, [])

  const finished = items.filter((i) => i.status !== 'progressing' && i.status !== 'paused')

  return (
    <div className="page">
      <header className="page__head">
        <h1 className="page__title">Unduhan</h1>
        {finished.length > 0 && (
          <button className="page__action" onClick={() => void window.browser.clearDownloads()}>
            Bersihkan yang selesai
          </button>
        )}
      </header>

      {items.length === 0 ? (
        <p className="page__empty">Belum ada unduhan.</p>
      ) : (
        <ul className="dl">
          {items.map((item) => (
            <DownloadRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  )
}

function DownloadRow({ item }: { item: DownloadState }): React.JSX.Element {
  const active = item.status === 'progressing' || item.status === 'paused'
  // totalBytes 0 berarti server tidak mengirim Content-Length.
  const percent = item.totalBytes > 0 ? Math.round((item.receivedBytes / item.totalBytes) * 100) : null

  return (
    <li className="dl__row">
      <div className="dl__main">
        <span className="dl__name" title={item.savePath || item.url}>
          {item.filename}
        </span>
        <span className="dl__meta">
          {/* Sesi asal ditampilkan karena tiap tab punya cookie sendiri —
              berkas yang sama bisa berasal dari akun yang berbeda. */}
          {item.originLabel} · {formatBytes(item.receivedBytes)}
          {item.totalBytes > 0 ? ` / ${formatBytes(item.totalBytes)}` : ''} · {statusLabel(item.status)}
        </span>
        {active && (
          <div className="dl__bar">
            <div
              className={`dl__fill${percent === null ? ' dl__fill--unknown' : ''}`}
              style={percent === null ? undefined : { width: `${percent}%` }}
            />
          </div>
        )}
      </div>

      <div className="dl__actions">
        {active ? (
          <button className="page__action" onClick={() => void window.browser.cancelDownload(item.id)}>
            Batalkan
          </button>
        ) : (
          <>
            {item.status === 'completed' && (
              <button className="page__action" onClick={() => void window.browser.openDownload(item.id)}>
                Buka
              </button>
            )}
            {item.savePath && (
              <button className="page__action" onClick={() => void window.browser.showDownload(item.id)}>
                Lokasi
              </button>
            )}
          </>
        )}
      </div>
    </li>
  )
}

function statusLabel(status: DownloadState['status']): string {
  switch (status) {
    case 'progressing':
      return 'sedang diunduh'
    case 'paused':
      return 'dijeda'
    case 'completed':
      return 'selesai'
    case 'cancelled':
      return 'dibatalkan'
    case 'interrupted':
      return 'terputus'
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(1)} ${units[unit]}`
}
