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

/** 艺人漫游抽样器（单选/多选共用：names 传多个即混播） */
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
  return {
    poolSize: coords.length,
    async refill(count) {
      lru.setPoolSize(coords.length)
      return coordsToMusic(sampleCoords(coords, count))
    },
  }
}
