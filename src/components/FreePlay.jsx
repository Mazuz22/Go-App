import { useRef, useState } from 'react'
import GoBoard from './GoBoard'
import { PassIcon } from './icons'

const KOMI = 6.5

/**
 * Two-player board. Passing is what actually concludes a game of Go: two
 * passes in a row end play, then dead stones are agreed and territory counted.
 */
export default function FreePlay({ onExit }) {
  const gameRef = useRef(null)
  const [over, setOver] = useState(false)
  const [score, setScore] = useState(null)
  const [boardKey, setBoardKey] = useState(0)

  const refresh = ({ game }) => {
    const finished = game.isOver()
    setOver(finished)
    // Recounted on every render, since marking a group dead changes the score
    // without playing a move.
    setScore(finished ? game.score() : null)
  }

  const handlePass = () => {
    gameRef.current?.pass()
  }

  const newGame = () => {
    setOver(false)
    setScore(null)
    setBoardKey((n) => n + 1)
  }

  const winner =
    score && (score.black === score.white ? null : score.black > score.white ? 'Black' : 'White')

  return (
    <div className="play-ai">
      <header className="tutorial-header">
        <button type="button" className="link-button" onClick={onExit}>
          ← Play modes
        </button>
        <span className="tutorial-progress">Two players · komi {KOMI}</span>
      </header>

      <GoBoard
        key={boardKey}
        boardSize={9}
        komi={KOMI}
        onReady={(game) => {
          gameRef.current = game
        }}
        onRender={refresh}
      />

      <div className="tutorial-footer">
        {over ? (
          <>
            <p className="tutorial-feedback info">
              Both players passed. Tap any group that is dead to remove it from the count.
            </p>
            {score && (
              <p className="score-line">
                Black {score.black} · White {score.white}
                {' — '}
                <strong>{winner ? `${winner} wins` : 'a draw'}</strong>
              </p>
            )}
            <button type="button" className="primary-button" onClick={newGame}>
              New game
            </button>
          </>
        ) : (
          <>
            <p className="tutorial-feedback info">
              Pass when you have no useful move left. Two passes in a row end the game.
            </p>
            <div className="go-board-toolbar">
              <button type="button" onClick={handlePass}>
                <PassIcon />
                Pass
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
