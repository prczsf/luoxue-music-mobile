import musicSdk from '@/utils/musicSdk'
import { toNewMusicInfo } from '@/utils'
import searchMusicState from '@/store/search/music/state'
import { toast } from '@/utils/tools'
import { getMusicByCoord, getMusicFingerprint, getRoamingIndex, type SongCoord } from '../libraryIndex'
import * as lru from '../lruStore'

/**
 * 抽样器统一接口：按漫游规则产出下一批歌曲
 * 所有抽样在指纹层做 LRU 过滤与去重，保证本地/在线混合池行为一致
 */

export interface Sampler {
  /** 可用池总指纹数（供 LRU 动态缩窗） */
  readonly poolSize: number
  refill: (count: number) => Promise<LX.Music.MusicInfo[]>
}

/** Fisher-Yates 原地洗牌 */
export const shuffle = <T>(arr: T[]): T[] => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
  }
  return arr
}

/**
 * 从坐标池抽样：过滤 LRU 后随机取 count 个；3 轮仍全撞窗则兜底放行
 */
export const sampleCoords = (coords: SongCoord[], count: number): SongCoord[] => {
  if (!coords.length) return []
  const results: SongCoord[] = []
  const used = new Set<number>()
  let guard = coords.length * 3

  while (results.length < count && guard-- > 0) {
    let idx = Math.floor(Math.random() * coords.length)
    if (used.has(idx)) {
      // 环形找下一个未用位置
      let steps = 0
      while (used.has(idx) && steps++ < coords.length) idx = (idx + 1) % coords.length
      if (used.has(idx)) break
    }
    used.add(idx)
    const musicInfo = getMusicByCoord(coords[idx])
    if (musicInfo && lru.has(getMusicFingerprint(musicInfo))) continue
    results.push(coords[idx])
  }

  // 兜底：LRU 撞得太狠导致没抽够，放开 LRU 限制补齐
  if (results.length < count) {
    const rest = coords.filter((_, i) => !used.has(i))
    shuffle(rest)
    results.push(...rest.slice(0, count - results.length))
  }
  return results.slice(0, count)
}

const coordsToMusic = (coords: SongCoord[]): LX.Music.MusicInfo[] => {
  const list: LX.Music.MusicInfo[] = []
  for (const coord of coords) {
    const musicInfo = getMusicByCoord(coord)
    if (musicInfo) list.push(musicInfo)
  }
  return list
}

/** 全库漫游抽样器 */
export const createLibrarySampler = async(): Promise<Sampler> => {
  const index = await getRoamingIndex()
  const coords = [...index.fingerprintToCoord.values()]
  lru.setPoolSize(coords.length)
  return {
    poolSize: coords.length,
    async refill(count) {
      lru.setPoolSize(coords.length)
      return coordsToMusic(sampleCoords(coords, count))
    },
  }
}

/** 在线补搜：只拉第 1 页（§4.3） */
const ONLINE_SEARCH_LIMIT = 30
/** 续杯混合比例：本地 : 在线 ≈ 6 : 4 */
const ONLINE_RATIO = 0.4
/** 补搜失败提示：每个漫游会话最多一次 */
let searchFailedTipShown = false

/** 当前用于搜索的在线源：选中 all 时取第一个具体源（searchMusicState.sources 末尾是 'all'） */
const getSearchSource = (): LX.OnlineSource | null => {
  const { source, sources } = searchMusicState
  if (source != 'all') return source
  return sources.find(item => item != 'all') ?? null
}

/**
 * 关键词搜歌（§4.3）：直接调 musicSdk 的 musicSearch，绕过 core/search/music.search()，避免改写搜索 store
 * 原始结果为旧格式，需 toNewMusicInfo 映射后才是 MusicInfoOnline
 */
const searchOnlineByName = async(name: string): Promise<LX.Music.MusicInfoOnline[]> => {
  const source = getSearchSource()
  if (!source) return []
  const search = musicSdk[source]?.musicSearch?.search
  if (!search) return []
  const result = await (search(name, 1, ONLINE_SEARCH_LIMIT) as Promise<{ list: any[] }>)
  return (result?.list ?? [])
    .map(item => toNewMusicInfo(item) as LX.Music.MusicInfoOnline)
    .filter(item => !!item.id)
}

/** 补搜失败静默兜底：最多提示一次，永不阻塞本地续杯 */
const tipSearchFailed = () => {
  if (searchFailedTipShown) return
  searchFailedTipShown = true
  toast(global.i18n.t('roaming_artist_search_failed'))
}

/**
 * 艺人漫游抽样器（单选/多选共用：names 传多个即混播），带在线补搜垫刀（§4.3）
 * - 首次起播纯本地（毫秒出声），在线补搜转后台任务
 * - 在线结果到达后按 6:4 混入后续续杯；与本地/在线/ LRU 撞车的不复读
 * - 单源单发、逐个艺人顺序拉取（风控，§6）；失败静默不影响本地续杯
 */
export const createArtistSampler = async(names: string[]): Promise<Sampler> => {
  const index = await getRoamingIndex()
  const fingerprintSet = new Set<string>()
  for (const name of names) {
    const fps = index.artistInverted.get(name)
    if (fps) for (const fp of fps) fingerprintSet.add(fp)
  }
  const coords: SongCoord[] = []
  for (const fp of fingerprintSet) {
    const coord = index.fingerprintToCoord.get(fp)
    if (coord) coords.push(coord)
  }
  lru.setPoolSize(coords.length)

  const onlinePool: LX.Music.MusicInfoOnline[] = []
  const onlineFingerprints = new Set<string>()
  let firstRefillDone = false
  let onlineFetching: Promise<void> | null = null

  const absorb = (songs: LX.Music.MusicInfoOnline[]) => {
    for (const song of songs) {
      const fingerprint = getMusicFingerprint(song)
      // 与本地倒排撞车（本地已有这首）或与已有在线歌重复、或在防复读窗内的，都不补进来
      if (fingerprintSet.has(fingerprint) || onlineFingerprints.has(fingerprint) || lru.has(fingerprint)) continue
      onlineFingerprints.add(fingerprint)
      onlinePool.push(song)
    }
    shuffle(onlinePool)
  }

  const fetchOnline = async(): Promise<void> => {
    if (onlineFetching) {
      await onlineFetching
      return
    }
    onlineFetching = (async() => {
      for (const name of names) {
        try {
          absorb(await searchOnlineByName(name))
        } catch {
          tipSearchFailed()
        }
      }
    })().finally(() => { onlineFetching = null })
    await onlineFetching
  }

  const drawOnline = (count: number): LX.Music.MusicInfoOnline[] => {
    const out: LX.Music.MusicInfoOnline[] = []
    while (out.length < count && onlinePool.length) {
      const idx = Math.floor(Math.random() * onlinePool.length)
      const song = onlinePool.splice(idx, 1)[0]
      if (lru.has(getMusicFingerprint(song))) continue
      out.push(song)
    }
    return out
  }

  return {
    poolSize: coords.length,
    async refill(count) {
      if (!firstRefillDone) {
        // 垫刀：立即返回本地歌，在线补搜转后台
        firstRefillDone = true
        void fetchOnline()
        lru.setPoolSize(coords.length)
        return coordsToMusic(sampleCoords(coords, count))
      }
      lru.setPoolSize(coords.length + onlinePool.length)
      if (!onlinePool.length) {
        if (!onlineFetching) void fetchOnline()
        return coordsToMusic(sampleCoords(coords, count))
      }
      const online = drawOnline(Math.min(onlinePool.length, Math.max(1, Math.round(count * ONLINE_RATIO))))
      const local = coordsToMusic(sampleCoords(coords, count - online.length))
      if (!onlinePool.length && !onlineFetching) void fetchOnline()
      return shuffle([...local, ...online])
    },
  }
}
