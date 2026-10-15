import musicSdk from '@/utils/musicSdk'
import { getLeaderboardSetting } from '@/utils/data'
import { getBoardsList, getListDetail } from '@/core/leaderboard'
import type { BoardItem } from '@/store/leaderboard/state'
import { getMusicFingerprint } from '../libraryIndex'
import * as lru from '../lruStore'
import { createLibrarySampler, shuffle, type Sampler } from './library'

/**
 * 熟歌热歌抽样器（roaming-plan §3.3/§4.4）
 * - 榜单池：当前榜单源的 热歌/飙升/新歌 榜各前 2 页（每页 30 首），进页面时后台预取 + 模块级缓存
 * - 混排：本地池 : 榜单池按档位比例续杯（保守 8:2 / 均衡 7:3 / 探索 5:5）
 * - 档位是模块状态，refill 时读取：切换档位只改后续续杯，不重播当前窗口
 * - 榜单池不可用 → 纯本地降级（照样能播）；预取失败静默，永不阻塞播放器
 */

/** 档位 id */
export type HotMixRatio = 'conservative' | 'balanced' | 'explore'
/** 档位 i18n key（字面量联合：编译期保证三语 key 存在） */
export type HotMixRatioKey = 'roaming_hotmix_conservative' | 'roaming_hotmix_balanced' | 'roaming_hotmix_explore'

export interface HotMixRatioOption {
  id: HotMixRatio
  /** 本地池占比（0~1），其余给榜单池 */
  localRatio: number
  labelKey: HotMixRatioKey
}

/** 三档位（写死，计划 §3.3）；默认取中间的「均衡」 */
export const HOT_MIX_RATIOS: HotMixRatioOption[] = [
  { id: 'conservative', localRatio: 0.8, labelKey: 'roaming_hotmix_conservative' },
  { id: 'balanced', localRatio: 0.7, labelKey: 'roaming_hotmix_balanced' },
  { id: 'explore', localRatio: 0.5, labelKey: 'roaming_hotmix_explore' },
]

const DEFAULT_RATIO: HotMixRatio = 'balanced'
/** 榜单名命中模式：各源都有 热歌/飙升/新歌 榜，命中优先，都不命中取第一个榜 */
const BOARD_NAME_PATTERNS = [/热歌/, /飙升/, /新歌/, /hot/i, /new/i]
/** 最多混入的榜数（热歌 + 飙升 + 新歌） */
const BOARD_PICK_MAX = 3
/** 每榜拉取页数（core 层每页 30 首） */
const BOARD_PAGES = 2

let currentRatio: HotMixRatio = DEFAULT_RATIO
/** 榜单池（模块级缓存，同一次运行内跨会话复用） */
let hotPool: LX.Music.MusicInfoOnline[] = []
const hotFingerprints = new Set<string>()
let prewarming: Promise<void> | null = null
/** 本次运行已成功预取过：池用尽后纯本地降级，不再重复拉榜（风控） */
let prewarmed = false

/** 当前档位 */
export const getHotMixRatio = (): HotMixRatio => currentRatio

/** 切换档位：只影响后续续杯，不重播当前窗口 */
export const setHotMixRatio = (ratio: HotMixRatio) => {
  if (HOT_MIX_RATIOS.some(item => item.id == ratio)) currentRatio = ratio
}

/** 档位对应的百分比参数（本地 : 榜单），供副标题文案插值 */
export const getHotMixPercent = (ratio: HotMixRatio = currentRatio) => {
  const option = HOT_MIX_RATIOS.find(item => item.id == ratio) ?? HOT_MIX_RATIOS[1]
  const local = Math.round(option.localRatio * 100)
  return { local, hot: 100 - local }
}

/** 按名称挑榜：每个模式取第一个命中且未用过的榜 */
const pickBoards = (boards: BoardItem[]): BoardItem[] => {
  const picked: BoardItem[] = []
  const used = new Set<string>()
  for (const pattern of BOARD_NAME_PATTERNS) {
    if (picked.length >= BOARD_PICK_MAX) break
    const board = boards.find(item => !used.has(item.id) && pattern.test(item.name))
    if (!board) continue
    used.add(board.id)
    picked.push(board)
  }
  if (!picked.length && boards.length) picked.push(boards[0])
  return picked
}

/** 榜单歌入池：指纹去重（与已有池、防复读窗比对） */
const absorb = (songs: LX.Music.MusicInfoOnline[]) => {
  for (const song of songs) {
    const fingerprint = getMusicFingerprint(song)
    if (hotFingerprints.has(fingerprint) || lru.has(fingerprint)) continue
    hotFingerprints.add(fingerprint)
    hotPool.push(song)
  }
  shuffle(hotPool)
}

/** 拉榜单池：单源顺序拉取，单榜失败不影响其他榜（风控：不并发） */
const fetchBoardPool = async(): Promise<void> => {
  const { source } = await getLeaderboardSetting()
  if (!musicSdk[source]?.leaderboard) return
  const boards = await getBoardsList(source)
  for (const board of pickBoards(boards)) {
    for (let page = 1; page <= BOARD_PAGES; page++) {
      try {
        absorb((await getListDetail(board.id, page)).list)
      } catch {
        break // 该榜这一页拉不到：换下一个榜
      }
    }
  }
}

/**
 * 后台预取榜单池（页面挂载时 fire-and-forget）
 * 已成功预取过就返回；失败/无结果则下次调用再试（自愈），全程静默
 */
export const prewarmHotMix = async(): Promise<void> => {
  if (prewarming) {
    await prewarming
    return
  }
  if (prewarmed) return
  prewarming = fetchBoardPool()
    .then(() => {
      if (hotPool.length) prewarmed = true
    })
    .catch(() => { /* 预取失败静默：起播退化纯本地 */ })
    .finally(() => { prewarming = null })
  await prewarming
}

/** 熟歌热歌抽样器：本地池 + 榜单池按当前档位混排 */
export const createHotMixSampler = async(): Promise<Sampler> => {
  const local = await createLibrarySampler()
  // 页面未预取过 / 预取失败：后台补预取，本次起播先纯本地出声（快出声）
  if (!hotPool.length) void prewarmHotMix()
  const combinedPoolSize = () => local.poolSize + hotPool.length
  lru.setPoolSize(combinedPoolSize())

  const drawHot = (count: number): LX.Music.MusicInfoOnline[] => {
    const out: LX.Music.MusicInfoOnline[] = []
    while (out.length < count && hotPool.length) {
      const idx = Math.floor(Math.random() * hotPool.length)
      const song = hotPool.splice(idx, 1)[0]
      if (lru.has(getMusicFingerprint(song))) continue
      out.push(song)
    }
    return out
  }

  return {
    poolSize: combinedPoolSize(),
    async refill(count) {
      if (!hotPool.length) {
        // 榜单池不可用：本次纯本地，并再试一次预取
        void prewarmHotMix()
        return await local.refill(count)
      }
      const localRatio = (HOT_MIX_RATIOS.find(item => item.id == currentRatio) ?? HOT_MIX_RATIOS[1]).localRatio
      const hot = drawHot(Math.max(1, Math.min(hotPool.length, count - Math.round(count * localRatio))))
      const songs = await local.refill(count - hot.length)
      lru.setPoolSize(combinedPoolSize())
      // 本批内可能有本地/榜单同曲（不同 id），由履带队列按指纹判重兜底
      return shuffle([...songs, ...hot])
    },
  }
}
