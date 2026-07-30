import { useState } from 'react'
import type { TabState } from '@shared/types'
import TabItem from './TabItem'
import Icon from './Icon'
import WindowControls from './WindowControls'

interface Props {
  tabs: TabState[]
  activeTabId: string | null
  renamingId: string | null
  isMaximized: boolean
  onStartRename: (id: string) => void
  onEndRename: () => void
  onContextMenu: (tabId: string, x: number, y: number) => void
}

export default function TabStrip({
  tabs,
  activeTabId,
  renamingId,
  isMaximized,
  onStartRename,
  onEndRename,
  onContextMenu
}: Props): React.JSX.Element {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  // Titik sesi hanya berarti kalau ada tab lain yang memakai sesi yang sama
  // (mis. popup yang mewarisi sesi induknya). Kalau tiap tab punya sesinya
  // sendiri, titik itu cuma jadi warna yang bertabrakan dengan warna tab.
  const sessionUsage = new Map<string, number>()
  for (const tab of tabs) sessionUsage.set(tab.sessionId, (sessionUsage.get(tab.sessionId) ?? 0) + 1)

  return (
    <div className="strip">
      <div className="strip__tabs">
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            className={`strip__slot${dropIndex === index ? ' strip__slot--drop' : ''}`}
            draggable={renamingId !== tab.id}
            onDragStart={() => setDragId(tab.id)}
            onDragOver={(e) => {
              e.preventDefault()
              setDropIndex(index)
            }}
            onDragLeave={() => setDropIndex((current) => (current === index ? null : current))}
            onDrop={(e) => {
              e.preventDefault()
              if (dragId) void window.browser.reorderTab(dragId, index)
              setDragId(null)
              setDropIndex(null)
            }}
            onDragEnd={() => {
              setDragId(null)
              setDropIndex(null)
            }}
          >
            <TabItem
              tab={tab}
              isActive={tab.id === activeTabId}
              isRenaming={tab.id === renamingId}
              sharesSession={(sessionUsage.get(tab.sessionId) ?? 0) > 1}
              onStartRename={() => onStartRename(tab.id)}
              onEndRename={onEndRename}
              onContextMenu={(x, y) => onContextMenu(tab.id, x, y)}
            />
          </div>
        ))}

        {/* Berada di dalam kontainer tab supaya menempel tepat setelah tab
            terakhir, bukan terdorong ke ujung kanan bilah. */}
        <button
          className="strip__new"
          title="Tab baru dengan sesi baru (Ctrl+T)"
          onClick={() => void window.browser.createTab()}
        >
          <Icon name="plus" size={16} strokeWidth={2.4} />
        </button>
      </div>

      {/* Sisa ruang dibiarkan kosong sebagai area seret window. Klik ganda di
          sini memaksimalkan window — ditangani Windows sendiri lewat drag region. */}
      <div className="strip__drag" />

      <WindowControls isMaximized={isMaximized} />
    </div>
  )
}
