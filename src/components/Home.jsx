import Logo from './Logo'
import { formatRank } from '../lib/rank'

export default function Home({ rank, onStartTutorial, onFreePlay, onPlayAI, onReassess }) {
  return (
    <div className="home stagger">
      <div className="home-hero">
        <h1 className="home-title">
          <Logo size="lg" />
        </h1>
        {rank ? (
          <button type="button" className="rank-chip" onClick={onReassess}>
            {formatRank(rank.kyu)}
            <span className="rank-chip-action">change</span>
          </button>
        ) : (
          <p className="home-tagline">Learn the oldest board game still played today.</p>
        )}
      </div>

      <div className="home-actions">
        <button type="button" className="primary-button" onClick={onStartTutorial}>
          Learn to play
        </button>
        <button type="button" className="ghost-button" onClick={onPlayAI}>
          Play vs computer
        </button>
        <button type="button" className="ghost-button" onClick={onFreePlay}>
          Free play board
        </button>
      </div>
    </div>
  )
}
