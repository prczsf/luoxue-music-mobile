/**
 * 播放地址（URL）缓存的纯逻辑。
 *
 * 之所以独立成模块，是因为这里有三个极易出错的点：新鲜期判断、音质阶梯回退、旧数据兼容。
 * 它们都不依赖 AsyncStorage，放在这里就能被单独断言（与 playQuality.ts 同一思路）。
 */

export interface MusicUrlCacheItem {
  url: string
  quality: LX.Quality
  /** 写入该地址的时间戳（ms）。旧版本缓存没有这个字段，读到时记为 0，即等同于已过期 */
  time: number
}

/**
 * URL 缓存的新鲜期。
 *
 * 音源返回的直链带防盗链签名，有效期通常只有几十分钟到几小时，而缓存本身没有任何续期手段，
 * 因此必须给"多久以内可以直接信任"一个明确上限：
 * - 新鲜期内：直接起播，不做任何网络探测（切歌零额外请求）
 * - 超过新鲜期：视为未命中，回到取址链路重新解析（多一次取址，换来确定性的最坏耗时）
 */
export const MUSIC_URL_FRESH_TIME = 10 * 60 * 1000

/** 兼容旧版本写入的纯字符串缓存：时间未知，一律按过期处理，下次取到地址时自动重写为新结构 */
export const toMusicUrlCacheItem = (value: unknown, quality: LX.Quality): MusicUrlCacheItem | null => {
  if (!value) return null
  if (typeof value == 'string') return { url: value, quality, time: 0 }
  if (typeof value != 'object') return null
  const item = value as Partial<MusicUrlCacheItem>
  if (typeof item.url != 'string' || !item.url) return null
  return {
    url: item.url,
    quality: item.quality ?? quality,
    time: typeof item.time == 'number' ? item.time : 0,
  }
}

/** 缓存项是否还在新鲜期内。time 为 0 表示写入时间未知，按过期处理 */
export const isFreshMusicUrl = (item: MusicUrlCacheItem, now: number, maxAge = MUSIC_URL_FRESH_TIME) => {
  if (!item.time) return false
  const age = now - item.time
  // 时钟回拨时 age 可能为负：保守按过期处理，避免把"未来的时间戳"当成永远新鲜
  return age >= 0 && age <= maxAge
}

/**
 * 按给定音质顺序挑第一个仍在新鲜期内的缓存。
 *
 * 顺序即优先级：首选音质没命中（或已过期）时允许用更低档位的地址起播。
 * 否则"降级后才拿到地址"的那次预取会在下次播放时彻底失效——缓存键是 id_音质，
 * 预取存的是降级档位、播放侧却按首选档位去查，等于越需要降级的歌、预取成果越用不上。
 */
export const pickFreshMusicUrl = ({ datas, qualitys, now = Date.now(), maxAge = MUSIC_URL_FRESH_TIME }: {
  /** 与 qualitys 一一对应的缓存原始值 */
  datas: readonly unknown[]
  qualitys: readonly LX.Quality[]
  now?: number
  maxAge?: number
}): MusicUrlCacheItem | null => {
  for (let i = 0; i < qualitys.length; i++) {
    const item = toMusicUrlCacheItem(datas[i], qualitys[i])
    if (!item) continue
    if (!isFreshMusicUrl(item, now, maxAge)) continue
    return item
  }
  return null
}
