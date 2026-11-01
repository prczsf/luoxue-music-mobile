import { LIST_IDS } from '@/config/constant'
import { removeMusicList, setMusicList } from '@/utils/listManage'
import { arrPush } from '@/utils/common'
import { isMusicInvalid } from '@/core/player/invalidMusic'
import { hasDislike } from '@/core/dislikeList'
import { playList } from '@/core/player/player'
import { updatePlayIndex } from '@/core/player/playInfo'
import playerState from '@/store/player/state'
import { toast } from '@/utils/tools'
import { getMusicFingerprint } from './libraryIndex'
import * as lru from './lruStore'
import type { Sampler } from './samplers/library'

/**
 * 履带队列引擎：把漫游歌单伪装成普通列表注入播放器（见 ADR 0003）
 * 契约：窗口 18、续杯水位 <5、续杯量 5、修剪阈值已播 >10、修剪量 5
 * 不变式：窗口永不含当前播放歌以外的已播段；当前歌永远在窗口内
 * 去重：窗口内按指纹唯一——本地/在线同一首歌（不同 id）只保留一首
 */

const WINDOW_SIZE = 18
const REFILL_THRESHOLD = 5
const REFILL_AMOUNT = 5
const TRIM_THRESHOLD = 10
const TRIM_AMOUNT = 5
const RECENT_MAX = 10

interface RoamingSession {
  ruleKey: string
  sourceLabel: string
  sampler: Sampler
  isRefilling: boolean
  refillFailed: boolean
}

export interface RoamingStatus {
  active: boolean
  ruleKey: string | null
  sourceLabel: string
  /** 完整窗口（当前歌下标 = playIndex） */
  queue: LX.Music.MusicInfo[]
  /** 已播段（窗口内，最多 RECENT_MAX 条，供面板置灰区） */
  playedRecent: LX.Music.MusicInfo[]
  playIndex: number
}

let session: RoamingSession | null = null
let window_: LX.Music.MusicInfo[] = []
/** 窗口内歌曲指纹集：本地/在线同一首歌视为同一首，防止重复入窗 */
const windowFingerprints = new Set<string>()

/** 按指纹去重（保留首次出现） */
const dedupeByFingerprint = (list: LX.Music.MusicInfo[]): LX.Music.MusicInfo[] => {
  const seen = new Set<string>()
  const out: LX.Music.MusicInfo[] = []
  for (const musicInfo of list) {
    const fingerprint = getMusicFingerprint(musicInfo)
    if (seen.has(fingerprint)) continue
    seen.add(fingerprint)
    out.push(musicInfo)
  }
  return out
}

/** 窗口结构变化后重算指纹集（窗口仅 20 余首，成本可忽略） */
const syncWindowFingerprints = () => {
  windowFingerprints.clear()
  for (const musicInfo of window_) windowFingerprints.add(getMusicFingerprint(musicInfo))
}

const listeners = new Set<(status: RoamingStatus) => void>()

export const subscribe = (listener: (status: RoamingStatus) => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

const notify = () => {
  const status = getStatus()
  for (const listener of listeners) listener(status)
}

const getWindowPlayIndex = () => {
  return playerState.playMusicInfo.listId == LIST_IDS.ROAMING ? playerState.playInfo.playerPlayIndex : -1
}

export const getStatus = (): RoamingStatus => {
  const playIndex = getWindowPlayIndex()
  return {
    active: !!session,
    ruleKey: session?.ruleKey ?? null,
    sourceLabel: session?.sourceLabel ?? '',
    queue: window_,
    playedRecent: playIndex < 0 ? [] : window_.slice(Math.max(0, playIndex - RECENT_MAX), playIndex),
    playIndex,
  }
}

const backfill = async(count: number) => {
  if (!session || session.refillFailed) return
  if (session.isRefilling) return
  // 捕获当前会话：续杯是异步的，期间可能已经 stop()/重新 start()，
  // 那种情况下这批歌属于上一次会话，必须整批丢弃，否则会写进新窗口
  const current = session
  const isStale = () => session !== current
  session.isRefilling = true
  try {
    let list: LX.Music.MusicInfo[] = []
    for (let attempt = 0; attempt < 2 && list.length < count; attempt++) {
      const sampled = await current.sampler.refill(count - list.length)
      if (isStale()) return
      if (!sampled.length) break
      // 指纹判重：窗口已有的、本批内重复的都不再入窗（本地/在线同曲不同 id 视为同一首）
      const batchFingerprints = new Set<string>()
      for (const musicInfo of sampled) {
        const fingerprint = getMusicFingerprint(musicInfo)
        if (batchFingerprints.has(fingerprint) || windowFingerprints.has(fingerprint)) continue
        batchFingerprints.add(fingerprint)
        list.push(musicInfo)
      }
    }
    if (isStale()) return
    if (list.length) {
      arrPush(window_, list)
      syncWindowFingerprints()
      notify()
    } else if (!current.refillFailed) {
      current.refillFailed = true
      toast(global.i18n.t('roaming_refill_failed'))
    }
  } finally {
    current.isRefilling = false
  }
}

const trimIfNeeded = () => {
  const playIndex = getWindowPlayIndex()
  if (playIndex <= TRIM_THRESHOLD) return
  if (window_.length <= TRIM_AMOUNT + 1) return
  window_.splice(0, TRIM_AMOUNT)
  syncWindowFingerprints()
  // 按当前歌 id 在窗口内重算下标，避免手工减 N 的边界 bug
  updatePlayIndex()
}

/**
 * 剔除窗口内「不该播」的歌：不可播放（源已穷尽，标记见 core/player/invalidMusic）
 * + 命中屏蔽规则（不喜欢 / 屏蔽歌手 / 歌名关键词）。
 *
 * 只做内存剔除：漫游窗口本就是一次性的虚拟列表，不碰用户数据、不写库。
 * 当前播放歌不剔除（ADR 0003 不变式：当前歌永远在窗口内），
 * 它会在下一次切歌触发本函数时被清掉——那时它已经退到播放位之前。
 */
const isExcludedMusic = (musicInfo: LX.Music.MusicInfo) => isMusicInvalid(musicInfo) || hasDislike(musicInfo)

const dropExcludedMusic = () => {
  const playIndex = getWindowPlayIndex()
  if (playIndex < 0) return
  let removed = 0
  for (let i = window_.length; i--;) {
    if (i == playIndex || !isExcludedMusic(window_[i])) continue
    window_.splice(i, 1)
    removed++
  }
  if (!removed) return
  syncWindowFingerprints()
  // 剔除发生在当前歌之前时下标会漂移，按当前歌 id 重算（与修剪同一处理方式）
  updatePlayIndex()
  void backfill(removed)
  notify()
}

const handleMusicToggled = () => {
  if (!session) return
  const playMusicInfo = playerState.playMusicInfo
  if (!playMusicInfo.musicInfo || playMusicInfo.isTempPlay) return
  // 用户切到其他普通列表播放：漫游让位，清理窗口（ADR 0003 §5 生命周期 b）
  if (playMusicInfo.listId != LIST_IDS.ROAMING) {
    stop()
    return
  }
  lru.add(getMusicFingerprint(playMusicInfo.musicInfo as LX.Music.MusicInfo))
  dropExcludedMusic()
  trimIfNeeded()
  const playIndex = getWindowPlayIndex()
  if (playIndex >= 0 && window_.length - playIndex - 1 < REFILL_THRESHOLD) void backfill(REFILL_AMOUNT)
  notify()
}
global.app_event.on('musicToggled', handleMusicToggled)

/**
 * 开始一次漫游：清旧窗口 → 抽样注入 → 起播
 * @returns false = 本地没有可播的歌（空态）
 */
export const start = async(ruleKey: string, sourceLabel: string, sampler: Sampler): Promise<boolean> => {
  stop()
  await lru.loadLru()
  const list = dedupeByFingerprint(await sampler.refill(WINDOW_SIZE))
  if (!list.length) return false
  window_ = list
  syncWindowFingerprints()
  setMusicList(LIST_IDS.ROAMING, list)
  session = { ruleKey, sourceLabel, sampler, isRefilling: false, refillFailed: false }
  await playList(LIST_IDS.ROAMING, 0)
  notify()
  return true
}

/**
 * 结束漫游：移除虚拟列表、停止续杯；当前歌自然播完（ADR 0003 §5 生命周期 a）
 */
export const stop = () => {
  if (!session) return
  session = null
  window_ = []
  windowFingerprints.clear()
  removeMusicList(LIST_IDS.ROAMING)
  notify()
}

/**
 * 队列面板"不想听"：剔除窗口内一首并自动补位；不能剔除当前播放歌
 */
export const removeAt = (index: number): boolean => {
  if (!session) return false
  const playIndex = getWindowPlayIndex()
  if (index == playIndex || index < 0 || index >= window_.length) return false
  window_.splice(index, 1)
  syncWindowFingerprints()
  updatePlayIndex()
  void backfill(1)
  notify()
  return true
}

/**
 * 换一批：同规则重新抽样起播
 */
export const refresh = async(): Promise<boolean> => {
  if (!session) return false
  const { ruleKey, sourceLabel, sampler } = session
  return start(ruleKey, sourceLabel, sampler)
}
