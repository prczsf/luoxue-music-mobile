import { storageDataPrefix } from '@/config/constant'
import { getData, saveData } from '@/plugins/storage'

/**
 * 防复读窗口：最近播放的歌曲指纹 FIFO 记录
 * 软约束：抽干时按缩窗兜底放行，永不阻塞播放
 */

const LRU_CAPACITY = 300
const POOL_SMALL_LIMIT = 500
const SHRINK_RATIO = 0.6
const SAVE_DEBOUNCE = 5000

let fingerprints: string[] = []
let fingerprintSet = new Set<string>()
let loaded = false
let poolSize = 0
let saveTimer: ReturnType<typeof setTimeout> | null = null

const persist = () => {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    void saveData(storageDataPrefix.roamingLru, fingerprints)
  }, SAVE_DEBOUNCE)
}

export const loadLru = async() => {
  if (loaded) return
  loaded = true
  const saved = await getData<string[]>(storageDataPrefix.roamingLru)
  if (saved?.length) {
    fingerprints = saved.slice(-LRU_CAPACITY)
    fingerprintSet = new Set(fingerprints)
  }
}

/** 当前规则的可用池大小（影响动态缩窗），由抽样器在采样前设置 */
export const setPoolSize = (size: number) => {
  poolSize = size
}

/** 有效窗口容量：小曲库缩窗为池子的 60% */
const effectiveCapacity = () => {
  if (poolSize > 0 && poolSize < POOL_SMALL_LIMIT) return Math.max(10, Math.floor(poolSize * SHRINK_RATIO))
  return LRU_CAPACITY
}

/** 指纹是否命中最近播放（命中则应重抽） */
export const has = (fingerprint: string): boolean => fingerprintSet.has(fingerprint)

/** 登记一首已播放歌曲 */
export const add = (fingerprint: string) => {
  if (fingerprintSet.has(fingerprint)) return
  fingerprints.push(fingerprint)
  fingerprintSet.add(fingerprint)
  const cap = effectiveCapacity()
  while (fingerprints.length > cap) {
    const removed = fingerprints.shift()
    if (removed) fingerprintSet.delete(removed)
  }
  persist()
}

/** 一次性登记（起播首歌等场景） */
export const addBatch = (list: string[]) => {
  for (const fp of list) add(fp)
}

export const clearLru = () => {
  fingerprints = []
  fingerprintSet = new Set()
  void saveData(storageDataPrefix.roamingLru, fingerprints)
}
