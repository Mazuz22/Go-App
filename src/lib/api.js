/**
 * Client for the GNU Go backend (see server/).
 *
 * In dev, Vite proxies /api to localhost:3001. In production the backend is
 * deployed separately, so VITE_API_BASE supplies its origin.
 */

const BASE = `${import.meta.env.VITE_API_BASE ?? ''}/api`

/** Raised for non-2xx responses so callers can read `status` and message. */
export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request(path, { method = 'GET', body } = {}) {
  let response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Could not reach the game server.', 0)
  }

  if (response.status === 204) return null

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(payload?.error ?? `Request failed (${response.status})`, response.status)
  }
  return payload
}

export const createGame = ({ targetKyu, boardSize = 9, humanColor = 'black' }) =>
  request('/games', { method: 'POST', body: { targetKyu, boardSize, humanColor } })

export const getGame = (id) => request(`/games/${id}`)

export const playMove = (id, y, x) =>
  request(`/games/${id}/move`, { method: 'POST', body: { y, x } })

export const passMove = (id) => request(`/games/${id}/pass`, { method: 'POST' })

export const getHint = (id) => request(`/games/${id}/hint`)

export const reviewGame = (id) => request(`/games/${id}/review`, { method: 'POST' })

export const explainMistakes = (id, mistakes) =>
  request(`/games/${id}/coach`, { method: 'POST', body: { mistakes } })

export const resignGame = (id) => request(`/games/${id}/resign`, { method: 'POST' })

export const deleteGame = (id) => request(`/games/${id}`, { method: 'DELETE' })
