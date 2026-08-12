import Logo from './Logo'
import { LevelSelectScreen } from './layout'

/**
 * The second home category — everything beyond Home's own one-tap "Play"
 * (a quick game, matched to your rating). Here you deliberately choose: a
 * longer/shorter board and opponent strength, or a different mode entirely.
 */
export default function PlayMenu({ onPuzzles, onFreePlay, onLessons, onPlayAI, onExit }) {
  return (
    <LevelSelectScreen onBack={onExit} backLabel="← Home">
      <Logo size="md" className="screen-mark" />
      <h2>Play modes</h2>
      <div className="level-list">
        <button type="button" className="level-card" onClick={onPlayAI}>
          <span className="level-name">Play vs AI</span>
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
        </button>
      </div>
    </LevelSelectScreen>
  )
}
