/**
 * Pintu ke Window Manager untuk modul yang tidak boleh mengimpor index.ts.
 *
 * shortcuts.ts perlu membuka manager, tapi mengimpornya langsung dari index.ts
 * membuat lingkaran impor (index -> browser-context -> shortcuts -> index).
 * Fungsinya dititipkan di sini saat aplikasi mulai.
 */
let opener: () => void = () => {}

export function setManagerOpener(fn: () => void): void {
  opener = fn
}

export function openManagerWindow(): void {
  opener()
}
