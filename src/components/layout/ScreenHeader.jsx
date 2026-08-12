/**
 * The header every screen in the app uses: a back-action on the left, an
 * optional progress/context readout on the right. Verified identical across
 * all nine screens before being extracted — this isn't a guess at a shared
 * shape, it's what was already there.
 */
export default function ScreenHeader({ onBack, backLabel, progress }) {
  return (
    <header className="screen-header">
      <button type="button" className="link-button" onClick={onBack}>
        {backLabel}
      </button>
      {progress != null && <span className="screen-progress">{progress}</span>}
    </header>
  )
}
