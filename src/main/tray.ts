import { app, Menu, nativeImage, Tray } from 'electron'
import path from 'node:path'
import { allProfiles } from './profiles'
import { contextForProfile } from './browser-registry'

/**
 * Ikon tray sebagai pintu masuk Window Manager.
 *
 * Window Manager sendiri disembunyikan dari taskbar (`skipTaskbar`) dan
 * disembunyikan saat diminimalkan, jadi tray inilah satu-satunya cara
 * memanggilnya kembali — referensinya WAJIB disimpan, karena Tray yang tidak
 * dirujuk akan dibersihkan GC dan ikonnya hilang begitu saja dari system tray.
 */
let tray: Tray | null = null

export interface TrayActions {
  showManager(): void
  openProfile(id: string): void
}

/**
 * Ikon 32px dipakai, bukan 16px.
 *
 * Windows meminta 16px pada penskalaan 100%, tetapi 24px pada 150% dan 32px pada
 * 200%. Memberi yang lebih besar lalu dibiarkan diperkecil sistem jauh lebih
 * tajam daripada memberi 16px lalu diperbesar.
 */
function trayIcon(): Electron.NativeImage {
  const source = nativeImage.createFromPath(path.join(app.getAppPath(), 'assets', 'icon.png'))
  if (source.isEmpty()) return source
  return source.resize({ width: 32, height: 32, quality: 'best' })
}

function buildMenu(actions: TrayActions): Menu {
  const profiles = allProfiles()

  return Menu.buildFromTemplate([
    { label: 'Window Manager', click: actions.showManager },
    { type: 'separator' },
    ...(profiles.length
      ? profiles.map((profile) => {
          const isOpen = contextForProfile(profile.id) !== null
          return {
            // Profil yang sedang terbuka ditandai, supaya jelas mana yang hanya
            // akan difokuskan dan mana yang benar-benar dibuka.
            label: isOpen ? `${profile.name} — terbuka` : profile.name,
            click: () => actions.openProfile(profile.id)
          }
        })
      : [{ label: 'Belum ada profil', enabled: false }]),
    { type: 'separator' },
    { label: 'Keluar', role: 'quit' }
  ])
}

export function createTray(actions: TrayActions): void {
  if (tray) return

  tray = new Tray(trayIcon())
  tray.setToolTip('DEV Browser — Window Manager')

  // Klik kiri langsung memunculkan Window Manager; itu aksi yang paling sering.
  tray.on('click', () => actions.showManager())
  tray.on('double-click', () => actions.showManager())

  // Menu dibangun ulang setiap kali dibuka, bukan disetel sekali lewat
  // setContextMenu(), supaya daftar profilnya selalu yang terbaru.
  tray.on('right-click', () => tray?.popUpContextMenu(buildMenu(actions)))
}

export function hasTray(): boolean {
  return tray !== null && !tray.isDestroyed()
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
