import type { Dispatch, SetStateAction } from 'react'
import type { ChatMessage } from '../../shared/types'

type Props = {
  aiHealthy?: boolean | null
  aiHint?: string
  messages: ChatMessage[]
  input: string
  setInput: Dispatch<SetStateAction<string>>
  sending: boolean
  onSend: (override?: string) => void
}

export function ChatSidebar(props: Props) {
  const { aiHealthy, aiHint, messages, input, setInput, sending, onSend } = props

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
        {messages.length === 0 && <div className="emptyHint">Ask for navigation, summaries, or a calmer plan.</div>}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'bubble bubbleUser' : 'bubble bubbleAsst'}>
            {m.content}
          </div>
        ))}
        {sending && (
          <div className="bubble bubbleAsst loadingBubble">
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
          </div>
        )}
      </div>
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
        <button 
          type="button" 
          className="sendBtn" 
          disabled={sending || input.trim().length === 0} 
          onClick={() => onSend()}
          title="Send message"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
