import { SPLIT_CHAR } from '@/config/constant'

/**
 * 歌手 / 歌名关键词参与「包含」匹配所需的最短长度。
 * 单字规则会大面积误伤（`李` 会命中所有含「李」的歌手），因此降级为全等匹配。
 */
export const MIN_KEYWORD_LEN = 2

/**
 * 歌名关键词规则前缀：`~live` 表示「歌名包含 live」。
 * 只存在于存储文本里，界面不暴露（见 docs/blocklist-and-autoplay-plan.md §5.4）。
 */
export const DISLIKE_KEYWORD_PREFIX = '~'

export interface DislikeMatchInfo {
  /** 歌名 + 歌手 全等（`歌名@歌手`） */
  names: Set<string>
  /** 歌名 全等 */
  musicNames: Set<string>
  /** 歌手 全等 */
  singerNames: Set<string>
  /** 歌手 包含（`@歌手`，长度 >= MIN_KEYWORD_LEN） */
  singerKeywords: string[]
  /** 歌名 包含（`~关键词`，长度 >= MIN_KEYWORD_LEN） */
  nameKeywords: string[]
}

/**
 * 规则文本归一化：`@` 是分隔符，名字里真的含有 `@` 时存成 `#`（历史约定），
 * 匹配前必须做同样的替换，否则带 `@` 的名字永远匹配不上。
 */
export const normalizeDislikeText = (text?: string) => {
  return (text ?? '').replaceAll(SPLIT_CHAR.DISLIKE_NAME, SPLIT_CHAR.DISLIKE_NAME_ALIAS).toLocaleLowerCase().trim()
}

/**
 * 判断一首歌是否命中「不想听的内容」规则。
 *
 * 匹配分三类，任意一类命中即过滤：
 * 1. 全等：歌名 / 歌手 / 歌名+歌手（原有「不喜欢」行为，一个字节都没变）
 * 2. 歌手包含：`@周杰伦` 命中 `周杰伦 / 费玉清`（合唱曲）
 * 3. 歌名包含：`~live` 命中 `告白气球 (Live)`
 *
 * 只在播放路径调用，不修改任何用户列表数据（ADR 0006）。
 */
export const hasDislikeFor = (info: DislikeMatchInfo, music: { name?: string, singer?: string }) => {
  const name = normalizeDislikeText(music.name)
  const singer = normalizeDislikeText(music.singer)

  if (name && info.musicNames.has(name)) return true
  if (singer && info.singerNames.has(singer)) return true
  if (name && info.names.has(`${name}${SPLIT_CHAR.DISLIKE_NAME}${singer}`)) return true
  if (singer && info.singerKeywords.some(keyword => singer.includes(keyword))) return true
  if (name && info.nameKeywords.some(keyword => name.includes(keyword))) return true

  return false
}
