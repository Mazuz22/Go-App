import Logo from './Logo'

/**
 * The second home category — everything beyond Home's own one-tap "Play"
 * (a quick game, matched to your rating). Here you deliberately choose: a
 * longer/shorter board and opponent strength, or a different mode entirely.
 */
export default function PlayMenu({ onPuzzles, onFreePlay, onLessons, onPlayAI, onExit }) {
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
          <button type="button" className="level-card" onClick={onPlayAI}>
            <span className="level-name">Play vs AI</span>
            <span className="level-blurb">Choose board size and opponent strength yourself.</span>
          </button>
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
