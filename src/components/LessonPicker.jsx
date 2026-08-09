import Logo from './Logo'
import LESSONS from '../lessons'

/**
 * Entry point into the tutorial: every lesson, jumpable directly, instead of
 * only ever being reachable by working through the ones before it.
 */
export default function LessonPicker({ onSelect, onExit }) {
  return (
    <div className="level-select">
      <header className="tutorial-header">
        <button type="button" className="link-button" onClick={onExit}>
          ← Play
        </button>
      </header>
      <div className="level-select-body stagger">
        <Logo size="md" className="screen-mark" />
        <h2>Pick a lesson</h2>
        <p className="level-select-note">
          Go through them in order, or jump straight to the one you want.
        </p>
        <div className="level-list">
          {LESSONS.map((lesson, i) => (
            <button
              key={lesson.id}
              type="button"
              className="level-card"
              onClick={() => onSelect(i)}
            >
              <span className="level-name">
                {i + 1}. {lesson.title}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
