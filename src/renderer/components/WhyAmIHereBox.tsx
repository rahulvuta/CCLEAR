import { useState } from 'react'
import type { TabContextSummary } from '../../shared/types'

type ItemProps = {
  summary: TabContextSummary
}

function WhyAmIHereItem({ summary }: ItemProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="whyBoxItem"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {summary.originUrl && summary.originUrl !== 'None' && (() => {
        let hostname = summary.originUrl
        try { hostname = new URL(summary.originUrl).hostname } catch { /* keep raw */ }
        return (
          <div className="whyBoxRow">
            <strong>From:</strong> <span title={summary.originUrl}>{hostname}</span>
          </div>
        )
      })()}
      <div className="whyBoxRow">
        <strong>Goal:</strong> {summary.inferredReason}
      </div>
      {hovered && (
        <div className="whyBoxInlineSummary">
          <strong>Summary:</strong> {summary.summary}
        </div>
      )}
    </div>
  )
}

type Props = {
  summaries: TabContextSummary[]
  isLoading: boolean
}

export function WhyAmIHereBox({ summaries, isLoading }: Props) {
  return (
    <div className="whyBoxContainer">
      <h3 className="whyBoxTitle">Why Am I Here?</h3>
      <div className="whyBoxContent">
        {summaries.length === 0 && !isLoading && (
          <div className="whyBoxEmpty">Navigate to a page to see context.</div>
        )}
        {summaries.map((s, idx) => (
          <WhyAmIHereItem key={idx} summary={s} />
        ))}
        {isLoading && (
          <div className="whyBoxLoading">Thinking...</div>
        )}
      </div>
    </div>
  )
}
