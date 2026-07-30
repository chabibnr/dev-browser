import { useState } from 'react'
import type { DevicePreset } from '@shared/devices'

interface Props {
  devices: DevicePreset[]
  selected: string[]
  onClose: () => void
}

export default function DeviceManager({ devices, selected, onClose }: Props): React.JSX.Element {
  const [name, setName] = useState('')
  const [width, setWidth] = useState('1280')
  const [height, setHeight] = useState('800')
  const [mobile, setMobile] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function add(): void {
    const w = Number(width)
    const h = Number(height)
    if (!name.trim()) return setError('Nama device belum diisi.')
    // Batas yang sama dengan validasi di main; dicek di sini supaya pesannya
    // langsung terlihat, bukan gagal diam-diam.
    if (!Number.isFinite(w) || w < 200 || w > 4000) return setError('Lebar harus antara 200 dan 4000.')
    if (!Number.isFinite(h) || h < 200 || h > 4000) return setError('Tinggi harus antara 200 dan 4000.')

    setError(null)
    void window.browser.responsive.addDevice({
      id: `custom-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${w}x${h}`,
      name: name.trim(),
      width: w,
      height: h,
      dpr: mobile ? 2 : 1,
      mobile
    })
    setName('')
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="dialog__title">Device yang ditampilkan</h2>
        <p className="dialog__hint">
          Tiap device yang dicentang menjalankan satu proses renderer sendiri
          (±80–150 MB), jadi pilih seperlunya.
        </p>

        <ul className="devlist">
          {devices.map((device) => (
            <li key={device.id} className="devlist__row">
              <label className="devlist__pick">
                <input
                  type="checkbox"
                  checked={selected.includes(device.id)}
                  onChange={() => void window.browser.responsive.toggleDevice(device.id)}
                />
                <span className="devlist__name">{device.name}</span>
                <span className="devlist__size">
                  {device.width}×{device.height} · {device.mobile ? 'sentuh' : 'desktop'} · dpr{' '}
                  {device.dpr}
                </span>
              </label>
              {!device.builtIn && (
                <button
                  className="page__action"
                  onClick={() => void window.browser.responsive.removeDevice(device.id)}
                >
                  Hapus
                </button>
              )}
            </li>
          ))}
        </ul>

        <h3 className="dialog__title dialog__title--sub">Tambah ukuran sendiri</h3>
        <div className="dialog__row">
          <label className="dialog__label">
            Nama
            <input className="dialog__input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="dialog__label">
            Lebar
            <input
              className="dialog__input"
              inputMode="numeric"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
            />
          </label>
          <label className="dialog__label">
            Tinggi
            <input
              className="dialog__input"
              inputMode="numeric"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
            />
          </label>
        </div>

        <label className="resp__toggle">
          <input type="checkbox" checked={mobile} onChange={(e) => setMobile(e.target.checked)} />
          Layar sentuh (memengaruhi hover, pointer, dan User-Agent)
        </label>

        {error && <p className="dialog__error">{error}</p>}

        <div className="dialog__actions">
          <button className="page__action" onClick={onClose}>
            Tutup
          </button>
          <button className="page__action page__action--primary" onClick={add}>
            Tambah device
          </button>
        </div>
      </div>
    </div>
  )
}
