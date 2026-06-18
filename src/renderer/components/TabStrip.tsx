import type { Dispatch, SetStateAction } from 'react'

export type UITab = { id: string; title: string; url: string }

type Props = {
  tabs: UITab[]
  activeId: string
  setActiveId: Dispatch<SetStateAction<string>>
  onClose: (id: string) => void
  onNewTab: () => void
}

export function TabStrip({ tabs, activeId, setActiveId, onClose, onNewTab }: Props) {
  return (
    <div className="tabStrip">
      {tabs.map((tab) => (
        <div key={tab.id} className="tab" role="tab" data-active={tab.id === activeId ? 'true' : 'false'}>
          <button type="button" className="tabTitle" title={tab.url} onClick={() => setActiveId(tab.id)}>
            {tab.title || tab.url || 'New tab'}
          </button>
          <button
            type="button"
            className="tabClose"
            aria-label={`Close tab`}
            title="Close"
            onClick={(e) => {
              e.stopPropagation()
              onClose(tab.id)
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      ))}
      <button type="button" className="tabNewBtn" title="New tab" onClick={onNewTab}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>
    </div>
  )
}
