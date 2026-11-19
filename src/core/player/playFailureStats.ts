import { storageDataPrefix } from '@/config/constant'
import { getData, saveData } from '@/plugins/storage'
import {
  clearFailureInMap,
  DEFAULT_FAILURE_CLEANUP_THRESHOLD,
  filterSuspectFailureMusics,
  type PlayFailureStatsMap,
  recordFailureInMap,
  type SuspectFailureMusic,
} from './playFailureStatsCore'

export type { PlayFailureRecord, PlayFailureStatsMap, SuspectFailureMusic } from './playFailureStatsCore'
export { DEFAULT_FAILURE_CLEANUP_THRESHOLD } from './playFailureStatsCore'

type Music = LX.Music.MusicInfo | LX.Download.ListItem

const storageKey = storageDataPrefix.playFailureStats

let statsCache: PlayFailureStatsMap | null = null
let loadPromise: Promise<PlayFailureStatsMap> | null = null
let writeChain: Promise<void> = Promise.resolve()

const getMusicId = (musicInfo: Music) => 'progress' in musicInfo ? musicInfo.metadata.musicInfo.id : musicInfo.id

const ensureLoaded = async(): Promise<PlayFailureStatsMap> => {
  if (statsCache) return statsCache
  if (!loadPromise) {
    loadPromise = getData<PlayFailureStatsMap>(storageKey).then((data) => {
      statsCache = data && typeof data == 'object' ? data : {}
      return statsCache
    }).catch(() => {
      statsCache = {}
      return statsCache
    }).finally(() => {
      loadPromise = null
    })
  }
  return loadPromise
}

const persistStats = async(nextMap: PlayFailureStatsMap): Promise<void> => {
  statsCache = nextMap
  writeChain = writeChain.then(async() => {
    await saveData(storageKey, nextMap)
  }).catch((err) => {
    console.log('save playFailureStats failed', err)
  })
  return writeChain
}

/**
 * 记录一次真实播放失败（仅非临时故障在真实播放链路调用，预取链路禁止调用）
 */
export const recordPlayFailure = async(musicInfo: Music | null, reason = ''): Promise<void> => {
  if (!musicInfo) return
  const musicId = getMusicId(musicInfo)
  const current = await ensureLoaded()
  const next = recordFailureInMap(current, musicId, reason, Date.now())
  await persistStats(next)
}

/**
 * 歌曲成功起播时清除其历史失败记录，保证偶发误判自愈
 */
export const clearPlayFailure = async(musicInfo: Music | null): Promise<void> => {
  if (!musicInfo) return
  await removePlayFailureByIds([getMusicId(musicInfo)])
}

/**
 * 批量清除指定歌曲 ID 的失败记录
 */
export const removePlayFailureByIds = async(musicIds: readonly string[]): Promise<void> => {
  if (!musicIds.length) return
  const current = await ensureLoaded()
  const { map, changed } = clearFailureInMap(current, musicIds)
  if (!changed) return
  await persistStats(map)
}

export const getPlayFailureStats = async(): Promise<PlayFailureStatsMap> => {
  const current = await ensureLoaded()
  return { ...current }
}

/**
 * 筛选某歌单中累计失败达到阈值的可疑歌曲
 */
export const listSuspectFailureMusics = async(
  list: readonly LX.Music.MusicInfo[],
  threshold = DEFAULT_FAILURE_CLEANUP_THRESHOLD,
  excludeMusicId?: string | null,
): Promise<SuspectFailureMusic[]> => {
  const current = await ensureLoaded()
  return filterSuspectFailureMusics(list, current, threshold, excludeMusicId)
}
