type Props = { total: number; offCount: number; onPark: () => void; onDismiss: () => void }

/** Offers to tidy up, never forces it. */
export function TabDiet({ total, offCount, onPark, onDismiss }: Props) {
  return (
    <div className="nudge" role="status" aria-live="polite">
      <div className="nudgeText">
        <strong>{total} tabs are open</strong>
        <span className="nudgeGoal">{offCount} {offCount === 1 ? 'looks' : 'look'} unrelated to your goal. Park them to keep your head clear?</span>
      </div>
      <div className="nudgeBtns">
        <button type="button" className="nudgeBtn nudgePrimary" onClick={onPark}>Park {offCount}</button>
        <button type="button" className="nudgeLink" onClick={onDismiss}>Not now</button>
      </div>
    </div>
  )
}
