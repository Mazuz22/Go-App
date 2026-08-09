import { useState } from 'react'
import FreePlay from './components/FreePlay'
import Tutorial from './components/Tutorial'
import LessonPicker from './components/LessonPicker'
import Home from './components/Home'
import PlayMenu from './components/PlayMenu'
import Puzzles from './components/Puzzles'
import PlayAI from './components/PlayAI'
import Assessment from './components/Assessment'
import { loadRank, saveRank } from './lib/rank'

// Simple screen switching. A router isn't warranted yet — revisit in Phase 4
// if we want back-button support inside the installed PWA.
export default function App() {
  const [screen, setScreen] = useState('home')
  const [rank, setRank] = useState(() => loadRank())
  // Which lesson Tutorial should open on, set by LessonPicker.
  const [lessonIndex, setLessonIndex] = useState(0)
  // Whether entering PlayAI should skip its board-size screen and just start
  // a quick game. True for Home's one-tap Play (the common case); false when
  // reached via Play modes → Play vs AI, where picking board size/opponent
  // strength deliberately is the point.
  const [quickStart, setQuickStart] = useState(true)

  // Shared by the assessment flow (which also switches screens) and by
  // in-game rating updates (which don't).
  const applyRank = (next) => {
    setRank(next)
    saveRank(next)
  }

  const recordRank = (next) => {
    applyRank(next)
    // Assessing is always in service of starting a game.
    setScreen('ai')
  }

  const render = () => {
    switch (screen) {
      case 'assess':
        return <Assessment onDone={recordRank} onCancel={() => setScreen('home')} />
      case 'lessons':
        return (
          <LessonPicker
            onSelect={(i) => {
              setLessonIndex(i)
              setScreen('tutorial')
            }}
            onExit={() => setScreen('play-menu')}
          />
        )
      case 'tutorial':
        return <Tutorial startIndex={lessonIndex} onExit={() => setScreen('lessons')} />
      case 'play-menu':
        return (
          <PlayMenu
            onPuzzles={() => setScreen('puzzles')}
            onFreePlay={() => setScreen('play')}
            onLessons={() => setScreen('lessons')}
            onPlayAI={() => {
              // A deliberate choice of board size/opponent strength, not the
              // one-tap quick path — show PlayAI's own picker screen.
              setQuickStart(false)
              setScreen(rank ? 'ai' : 'assess')
            }}
            onExit={() => setScreen('home')}
          />
        )
      case 'puzzles':
        return <Puzzles onExit={() => setScreen('play-menu')} />
      // PlayAI runs its own single-screen pre-game flow (board size only —
      // colour and, by default, opponent strength are automatic) unless
      // quickStart skips straight to a Quick game.
      case 'ai':
        return rank ? (
          <PlayAI
            rank={rank}
            onRankChange={applyRank}
            quickStart={quickStart}
            onExit={() => setScreen('home')}
          />
        ) : null
      case 'play':
        return <FreePlay onExit={() => setScreen('play-menu')} />
      default:
        return (
          <Home
            // Without a rank we can't set the opponent's level, so assess first
            // — either way this is the one-tap quick path.
            onPlay={() => {
              setQuickStart(true)
              setScreen(rank ? 'ai' : 'assess')
            }}
            onPlayModes={() => setScreen('play-menu')}
          />
        )
    }
  }

  return (
    <div className="app-shell">
      {/* Keyed on the screen name so each change remounts the subtree and
          replays its entrance animation. */}
      <div className="screen" key={screen}>
        {render()}
      </div>
    </div>
  )
}
