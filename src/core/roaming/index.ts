import { createLibrarySampler, createArtistSampler } from './samplers/library'
import { createGenreSampler, GENRE_PRESETS, type GenrePreset } from './samplers/genre'
import * as conveyor from './conveyor'

export { GENRE_PRESETS }
export type { GenrePreset }

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

/** 风格盲盒：按预设风格从在线歌单取歌漫游；取不到歌返回 false（UI 回退全库） */
export const startGenre = async(genreId: string): Promise<boolean> => {
  const preset = GENRE_PRESETS.find(item => item.id == genreId)
  if (!preset) return false
  const sampler = await createGenreSampler(preset)
  return conveyor.start(`genre:${genreId}`, global.i18n.t(preset.nameKey), sampler)
}
