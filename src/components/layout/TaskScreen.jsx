import ScreenHeader from './ScreenHeader'

/**
 * Shape 2 of 3: "instruction, then an interactive board, then a footer
 * action." Tutorial, Puzzles, Assessment's test mode, and GameReview all
 * follow this — `brief` is the task/title text above the board and is
 * optional (GameReview has none, it goes straight into its own review body).
 * `footer` is the bottom action area (a Next/Reset toolbar, or whatever the
 * screen needs there); also optional for the same reason.
 */
export default function TaskScreen({ onBack, backLabel, progress, brief, children, footer }) {
  return (
    <div className="task-screen">
      <ScreenHeader onBack={onBack} backLabel={backLabel} progress={progress} />
      {brief && <div className="task-brief">{brief}</div>}
      {children}
      {footer && <div className="screen-footer">{footer}</div>}
    </div>
  )
}
