import Logo from './Logo'

export default function Home({ onPlay, onPlayModes }) {
  return (
    <div className="home stagger">
      <h1 className="home-title">
        <Logo size="lg" />
      </h1>

      <div className="home-actions">
        <button type="button" className="primary-button" onClick={onPlay}>
          Play
        </button>
        <button type="button" className="ghost-button" onClick={onPlayModes}>
          Play modes
        </button>
      </div>
    </div>
  )
}
