import { useEffect, useRef, type Dispatch, SetStateAction } from 'react'
import type { ChatMessage } from '../../shared/types'

type Props = {
  aiHealthy?: boolean | null
  aiHint?: string
  messages: ChatMessage[]
  input: string
  setInput: Dispatch<SetStateAction<string>>
  sending: boolean
  thinking?: string
  draft?: string
  onSend: (override?: string) => void
  onCancel: () => void
  onOpenSource: (src: NonNullable<ChatMessage['sources']>[number]) => void
  onSwitchTab: (tabId: string) => void
  onOpenSetup: () => void
  onConfirmAction: (msgIndex: number, actionId: string) => void
  onDismissAction: (msgIndex: number, actionId: string) => void
}

export function ChatSidebar(props: Props) {
  const { aiHealthy, aiHint, messages, input, setInput, sending, thinking, draft, onSend, onCancel, onConfirmAction, onDismissAction, onOpenSource, onSwitchTab, onOpenSetup } = props
  const thinkRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (thinkRef.current) thinkRef.current.scrollTop = thinkRef.current.scrollHeight
  }, [thinking])

  return (
    <div className="chat">
      <div className="chatHead">
        <div className="chatTitle">CCLEAR</div>
        <div className="chatSubtitle">Focus assistant</div>

        <div style={{ marginTop: 10 }}>
          <div className="quickRow">
            <button type="button" className="pill" onClick={() => onSend('Summarize the active tab for me in 5 bullets.')}>
              Summarize tab
            </button>
            <button type="button" className="pill" onClick={() => onSend('What should I read first on this page, and why?')}>
              Read next
            </button>
            <button
              type="button"
              className="pill"
              onClick={() =>
                onSend('Based on my open tabs, where should I click next to finish signup or find pricing?')
              }
            >
              Where next
            </button>
          </div>
        </div>
      </div>
      <div className="chatBody">
        {messages.length === 0 && (
          <div className="emptyHint">Ask to underline, highlight, scroll to a section, or summarize the page.</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'bubble bubbleUser' : 'bubble bubbleAsst'}>
            {m.content}
            {m.tabSources && m.tabSources.length > 0 && (
              <ul className="sourceList" aria-label="Tabs used">
                {m.tabSources.map((t) => (
                  <li key={t.tabId}>
                    <button type="button" className="sourceChip" onClick={() => onSwitchTab(t.tabId)} title="Switch to this tab">
                      <span className="sourceNum">{t.n}</span>
                      <span className="sourceText">{t.title || t.url}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {m.sources && m.sources.length > 0 && (
              <ul className="sourceList" aria-label="Sources on this page">
                {m.sources.map((src) => (
                  <li key={src.id}>
                    <button type="button" className="sourceChip" onClick={() => onOpenSource(src)} title="Show this on the page">
                      <span className="sourceNum">{src.n}</span>
                      <span className="sourceText">{src.context ? `${src.context} — ` : ''}“{src.text.length > 120 ? src.text.slice(0, 120) + '…' : src.text}”</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {m.actions?.map((a) => (
              <div key={a.id} className={`actionCard actionCard-${a.state}`}>
                <div className="actionLabel">{a.label}</div>
                {a.state === 'pending' && (
                  <div className="actionBtns">
                    <button type="button" className="nudgeBtn nudgePrimary" onClick={() => onConfirmAction(i, a.id)}>Allow</button>
                    <button type="button" className="nudgeLink" onClick={() => onDismissAction(i, a.id)}>No thanks</button>
                    <span className="actionWhy">{a.decision.reason}</span>
                  </div>
                )}
                {a.state === 'done' && <div className="actionStatus">Done</div>}
                {a.state === 'failed' && <div className="actionStatus">Could not do that on this page</div>}
                {a.state === 'dismissed' && (
                  <div className="actionStatus">{a.decision.mode === 'deny' ? `Blocked: ${a.decision.reason}` : 'Skipped'}</div>
                )}
              </div>
            ))}
          </div>
        ))}
        {sending && thinking ? (
          <div className="chatThink" ref={thinkRef}>
            {thinking}
          </div>
        ) : null}
        {sending && draft ? <div className="bubble bubbleAsst">{draft}</div> : null}
        {sending && !draft && !thinking && (
          <div className="bubble bubbleAsst loadingBubble">
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
          </div>
        )}
        {sending && thinking && !draft ? (
          <div className="bubble bubbleAsst loadingBubble">
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
          </div>
        ) : null}
      </div>
      {aiHealthy === false && (
        <div className="aiDown" role="alert">
          Local AI is not ready. Everything else in the browser still works.
          <button type="button" className="nudgeBtn nudgePrimary" onClick={onOpenSetup}>Set up local AI</button>
        </div>
      )}
      <div className="chatInputRow">
        <textarea
          className="chatTextarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
          placeholder="Message Focus..."
        />
        {sending ? (
          <button type="button" className="sendBtn sendBtnStop" onClick={onCancel} title="Stop" aria-label="Stop">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          </button>
        ) : (
        <button 
          type="button" 
          className="sendBtn" 
          disabled={input.trim().length === 0} 
          onClick={() => onSend()}
          title="Send message"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
        )}
      </div>
    </div>
  )
}
