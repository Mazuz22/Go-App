import Logo from './Logo'

// One dominant action: tap Play and pick a board — opponent strength
// matches your rating automatically unless you change it. Everything else
// (puzzles, free play, lessons) is real but deliberately secondary — a quiet
// link below, not a button competing with Play for attention.
export default function Home({ onPlay, onPlayModes }) {
  return (
    <div className="home stagger">
      <h1 className="home-title">
        <Logo size="lg" />
      </h1>

      <div className="home-actions">
        <button type="button" className="primary-button home-play-button" onClick={onPlay}>
          Play
        </button>
        <button type="button" className="link-button home-play-modes" onClick={onPlayModes}>
          More ways to play →
        </button>
      </div>
    </div>
  )
}
