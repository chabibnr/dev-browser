import { Menu, nativeImage, type BaseWindow, type NativeImage } from 'electron'
import { TAB_COLORS, type TabColorId } from '@shared/colors'

/**
 * Menu konteks memakai Menu native, BUKAN HTML.
 *
 * Versi HTML-nya mengharuskan lapisan UI dilebarkan ke seluruh window agar menu
 * punya ruang di luar bilah atas — dan karena lapisan itu buram, halaman di
 * bawahnya ikut tertutup setiap kali menu dibuka. Menu native mengambang di atas
 * segalanya, jadi halaman tetap terlihat. Bonusnya: navigasi keyboard, penutupan
 * saat klik di luar, dan penempatan yang tidak terpotong tepi layar — semuanya
 * ditangani sistem.
 */

const swatchCache = new Map<string, NativeImage>()

/**
 * Kotak warna solid untuk item menu.
 *
 * Dibuat dari buffer piksel karena nativeImage tidak punya API menggambar.
 * Urutannya BGRA, bukan RGBA — tertukar akan menghasilkan biru dan merah
 * yang saling terbalik.
 */
function swatch(hex: string): NativeImage {
  const cached = swatchCache.get(hex)
  if (cached) return cached

  const size = 14
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  const buffer = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    buffer[i * 4] = b
    buffer[i * 4 + 1] = g
    buffer[i * 4 + 2] = r
    buffer[i * 4 + 3] = 255
  }

  const image = nativeImage.createFromBitmap(buffer, { width: size, height: size })
  swatchCache.set(hex, image)
  return image
}

export interface TabMenuActions {
  onRename(): void
  onSetColor(color: TabColorId | null): void
  onReload(): void
  onClose(): void
}

export function popupTabMenu(
  window: BaseWindow,
  current: TabColorId | null,
  at: { x: number; y: number },
  actions: TabMenuActions
): void {
  // Menu Windows hanya bisa menampilkan centang ATAU gambar pada satu item,
  // tidak keduanya. Karena kotak warna lebih penting, pilihan aktif ditandai
  // lewat teksnya.
  const mark = (label: string, selected: boolean): string => (selected ? `${label} ✓` : label)

  const menu = Menu.buildFromTemplate([
    { label: 'Ganti nama', accelerator: 'F2', click: actions.onRename },
    { type: 'separator' },
    {
      label: 'Warna tab',
      submenu: [
        {
          label: mark('Bawaan', current === null),
          click: () => actions.onSetColor(null)
        },
        { type: 'separator' },
        ...TAB_COLORS.map((color) => ({
          label: mark(color.label, current === color.id),
          icon: swatch(color.value),
          click: () => actions.onSetColor(color.id)
        }))
      ]
    },
    { type: 'separator' },
    { label: 'Muat ulang', accelerator: 'CmdOrCtrl+R', click: actions.onReload },
    { label: 'Tutup tab', accelerator: 'CmdOrCtrl+W', click: actions.onClose }
  ])

  menu.popup({ window, x: Math.round(at.x), y: Math.round(at.y) })
}

export function popupCredentialMenu(
  window: BaseWindow,
  entries: readonly { id: string; username: string }[],
  at: { x: number; y: number },
  onPick: (id: string) => void,
  onManage: () => void
): void {
  const items: Electron.MenuItemConstructorOptions[] = entries.length
    ? entries.map((entry) => ({
        label: entry.username || '(tanpa nama pengguna)',
        click: () => onPick(entry.id)
      }))
    : [{ label: 'Belum ada sandi untuk situs ini', enabled: false }]

  const menu = Menu.buildFromTemplate([
    ...items,
    { type: 'separator' },
    { label: 'Kelola sandi tersimpan', click: onManage }
  ])
  menu.popup({ window, x: Math.round(at.x), y: Math.round(at.y) })
}
