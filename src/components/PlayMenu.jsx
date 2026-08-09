import Logo from './Logo'

/**
 * The second home category — everything that isn't a straight AI match
 * (that's Home's own "Play" button, which skips this screen entirely).
 */
export default function PlayMenu({ onPuzzles, onFreePlay, onLessons, onExit }) {
  return (
    <div className="level-select">
      <header className="tutorial-header">
        <button type="button" className="link-button" onClick={onExit}>
          ← Home
        </button>
      </header>
      <div className="level-select-body stagger">
        <Logo size="md" className="screen-mark" />
        <h2>Play modes</h2>
        <div className="level-list">
          <button type="button" className="level-card" onClick={onPuzzles}>
            <span className="level-name">Puzzles</span>
            <span className="level-blurb">Short tactics — capture, life and death.</span>
          </button>
          <button type="button" className="level-card" onClick={onFreePlay}>
            <span className="level-name">Free play board</span>
            <span className="level-blurb">Two players, one board, no engine involved.</span>
          </button>
          <button type="button" className="level-card" onClick={onLessons}>
            <span className="level-name">How to play</span>
            <span className="level-blurb">Short interactive lessons on the rules and basics.</span>
          </button>
        </div>
      </div>
    </div>
  )
}
