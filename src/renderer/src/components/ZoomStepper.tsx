import { useEffect, useState } from 'react'

const MIN = 25
const MAX = 200
const STEP = 10

interface Props {
  /** Nilai zoom sebagai pecahan, mis. 0.7 untuk 70%. */
  zoom: number
  onChange: (zoom: number) => void
}

const clamp = (value: number): number => Math.min(MAX, Math.max(MIN, value))

/**
 * Kontrol zoom bentuk −[70]+.
 *
 * Angkanya bisa diketik langsung, jadi lompat ke nilai tertentu tidak perlu
 * menggeser-geser seperti pada slider.
 */
export default function ZoomStepper({ zoom, onChange }: Props): React.JSX.Element {
  const percent = Math.round(zoom * 100)
  // `null` berarti tampilkan nilai sebenarnya; string berarti sedang diketik.
  const [draft, setDraft] = useState<string | null>(null)

  // Nilai dari luar (mis. tombol −/+) harus terlihat, tapi jangan menimpa
  // ketikan yang sedang berjalan.
  useEffect(() => {
    setDraft(null)
  }, [percent])

  const step = (delta: number): void => onChange(clamp(percent + delta) / 100)

  const commit = (): void => {
    const parsed = Number((draft ?? '').replace(/[^\d]/g, ''))
    // Ketikan kosong atau bukan angka dikembalikan ke nilai semula, bukan ke nol.
    if (Number.isFinite(parsed) && parsed > 0) onChange(clamp(parsed) / 100)
    setDraft(null)
  }

  return (
    <div className="stepper" title={`Zoom ${MIN}–${MAX}%`}>
      <button
        className="stepper__btn"
        disabled={percent <= MIN}
        onClick={() => step(-STEP)}
        aria-label="Perkecil"
      >
        −
      </button>

      <input
        className="stepper__input"
        inputMode="numeric"
        value={draft ?? String(percent)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit()
            e.currentTarget.blur()
          }
          if (e.key === 'Escape') {
            setDraft(null)
            e.currentTarget.blur()
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            step(STEP)
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            step(-STEP)
          }
        }}
      />
      <span className="stepper__unit">%</span>

      <button
        className="stepper__btn"
        disabled={percent >= MAX}
        onClick={() => step(STEP)}
        aria-label="Perbesar"
      >
        +
      </button>
    </div>
  )
}
