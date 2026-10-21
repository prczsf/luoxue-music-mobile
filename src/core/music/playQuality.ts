/**
 * 音质候选计算
 *
 * 只依赖入参、不读全局状态，方便单独验证；调用方负责传入当前音源的能力表
 * （global.lx.qualityList）。
 */

/** 音质尝试阶梯（由高到低），128k 永远作为最后兜底 */
const QUALITYS_LADDER: LX.Quality[] = ['flac24bit', 'flac', '320k', '128k']

/**
 * 判断音源能否提供指定音质
 * 返回 null 表示该音源没有声明音质（未知），此时不能据此否定该音质
 */
const getApiQualitySupport = (source: LX.Source, quality: LX.Quality, qualityList: LX.QualityList): boolean | null => {
  const list = qualityList[source]
  if (!list?.length) return null
  return list.includes(quality)
}

/**
 * 计算该歌曲在当前音源下值得尝试的音质，按优先顺序排列
 *
 * 旧实现把「未知」当成「不支持」：音源没有声明音质时一律退到 128k，
 * 而调用方又要求歌曲自身必须声明该音质才肯尝试，两处判定不一致，
 * 会让本来能播的歌被判成「没有可播音质」。这里统一成一份候选阶梯：
 * - 音源明确不支持的音质直接排除
 * - 音源未声明时只保留歌曲自身声明有的音质，避免盲试
 * - 全部被排除时退回用户设定值，保证不会比旧实现更差
 */
export const getTryQualitys = (highQuality: LX.Quality, musicInfo: LX.Music.MusicInfoOnline, qualityList: LX.QualityList): LX.Quality[] => {
  const start = QUALITYS_LADDER.indexOf(highQuality)
  const candidates = start == -1 ? QUALITYS_LADDER.slice(-1) : QUALITYS_LADDER.slice(start)
  const qualitys = candidates.filter(quality => {
    const supported = getApiQualitySupport(musicInfo.source, quality, qualityList)
    if (supported == null) return musicInfo.meta._qualitys[quality] != null
    return supported
  })

  return qualitys.length ? qualitys : [highQuality]
}
