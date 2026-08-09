import Logo from './Logo'

/**
 * The "Play" branch off Home — every way to actually play, in one place,
 * instead of Home itself growing a button per mode.
 */
export default function PlayMenu({ onPlayAI, onPuzzles, onFreePlay, onExit }) {
  return (
    <div className="level-select">
      <header className="tutorial-header">
        <button type="button" className="link-button" onClick={onExit}>
          ← Home
        </button>
      </header>
      <div className="level-select-body stagger">
        <Logo size="md" className="screen-mark" />
        <h2>How do you want to play?</h2>
        <div className="level-list">
          <button type="button" className="level-card" onClick={onPlayAI}>
            <span className="level-name">Play vs AI</span>
            <span className="level-blurb">
              An opponent matched to your rating, adjustable per game.
            </span>
          </button>
          <button type="button" className="level-card" onClick={onPuzzles}>
            <span className="level-name">Puzzles</span>
            <span className="level-blurb">Short tactics — capture, life and death.</span>
          </button>
          <button type="button" className="level-card" onClick={onFreePlay}>
            <span className="level-name">Free play board</span>
            <span className="level-blurb">Two players, one board, no engine involved.</span>
          </button>
        </div>
      </div>
    </div>
  )
}
