export interface PlayFailureRecord {
  count: number
  firstAt: number
  lastAt: number
  reason: string
}

export type PlayFailureStatsMap = Record<string, PlayFailureRecord>

export const MAX_FAILURE_STATS_RECORDS = 500
export const FAILURE_DEDUP_WINDOW_MS = 60_000
export const DEFAULT_FAILURE_CLEANUP_THRESHOLD = 3

/**
 * 裁剪超过容量上限的失败记录（按最近失败时间 LRU 淘汰最旧条目）
 */
const trimStatsMap = (map: PlayFailureStatsMap, maxRecords: number): PlayFailureStatsMap => {
  const entries = Object.entries(map)
  if (entries.length <= maxRecords) return map
  entries.sort((a, b) => b[1].lastAt - a[1].lastAt)
  return Object.fromEntries(entries.slice(0, maxRecords))
}

/**
 * 在纯映射中累加一条播放失败记录。
 * 同一首歌在去重时间窗内（如刷新重试）只计 1 次，避免单次播歌错误直接打满阈值。
 */
export const recordFailureInMap = (
  map: PlayFailureStatsMap,
  musicId: string,
  reason: string,
  now: number,
  dedupWindowMs = FAILURE_DEDUP_WINDOW_MS,
  maxRecords = MAX_FAILURE_STATS_RECORDS,
): PlayFailureStatsMap => {
  if (!musicId) return map
  const existing = map[musicId]
  const next: PlayFailureStatsMap = { ...map }
  if (existing) {
    const withinDedup = now - existing.lastAt < dedupWindowMs
    next[musicId] = {
      count: withinDedup ? existing.count : existing.count + 1,
      firstAt: existing.firstAt,
      lastAt: now,
      reason: reason || existing.reason,
    }
  } else {
    next[musicId] = {
      count: 1,
      firstAt: now,
      lastAt: now,
      reason: reason || 'unknown',
    }
  }
  return trimStatsMap(next, maxRecords)
}

/**
 * 从映射中移除指定歌曲 ID 的失败记录（成功起播或已被清理后调用）
 */
export const clearFailureInMap = (
  map: PlayFailureStatsMap,
  musicIds: readonly string[],
): { map: PlayFailureStatsMap, changed: boolean } => {
  let changed = false
  const next: PlayFailureStatsMap = { ...map }
  for (const id of musicIds) {
    if (Object.prototype.hasOwnProperty.call(next, id)) {
      delete next[id]
      changed = true
    }
  }
  return { map: changed ? next : map, changed }
}

export interface SuspectFailureMusic {
  musicInfo: LX.Music.MusicInfo
  stats: PlayFailureRecord
}

/**
 * 从给定歌单中筛选达到失败次数阈值的候选歌曲
 */
export const filterSuspectFailureMusics = (
  list: readonly LX.Music.MusicInfo[],
  statsMap: PlayFailureStatsMap,
  threshold = DEFAULT_FAILURE_CLEANUP_THRESHOLD,
  excludeMusicId?: string | null,
): SuspectFailureMusic[] => {
  const result: SuspectFailureMusic[] = []
  for (const musicInfo of list) {
    if (excludeMusicId && musicInfo.id == excludeMusicId) continue
    const stats = statsMap[musicInfo.id]
    if (!stats || stats.count < threshold) continue
    result.push({ musicInfo, stats })
  }
  return result
}
