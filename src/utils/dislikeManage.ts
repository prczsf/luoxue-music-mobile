import { SPLIT_CHAR } from '@/config/constant'
import { MIN_KEYWORD_LEN, DISLIKE_KEYWORD_PREFIX, normalizeDislikeText } from './dislikeMatch'
import { getDislikeListRules } from './data'

const dislikeInfo: LX.Dislike.DislikeInfo = {
  names: new Set(),
  musicNames: new Set(),
  singerNames: new Set(),
  singerKeywords: [],
  nameKeywords: [],
  rules: '',
}

export const getDislikeInfo = async() => {
  updateDislikeInfo(await getDislikeListRules())
  return dislikeInfo
}

/**
 * 解析规则文本。支持三种写法：
 * - `歌名@歌手` / `歌名` / `@歌手`：全等匹配（原有行为，未改动）
 * - `@歌手`：当歌手名长度 >= 2 时改为「包含」匹配（合唱曲 `周杰伦 / 费玉清` 也会命中）
 * - `~关键词`：歌名「包含」匹配（`live` 命中 `告白气球 (Live)`），长度 >= 2 生效
 *
 * 过短的规则自动降级为全等，避免 `@李` 命中半个曲库。
 */
const updateDislikeInfo = (rules: string) => {
  dislikeInfo.names.clear()
  dislikeInfo.musicNames.clear()
  dislikeInfo.singerNames.clear()
  dislikeInfo.singerKeywords = []
  dislikeInfo.nameKeywords = []
  const list: string[] = []
  for (const item of rules.split('\n')) {
    const line = item.trim()
    if (!line) continue

    if (line.startsWith(DISLIKE_KEYWORD_PREFIX)) {
      const keyword = normalizeDislikeText(line.slice(DISLIKE_KEYWORD_PREFIX.length))
      if (!keyword) continue
      if (keyword.length >= MIN_KEYWORD_LEN) {
        if (!dislikeInfo.nameKeywords.includes(keyword)) dislikeInfo.nameKeywords.push(keyword)
        list.push(`${DISLIKE_KEYWORD_PREFIX}${keyword}`)
      } else {
        // 过短：降级为歌名全等
        dislikeInfo.musicNames.add(keyword)
        list.push(keyword)
      }
      continue
    }

    let [name, singer] = line.split(SPLIT_CHAR.DISLIKE_NAME)
    if (name) {
      name = normalizeDislikeText(name)
      if (singer) {
        singer = normalizeDislikeText(singer)
        const rule = `${name}${SPLIT_CHAR.DISLIKE_NAME}${singer}`
        dislikeInfo.names.add(rule)
        list.push(rule)
      } else {
        dislikeInfo.musicNames.add(name)
        list.push(name)
      }
    } else if (singer) {
      singer = normalizeDislikeText(singer)
      if (singer.length >= MIN_KEYWORD_LEN) {
        if (!dislikeInfo.singerKeywords.includes(singer)) dislikeInfo.singerKeywords.push(singer)
      } else {
        dislikeInfo.singerNames.add(singer)
      }
      list.push(`${SPLIT_CHAR.DISLIKE_NAME}${singer}`)
    }
  }
  dislikeInfo.rules = Array.from(new Set(list)).join('\n')
}

export const addDislikeInfo = async(infos: LX.Dislike.DislikeMusicInfo[]) => {
  updateDislikeInfo(dislikeInfo.rules + '\n' + infos.map(info => `${info.name ?? ''}${SPLIT_CHAR.DISLIKE_NAME}${info.singer ?? ''}`).join('\n'))
  return dislikeInfo
}

export const overwirteDislikeInfo = async(rules: string) => {
  updateDislikeInfo(rules)
  return dislikeInfo
}

export const clearDislikeInfo = async() => {
  updateDislikeInfo('')
  return dislikeInfo
}

/** 追加一条规则（已存在则忽略），返回新的规则文本 */
export const appendDislikeRule = (rules: string, rule: string) => {
  const target = rule.trim()
  const list = rules.split('\n').map(s => s.trim()).filter(s => s.length > 0)
  if (!target || list.includes(target)) return list.join('\n')
  list.push(target)
  return list.join('\n')
}

/** 删除一条规则，返回新的规则文本 */
export const removeDislikeRule = (rules: string, rule: string) => {
  const target = rule.trim()
  return rules.split('\n').map(s => s.trim()).filter(s => s.length > 0 && s != target).join('\n')
}

/** 歌手规则文本：`@歌手`（长度 >= MIN_KEYWORD_LEN 时按包含匹配） */
export const buildSingerRule = (singer: string) => `${SPLIT_CHAR.DISLIKE_NAME}${normalizeDislikeText(singer)}`

/** 歌名关键词规则文本：`~关键词`（歌名包含即命中） */
export const buildNameKeywordRule = (keyword: string) => `${DISLIKE_KEYWORD_PREFIX}${normalizeDislikeText(keyword)}`
