import Logo from './Logo'
import { LevelSelectScreen } from './layout'
import LESSONS from '../lessons'

/**
 * Entry point into the tutorial: every lesson, jumpable directly, instead of
 * only ever being reachable by working through the ones before it.
 */
export default function LessonPicker({ onSelect, onExit }) {
  return (
    <LevelSelectScreen onBack={onExit} backLabel="← Play modes">
      <Logo size="md" className="screen-mark" />
      <h2>Pick a lesson</h2>
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
    </LevelSelectScreen>
  )
}
