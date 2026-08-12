import ScreenHeader from './ScreenHeader'

/**
 * Shape 1 of 3: "pick a card from a list." Assessment's experience picker,
 * LessonPicker, PlayMenu, and PlayAI's pre-game picker all follow this same
 * outer structure — header, then a centered body — even though what's
 * actually offered (lessons, modes, board sizes, experience levels) differs
 * completely. Only the shell is shared; the body is fully caller-defined,
 * since some of these screens mix in real custom content (a toggle, a
 * collapsible strength picker) beyond a plain list of cards.
 */
export default function LevelSelectScreen({ onBack, backLabel, progress, children }) {
  return (
    <div className="level-select">
      <ScreenHeader onBack={onBack} backLabel={backLabel} progress={progress} />
      <div className="level-select-body stagger">{children}</div>
    </div>
  )
}
