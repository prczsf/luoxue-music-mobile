import { LIST_IDS, storageDataPrefix } from '@/config/constant'
import { getData, saveData } from '@/plugins/storage'
import { allMusicList } from '@/utils/listManage'

/**
 * 本地曲库索引：指纹去重坐标池 + 歌手倒排表
 * 只存指纹与坐标，不复制 MusicInfo 对象；取歌时按坐标回查 allMusicList
 */

const INDEX_SCHEMA_VERSION = 1

export interface SongCoord {
  listId: string
  songId: string
}

export interface RoamingIndex {
  /** 指纹 -> 坐标（跨歌单去重，同歌仅保留首个坐标） */
  fingerprintToCoord: Map<string, SongCoord>
  /** 歌手名 -> 指纹数组（合唱已拆分，一坐标可挂多歌手） */
  artistInverted: Map<string, string[]>
  /** Top 常听艺人（已按数量降序） */
  topArtists: Array<{ name: string, count: number }>
  /** 去重后总歌数 */
  totalSongs: number
  /** 参与漫游的歌单数（排除名单不计） */
  participatingLists: number
  /** 本地总歌数（空态判断用，不去重口径无意义，这里即 totalSongs） */
  builtAt: number
}

interface SerializedIndex {
  v: number
  entries: Array<[string, SongCoord]>
  artists: Array<[string, string[]]>
  totalSongs: number
  participatingLists: number
  builtAt: number
}

const SINGER_SPLIT_RXP = /[/、&;;，,]/
const FINGERPRINT_NORMALIZE_RXP = /[\s[\]【】()（）《》<>·・.。，,、!！?？'"`~@#$%^&*+=|\\/;；:：_—-]+/g

/** 歌曲指纹：标准化歌名 + 歌手，本地/在线同一套算法 */
export const getFingerprint = (name: string, singer: string): string => {
  return `${name.trim().toLowerCase().replace(FINGERPRINT_NORMALIZE_RXP, '')}|${singer.trim().toLowerCase().replace(FINGERPRINT_NORMALIZE_RXP, '')}`
}

export const getMusicFingerprint = (musicInfo: LX.Music.MusicInfo): string => getFingerprint(musicInfo.name, musicInfo.singer)

/** 拆分歌手字段（合唱挂多个歌手名） */
const splitSingers = (singer: string): string[] => {
  return singer.split(SINGER_SPLIT_RXP).map(s => s.trim()).filter(s => s.length > 0)
}

/**
 * 排除歌单名单（存 storage，与索引解耦：改名单只需重建索引）
 */
let excludeLists: string[] | null = null
let excludeListsPromise: Promise<string[]> | null = null
export const getExcludeLists = async(): Promise<string[]> => {
  const cached = excludeLists
  if (cached) return Promise.resolve(cached)
  if (!excludeListsPromise) {
    excludeListsPromise = getData<string[]>(storageDataPrefix.roamingExcludeLists).then(ids => {
      const list = ids ?? []
      excludeLists = list
      return list
    })
  }
  return excludeListsPromise
}
export const setExcludeLists = async(ids: string[]) => {
  excludeLists = ids
  await saveData(storageDataPrefix.roamingExcludeLists, ids)
}

let index: RoamingIndex | null = null
let buildingPromise: Promise<RoamingIndex> | null = null

const buildIndex = async(excluded: Set<string>): Promise<RoamingIndex> => {
  const fingerprintToCoord = new Map<string, SongCoord>()
  const artistInverted = new Map<string, string[]>()
  let participatingLists = 0

  for (const [listId, musics] of allMusicList.entries()) {
    if (listId == LIST_IDS.ROAMING || excluded.has(listId) || !musics.length) continue
    participatingLists++
    for (const musicInfo of musics) {
      if (!musicInfo?.name) continue
      const fingerprint = getMusicFingerprint(musicInfo)
      if (fingerprintToCoord.has(fingerprint)) continue
      fingerprintToCoord.set(fingerprint, { listId, songId: musicInfo.id })
      for (const singer of splitSingers(musicInfo.singer)) {
        let arr = artistInverted.get(singer)
        if (!arr) artistInverted.set(singer, arr = [])
        arr.push(fingerprint)
      }
    }
  }

  const topArtists = [...artistInverted.entries()]
    .map(([name, fps]) => ({ name, count: fps.length }))
    .filter(a => a.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 9)

  return {
    fingerprintToCoord,
    artistInverted,
    topArtists,
    totalSongs: fingerprintToCoord.size,
    participatingLists,
    builtAt: Date.now(),
  }
}

const saveIndexCache = (idx: RoamingIndex) => {
  const data: SerializedIndex = {
    v: INDEX_SCHEMA_VERSION,
    entries: [...idx.fingerprintToCoord.entries()],
    artists: [...idx.artistInverted.entries()],
    totalSongs: idx.totalSongs,
    participatingLists: idx.participatingLists,
    builtAt: idx.builtAt,
  }
  void saveData(storageDataPrefix.roamingIndexCache, data)
}

const getTopArtists = (inverted: Map<string, string[]>): Array<{ name: string, count: number }> => {
  return [...inverted.entries()]
    .map(([name, fps]) => ({ name, count: fps.length }))
    .filter(a => a.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 9)
}

const loadIndexCache = async(): Promise<RoamingIndex | null> => {
  const data = await getData<SerializedIndex>(storageDataPrefix.roamingIndexCache)
  if (!data || data.v != INDEX_SCHEMA_VERSION) return null
  const artistInverted = new Map(data.artists)
  return {
    fingerprintToCoord: new Map(data.entries),
    artistInverted,
    topArtists: getTopArtists(artistInverted),
    totalSongs: data.totalSongs,
    participatingLists: data.participatingLists,
    builtAt: data.builtAt,
  }
}

/**
 * 获取索引：有缓存先用缓存，脏了重建；并发调用共享同一次构建
 */
export const getRoamingIndex = async(isDirty = false): Promise<RoamingIndex> => {
  const cached = index
  if (cached && !isDirty) return Promise.resolve(cached)
  if (!buildingPromise) {
    buildingPromise = (async() => {
      let idx = cached ?? await loadIndexCache()
      if (isDirty || !idx) {
        const excluded = new Set(await getExcludeLists())
        idx = await buildIndex(excluded)
        saveIndexCache(idx)
      }
      index = idx
      return idx
    })().finally(() => { buildingPromise = null })
  }
  return buildingPromise
}

/** 按坐标回查歌曲；歌已被删则返回 null（视为失效坐标） */
export const getMusicByCoord = (coord: SongCoord): LX.Music.MusicInfo | null => {
  return allMusicList.get(coord.listId)?.find(m => m.id == coord.songId) ?? null
}

/** 排除名单变更后调用：下次 getRoamingIndex 时重建 */
export const invalidateIndex = () => {
  void getRoamingIndex(true).catch(() => {})
}

// 订阅本地歌单变更，自动失效索引
global.app_event.on('myListMusicUpdate', () => { invalidateIndex() })
global.app_event.on('mylistUpdated', () => { invalidateIndex() })
