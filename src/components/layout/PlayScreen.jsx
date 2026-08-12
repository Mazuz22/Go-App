import ScreenHeader from './ScreenHeader'

/**
 * Shape 3 of 3: "a live board with a persistent toolbar/end-state panel
 * below it," used by PlayAI's in-game view and FreePlay. Structurally close
 * to TaskScreen (header, board, footer) but never has a brief/task section
 * above the board, and reserves less vertical space for it — the CSS class
 * (`play-screen` vs `task-screen`) is what actually carries that difference,
 * via a different `--board-max` height budget.
 */
export default function PlayScreen({ onBack, backLabel, progress, children, footer }) {
  return (
    <div className="play-screen">
      <ScreenHeader onBack={onBack} backLabel={backLabel} progress={progress} />
      {children}
      {footer && <div className="screen-footer">{footer}</div>}
    </div>
  )
}
