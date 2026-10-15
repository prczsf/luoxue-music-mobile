import songlistState, { type TagInfo, type TagInfoItem, type ListInfoItem } from '@/store/songlist/state'
import { getList, getListDetail, getSortList, getTags } from '@/core/songlist'
import { getMusicFingerprint } from '../libraryIndex'
import * as lru from '../lruStore'
import { shuffle, type Sampler } from './library'

/**
 * 风格盲盒抽样器（roaming-plan §4.1/§4.2）
 * - 预设 → 标签别名表；对当前选中源 getTags() 匹配标签（精确 → 包含）
 * - 单源超时 3 秒，失败按运行时已启用源顺序逐个降级，全部失败返回空（UI 回退全部歌曲）
 * - 流程：随机翻 2 个不同歌单 → 各拉详情第 1 页 → 指纹去重 + LRU 过滤 → 洗牌入蓄水池
 * - 蓄水池 <20 时后台换歌单续满；单源单发、不并发（风控，计划 §6）
 */

/** 单次源尝试的总超时（含标签、列表、详情请求） */
const FETCH_TIMEOUT = 3000
/** 蓄水池低于此值时后台补货 */
const RESERVOIR_MIN = 20
/** 在线池视为无限：置大值让 LRU 走默认 300 容量、不触发小池缩窗 */
const ONLINE_POOL_SIZE = 100000

/** 8 个风格预设的 i18n key（字面量联合：编译期保证三语 key 存在） */
export type GenreNameKey =
  | 'roaming_genre_rock'
  | 'roaming_genre_focus'
  | 'roaming_genre_nostalgia'
  | 'roaming_genre_acg'
  | 'roaming_genre_folk'
  | 'roaming_genre_pop'
  | 'roaming_genre_jazz'
  | 'roaming_genre_random'

export interface GenrePreset {
  id: string
  /** i18n key（技术 key，用户不可见） */
  nameKey: GenreNameKey
  /** 色块图标（icoMoon 图标集，无 emoji） */
  icon: string
  /** 图标主色 */
  color: string
  /** 色块底色（低透明度多巴胺色） */
  tint: string
  /** 标签别名（空数组 = 真随机，不限标签） */
  aliases: string[]
}

/** 8 个预设盲盒（计划 §4.1，写死） */
export const GENRE_PRESETS: GenrePreset[] = [
  { id: 'rock', nameKey: 'roaming_genre_rock', icon: 'volume-higt', color: '#e5484d', tint: 'rgba(229,72,77,0.14)', aliases: ['摇滚', 'rock'] },
  { id: 'focus', nameKey: 'roaming_genre_focus', icon: 'playback-rate', color: '#3b82f6', tint: 'rgba(59,130,246,0.14)', aliases: ['轻音乐', '轻音', '纯音乐', '放松', '治愈', '专注', '学习'] },
  { id: 'nostalgia', nameKey: 'roaming_genre_nostalgia', icon: 'music_time', color: '#f59e0b', tint: 'rgba(245,158,11,0.14)', aliases: ['怀旧', '经典', '老歌'] },
  { id: 'acg', nameKey: 'roaming_genre_acg', icon: 'love', color: '#ec4899', tint: 'rgba(236,72,153,0.14)', aliases: ['ACG', '二次元', '动漫'] },
  { id: 'folk', nameKey: 'roaming_genre_folk', icon: 'comment', color: '#10b981', tint: 'rgba(16,185,129,0.14)', aliases: ['民谣', '校园民谣'] },
  { id: 'pop', nameKey: 'roaming_genre_pop', icon: 'thumbs-up', color: '#8b5cf6', tint: 'rgba(139,92,246,0.14)', aliases: ['欧美流行', '欧美', '欧美音乐', 'pop'] },
  { id: 'jazz', nameKey: 'roaming_genre_jazz', icon: 'volume-medium', color: '#f97316', tint: 'rgba(249,115,22,0.14)', aliases: ['爵士', 'R&B', '蓝调'] },
  { id: 'random', nameKey: 'roaming_genre_random', icon: 'list-random', color: '#14b8a6', tint: 'rgba(20,184,166,0.14)', aliases: [] },
]

const withTimeout = async <T>(task: Promise<T>, ms: number = FETCH_TIMEOUT): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error('timeout')) }, ms)
    task.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) },
    )
  })
}

/** 标签匹配：别名精确命中优先，其次双向包含（大小写不敏感） */
const matchTag = <T extends LX.OnlineSource>(tags: TagInfo<T>, aliases: string[]): TagInfoItem<T> | null => {
  const items: Array<TagInfoItem<T>> = []
  for (const group of tags.tags) items.push(...group.list)
  for (const hot of tags.hotTag) items.push(hot)
  const normalized = aliases.map(a => a.trim().toLowerCase()).filter(a => a.length > 0)
  for (const alias of normalized) {
    const exact = items.find(item => item.name.trim().toLowerCase() == alias)
    if (exact) return exact
  }
  for (const alias of normalized) {
    if (alias.length < 2) continue
    const partial = items.find(item => {
      const name = item.name.trim().toLowerCase()
      return name.includes(alias) || (name.length >= 2 && alias.includes(name))
    })
    if (partial) return partial
  }
  return null
}

/** 单源尝试：标签匹配 → 随机排序 → 随机翻页挑 2 个不同歌单 → 各拉详情第 1 页 */
const attemptSource = async(source: LX.OnlineSource, preset: GenrePreset): Promise<LX.Music.MusicInfoOnline[]> => {
  let tagId = ''
  if (preset.aliases.length) {
    const tags = await getTags(source)
    const tag = matchTag(tags, preset.aliases)
    if (!tag) throw new Error('tag not found: ' + preset.id)
    tagId = tag.id
  }
  const sorts = getSortList(source)
  if (!sorts.length) throw new Error('no sort list: ' + source)
  const sortId = sorts[Math.floor(Math.random() * sorts.length)].id
  const first = await getList(source, tagId, sortId, 1)
  if (!first.list.length) throw new Error('empty songlist page: ' + source)
  const maxPage = Math.max(1, first.maxPage)
  let items: ListInfoItem[] = [...first.list]
  if (maxPage > 1) {
    const page2 = 1 + Math.floor(Math.random() * maxPage)
    try {
      const second = await getList(source, tagId, sortId, page2)
      items = items.concat(second.list)
    } catch { /* 多翻一页失败就只用第一页 */ }
  }
  shuffle(items)
  const picked: ListInfoItem[] = []
  const pickedIds = new Set<string>()
  for (const item of items) {
    if (pickedIds.has(item.id)) continue
    pickedIds.add(item.id)
    picked.push(item)
    if (picked.length == 2) break
  }
  if (!picked.length) throw new Error('no songlist picked: ' + source)
  const details = await Promise.all(picked.map(async item => getListDetail(item.id, source, 1)))
  const songs = details.flatMap(detail => detail.list)
  if (!songs.length) throw new Error('empty songlist detail: ' + source)
  return songs
}

/** 按降级链取歌：当前选中源优先，随后按运行时已启用源顺序；全失败返回空 */
const fetchGenreSongs = async(preset: GenrePreset): Promise<LX.Music.MusicInfoOnline[]> => {
  const current = songlistState.listInfo.source
  const order: LX.OnlineSource[] = [current, ...songlistState.sources.filter(source => source != current)]
  for (const source of order) {
    try {
      return await withTimeout(attemptSource(source, preset))
    } catch { /* 单源失败/超时：降级到下一个源 */ }
  }
  return []
}

/** 风格盲盒抽样器：首次取货在创建时完成，之后按需补蓄水池 */
export const createGenreSampler = async(preset: GenrePreset): Promise<Sampler> => {
  let reservoir: LX.Music.MusicInfoOnline[] = []
  const seenFingerprints = new Set<string>()
  let fetching: Promise<void> | null = null
  lru.setPoolSize(ONLINE_POOL_SIZE)

  const absorb = (songs: LX.Music.MusicInfoOnline[]) => {
    const fresh = songs.filter(song => {
      const fingerprint = getMusicFingerprint(song)
      if (seenFingerprints.has(fingerprint) || lru.has(fingerprint)) return false
      seenFingerprints.add(fingerprint)
      return true
    })
    reservoir.push(...shuffle(fresh))
  }
  const ensureReservoir = async(): Promise<void> => {
    if (fetching) return fetching
    fetching = fetchGenreSongs(preset)
      .then(songs => { absorb(songs) })
      .finally(() => { fetching = null })
    return fetching
  }
  await ensureReservoir()

  const draw = (count: number): LX.Music.MusicInfo[] => {
    const out: LX.Music.MusicInfo[] = []
    while (out.length < count && reservoir.length) {
      const idx = Math.floor(Math.random() * reservoir.length)
      const song = reservoir.splice(idx, 1)[0]
      if (lru.has(getMusicFingerprint(song))) continue
      out.push(song)
    }
    return out
  }

  return {
    poolSize: ONLINE_POOL_SIZE,
    async refill(count) {
      lru.setPoolSize(ONLINE_POOL_SIZE)
      if (reservoir.length < RESERVOIR_MIN) await ensureReservoir()
      const out = draw(count)
      // 后台悄悄续满蓄水池（计划 §4.1），不阻塞本次出歌
      if (reservoir.length < RESERVOIR_MIN) void ensureReservoir()
      return out
    },
  }
}
