export type IconName =
  | 'back'
  | 'forward'
  | 'reload'
  | 'stop'
  | 'search'
  | 'download'
  | 'devtools'
  | 'shield'
  | 'shield-on'
  | 'plus'
  | 'close'
  | 'devices'
  | 'more'
  | 'key'

/**
 * Ikon bergaya Chrome: goresan tebal, ujung membulat, viewBox 24.
 * Semuanya memakai `currentColor` supaya warnanya ikut state tombol
 * (hover, disabled) tanpa aturan CSS tambahan.
 */
const PATHS: Record<IconName, React.ReactNode> = {
  back: (
    <>
      <path d="M20 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </>
  ),
  forward: (
    <>
      <path d="M4 12h15" />
      <path d="M12 5l7 7-7 7" />
    </>
  ),
  // Lingkaran r=9 berpusat di (12,12); kedua ujung busur tepat berjarak 9 dari
  // pusat, jadi lingkarannya tidak tampak miring seperti kalau koordinatnya dikira-kira.
  reload: (
    <>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      <path d="M23 4v6h-6" />
    </>
  ),
  stop: (
    <>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      {/* Gagang dimulai persis di tepi lingkaran pada sudut 45° (11+7/√2 ≈ 15.95). */}
      <path d="M16 16l5 5" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </>
  ),
  devtools: (
    <>
      <path d="M16 18l6-6-6-6" />
      <path d="M8 6l-6 6 6 6" />
    </>
  ),
  shield: <path d="M12 21.5s7.5-3.8 7.5-9.5V5.3L12 2.5 4.5 5.3v6.7c0 5.7 7.5 9.5 7.5 9.5z" />,
  'shield-on': (
    <path
      d="M12 21.5s7.5-3.8 7.5-9.5V5.3L12 2.5 4.5 5.3v6.7c0 5.7 7.5 9.5 7.5 9.5z"
      fill="currentColor"
    />
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  close: (
    <>
      <path d="M17 7L7 17" />
      <path d="M7 7l10 10" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9" />
      <path d="M17 12v3.5" />
      <path d="M20 12v2.5" />
    </>
  ),
  // Tiga titik tegak. Diisi penuh supaya tetap terbaca pada ukuran sekecil ini —
  // lingkaran bergaris pada 2px hanya akan tampak sebagai noda.
  more: (
    <>
      <circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  // Monitor berdampingan dengan ponsel — lambang pengujian lintas ukuran.
  devices: (
    <>
      <rect x="2" y="4" width="12" height="9" rx="2" />
      <path d="M8 13v3" />
      <path d="M5 16h6" />
      <rect x="16" y="8" width="6" height="12" rx="1.5" />
    </>
  )
}

interface Props {
  name: IconName
  size?: number
  strokeWidth?: number
}

// Goresan efektif ≈ strokeWidth × size / 24, jadi 2.5 pada 19px ≈ 2px —
// setebal ikon toolbar Chrome.
export default function Icon({ name, size = 19, strokeWidth = 2.5 }: Props): React.JSX.Element {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
