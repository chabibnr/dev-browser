export type TabColorId =
  | 'blue'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'cyan'
  | 'purple'
  | 'pink'

export interface TabColor {
  id: TabColorId
  label: string
  /** Warna dasar. Nuansa gelap untuk tab & toolbar diturunkan lewat color-mix di CSS. */
  value: string
}

export const TAB_COLORS: readonly TabColor[] = [
  { id: 'blue', label: 'Biru', value: '#5b9dff' },
  { id: 'red', label: 'Merah', value: '#f05a5a' },
  { id: 'orange', label: 'Oranye', value: '#f0913a' },
  { id: 'yellow', label: 'Kuning', value: '#e8c34a' },
  { id: 'green', label: 'Hijau', value: '#4fc27f' },
  { id: 'cyan', label: 'Toska', value: '#45b8c9' },
  { id: 'purple', label: 'Ungu', value: '#a97bf0' },
  { id: 'pink', label: 'Merah muda', value: '#ee74b4' }
]

const BY_ID = new Map(TAB_COLORS.map((color) => [color.id, color]))

export function isTabColorId(value: unknown): value is TabColorId {
  return typeof value === 'string' && BY_ID.has(value as TabColorId)
}

export function tabColorValue(id: TabColorId | null): string | null {
  return id ? (BY_ID.get(id)?.value ?? null) : null
}
