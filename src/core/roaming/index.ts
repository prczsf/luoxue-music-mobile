import { createLibrarySampler, createArtistSampler } from './samplers/library'
import * as conveyor from './conveyor'

/**
 * 随心漫游对外门面（ADR 0003）
 * UI 只依赖本文件：startXxx 起播、stop 结束、subscribe/getStatus 订阅状态
 * sourceLabel 存 plain 展示名（"全部歌曲" / 歌手名 / "一起听"），
 * "漫游 · " 前缀由展示层用 roaming_source_label 拼接
 */

export { subscribe, getStatus, stop, refresh, removeAt } from './conveyor'
export type { RoamingStatus } from './conveyor'
export { useRoamingStatus } from './useRoamingStatus'
export { getExcludeLists, setExcludeLists, getRoamingIndex, invalidateIndex } from './libraryIndex'
export type { RoamingIndex, SongCoord } from './libraryIndex'
export { getMusicByCoord } from './libraryIndex'

/** 全库漫游：一击播全部歌曲 */
export const startLibrary = async(): Promise<boolean> => {
  const sampler = await createLibrarySampler()
  return conveyor.start('library', global.i18n.t('roaming_hero_library'), sampler)
}

/** 歌手漫游：单个或多个歌手一起播 */
export const startArtists = async(names: string[]): Promise<boolean> => {
  if (!names.length) return false
  const sampler = await createArtistSampler(names)
  const label = names.length > 1 ? global.i18n.t('roaming_listen_together') : names[0]
  return conveyor.start(`artist:${names.join(',')}`, label, sampler)
}
