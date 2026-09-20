/**
 * 讨论会房间(私域-lite):后端是 worker.js 里的 Room Durable Object(/api/room/*)。
 * 主持人开房得房间码 + hostKey(只存主持人本机);参会者用昵称报到、投票,不要账号。
 * GitHub Pages 镜像没有 Worker,请求会落到静态 404 页 → 抛 RoomError('no room service')。
 */

export type Vote = 'wish' | 'maybe' | 'skip'

export interface RoomState {
  code: string
  season: string
  current: number | null
  order: number[]
  tally: Record<string, Record<Vote, string[]>>
  members: string[]
  createdAt: number
  updatedAt: number
}

export interface HostRoom {
  code: string
  hostKey: string
  season: string
}

export class RoomError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

const BASE = `${import.meta.env.BASE_URL}api/room`

async function call<T>(path: string, init?: RequestInit & { hostKey?: string }): Promise<T> {
  let resp: Response
  try {
    resp = await fetch(BASE + path, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.hostKey ? { 'X-Host-Key': init.hostKey } : {}),
        ...(init?.headers ?? {}),
      },
    })
  } catch (e) {
    throw new RoomError(0, e instanceof Error ? e.message : String(e))
  }
  if (!(resp.headers.get('Content-Type') ?? '').includes('json')) throw new RoomError(resp.status, 'no room service')
  const data = await resp.json()
  if (!resp.ok) throw new RoomError(resp.status, String(data?.error ?? `HTTP ${resp.status}`))
  return data as T
}

export const createRoom = (season: string, order: number[]) =>
  call<{ code: string; hostKey: string }>('', { method: 'POST', body: JSON.stringify({ season, order }) })
export const roomState = (code: string) => call<RoomState>(`/${code}`)
export const joinRoom = (code: string, nick: string) => call<RoomState>(`/${code}/join`, { method: 'POST', body: JSON.stringify({ nick }) })
export const voteRoom = (code: string, nick: string, id: number, v: Vote) =>
  call<RoomState>(`/${code}/vote`, { method: 'POST', body: JSON.stringify({ nick, id, v }) })
export const setCurrent = (code: string, hostKey: string, id: number | null) =>
  call<RoomState>(`/${code}/current`, { method: 'POST', hostKey, body: JSON.stringify({ id }) })
export const closeRoom = (code: string, hostKey: string) => call<{ ok: true }>(`/${code}/close`, { method: 'POST', hostKey })

/** 参会者打开的链接:同站 #join/房间码 */
export const joinUrl = (code: string) => `${location.origin}${location.pathname}#join/${code}`

const hostKeyOf = (season: string) => `btt:room:host:${season}`
export function loadHostRoom(season: string): HostRoom | null {
  try {
    const raw = localStorage.getItem(hostKeyOf(season))
    return raw ? (JSON.parse(raw) as HostRoom) : null
  } catch {
    return null
  }
}
export function saveHostRoom(season: string, room: HostRoom | null) {
  try {
    if (room) localStorage.setItem(hostKeyOf(season), JSON.stringify(room))
    else localStorage.removeItem(hostKeyOf(season))
  } catch {}
}

export function loadNick(): string {
  try {
    return localStorage.getItem('btt:room:nick') ?? ''
  } catch {
    return ''
  }
}
export function saveNick(nick: string) {
  try {
    localStorage.setItem('btt:room:nick', nick)
  } catch {}
}
