export interface DevicePreset {
  id: string
  name: string
  /** Lebar viewport dalam CSS px — inilah yang dibaca media query. */
  width: number
  height: number
  /** devicePixelRatio yang ditiru. 0 = pakai milik layar asli. */
  dpr: number
  /** true = layar sentuh; memengaruhi hover, pointer, dan emulasi sentuh. */
  mobile: boolean
  userAgent?: string
  /** Bawaan aplikasi, tidak bisa dihapus pengguna. */
  builtIn?: boolean
}

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36'

/**
 * User-Agent disertakan karena banyak situs masih menyajikan HTML berbeda
 * berdasarkan UA, bukan hanya lewat CSS. Tanpa itu, "mode ponsel" hanya
 * mengecilkan viewport tapi tetap menerima markup desktop.
 */
export const BUILT_IN_DEVICES: readonly DevicePreset[] = [
  { id: 'iphone-se', name: 'iPhone SE', width: 375, height: 667, dpr: 2, mobile: true, userAgent: IOS_UA, builtIn: true },
  { id: 'iphone-15', name: 'iPhone 15 Pro', width: 393, height: 852, dpr: 3, mobile: true, userAgent: IOS_UA, builtIn: true },
  { id: 'pixel-8', name: 'Pixel 8', width: 412, height: 915, dpr: 2.6, mobile: true, userAgent: ANDROID_UA, builtIn: true },
  { id: 'ipad-mini', name: 'iPad Mini', width: 768, height: 1024, dpr: 2, mobile: true, userAgent: IPAD_UA, builtIn: true },
  { id: 'ipad-pro', name: 'iPad Pro 11"', width: 834, height: 1194, dpr: 2, mobile: true, userAgent: IPAD_UA, builtIn: true },
  { id: 'laptop', name: 'Laptop', width: 1366, height: 768, dpr: 1, mobile: false, builtIn: true },
  { id: 'desktop', name: 'Desktop', width: 1920, height: 1080, dpr: 1, mobile: false, builtIn: true }
]

/** Dipilih saat pertama kali dibuka: satu ponsel, satu tablet, satu desktop. */
export const DEFAULT_SELECTION = ['iphone-15', 'ipad-mini', 'laptop']

export function isValidDevice(value: unknown): value is DevicePreset {
  if (!value || typeof value !== 'object') return false
  const d = value as Partial<DevicePreset>
  return (
    typeof d.id === 'string' &&
    d.id.length > 0 &&
    typeof d.name === 'string' &&
    typeof d.width === 'number' &&
    typeof d.height === 'number' &&
    d.width >= 200 &&
    d.width <= 4000 &&
    d.height >= 200 &&
    d.height <= 4000 &&
    typeof d.dpr === 'number' &&
    typeof d.mobile === 'boolean'
  )
}
