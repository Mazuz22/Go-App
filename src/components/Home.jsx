import Logo from './Logo'

// One dominant action: tap Play and you're straight into a quick game,
// matched to your rating. Everything else (puzzles, free play, lessons, a
// longer board) is real but deliberately secondary — a quiet link below,
// not a button competing with Play for attention.
export default function Home({ onPlay, onPlayModes }) {
  return (
    <div className="home stagger">
      <h1 className="home-title">
        <Logo size="lg" />
      </h1>

      <div className="home-actions">
        <button type="button" className="primary-button home-play-button" onClick={onPlay}>
          <span className="home-play-title">Play</span>
          <span className="home-play-subtitle">Quick game · matched to your level</span>
        </button>
        <button type="button" className="link-button home-play-modes" onClick={onPlayModes}>
          More ways to play →
        </button>
      </div>
    </div>
  )
}
