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
            onExit={() => setScreen('home')}
          />
        )
      case 'tutorial':
        return <Tutorial startIndex={lessonIndex} onExit={() => setScreen('lessons')} />
      case 'play-menu':
        return (
          <PlayMenu
            // Without a rank we can't set the opponent's level, so assess first.
            onPlayAI={() => setScreen(rank ? 'ai' : 'assess')}
            onPuzzles={() => setScreen('puzzles')}
            onFreePlay={() => setScreen('play')}
            onExit={() => setScreen('home')}
          />
        )
      case 'puzzles':
        return <Puzzles onExit={() => setScreen('play-menu')} />
      // PlayAI runs its own pre-game flow: board size, then nigiri.
      case 'ai':
        return rank ? (
          <PlayAI rank={rank} onRankChange={applyRank} onExit={() => setScreen('home')} />
        ) : null
      case 'play':
        return <FreePlay onExit={() => setScreen('play-menu')} />
      default:
        return (
          <Home
            rank={rank}
            onPlay={() => setScreen('play-menu')}
            onHowToPlay={() => setScreen('lessons')}
            onReassess={() => setScreen('assess')}
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
