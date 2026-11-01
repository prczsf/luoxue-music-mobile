import { getMusicUrl } from '@/core/music'
import { getNextPlayMusicInfo, resetRandomNextMusicInfo } from '@/core/player/player'
import { checkUrl } from '@/utils/request'
import { isCached } from '@/plugins/player/utils'
import BackgroundTimer from 'react-native-background-timer'

/**
 * 预取下一首的播放地址（只把它写进 URL 缓存，不预下载音频）
 *
 * 健壮性约定（预取失败绝不阻塞播放，播放链路本身还有自己的重试）：
 * - 拿不到可用地址会定时重试，最多 MAX_ATTEMPTS 次；切歌、切播放模式立即取消并复位
 * - 任一步抛错都只影响本次预取：状态在 finally 里复位，不会把预取永久锁死
 * - 切歌时可能还有上一首的请求在路上：用 session 代际判断丢弃过期结果，避免污染新状态
 * - 源确实穷尽时直接打"不可播放"标记，切歌时按不可播放跳过，省掉播放期的报错与 5 秒等待
 * - 临时故障（断网/限流/接口未初始化）只重试，绝不标记歌曲不可播放
 */
const MAX_ATTEMPTS = 3
const RETRY_DELAY = 3000

const preloadMusicInfo = {
  isLoading: false,
  /** 本首歌的预取是否已拿到可用地址 */
  isDone: false,
  /** 已尝试次数（含首次） */
  retryNum: 0,
  retryTimeout: null as number | null,
  /** 代际：每次复位自增，用于丢弃过期的在途请求结果 */
  session: 0,
  info: null as LX.Player.PlayMusicInfo | null,
}

const clearRetryTimeout = () => {
  if (!preloadMusicInfo.retryTimeout) return
  BackgroundTimer.clearTimeout(preloadMusicInfo.retryTimeout)
  preloadMusicInfo.retryTimeout = null
}

/** 复位本次预取（切歌、切换播放模式时调用） */
const resetPreloadInfo = () => {
  clearRetryTimeout()
  preloadMusicInfo.session++
  preloadMusicInfo.info = null
  preloadMusicInfo.isDone = false
  preloadMusicInfo.retryNum = 0
  preloadMusicInfo.isLoading = false
}

type Music = LX.Music.MusicInfo | LX.Download.ListItem

/**
 * 取一次可用地址；URL 拿得到但已失效时强制刷新一次。
 * @returns 可用地址，空字符串表示这次没拿到（可能是临时故障，也可能歌曲真的没有可播源）
 */
const fetchPlayableUrl = async(musicInfo: Music) => {
  const url = await getMusicUrl({ musicInfo })
  if (!url) return ''
  // 本地文件 / 已下载：getMusicUrl 能返回就说明文件在，HEAD 探测对 file 路径没有意义，省掉这次请求
  if ('progress' in musicInfo || musicInfo.source == 'local') return url
  const [cached, available] = await Promise.all([
    isCached(url).catch(() => false),
    checkUrl(url).then(() => true).catch(() => false),
  ])
  // 已在播放器缓存里，或地址可访问 → 预取成功
  if (cached || available) return url
  // 缓存地址已过期：强制刷新一次；刷新失败只当"这次没拿到"，不据此判定歌曲不可播放
  return getMusicUrl({ musicInfo, isRefresh: true }).catch(() => '')
}

const scheduleRetry = () => {
  if (preloadMusicInfo.retryNum >= MAX_ATTEMPTS) {
    console.log('preload next music url give up:', preloadMusicInfo.retryNum)
    return
  }
  clearRetryTimeout()
  preloadMusicInfo.retryTimeout = BackgroundTimer.setTimeout(() => {
    preloadMusicInfo.retryTimeout = null
    void preloadNextMusicUrl()
  }, RETRY_DELAY)
}

const preloadNextMusicUrl = async(): Promise<void> => {
  if (preloadMusicInfo.isLoading || preloadMusicInfo.isDone) return
  const session = preloadMusicInfo.session
  const isStale = () => session != preloadMusicInfo.session
  preloadMusicInfo.isLoading = true
  preloadMusicInfo.retryNum++
  let info = preloadMusicInfo.info
  try {
    if (!info) {
      info = await getNextPlayMusicInfo(true)
      if (isStale()) return
      preloadMusicInfo.info = info
      if (!info) return
    }
    console.log('preload next music url', info.musicInfo.id, preloadMusicInfo.retryNum)
    const url = await fetchPlayableUrl(info.musicInfo)
    if (isStale()) return
    if (!url) {
      scheduleRetry()
      return
    }
    console.log('preload url', url)
    preloadMusicInfo.isDone = true
    preloadMusicInfo.retryNum = 0
  } catch (err) {
    if (isStale()) return
    console.log('preload next music url error', err)
    // 预取是投机性的后台优化：即便"换遍所有音源都失败"，也可能只是当前网络不行。
    // 这里绝不给歌曲打"不可播放"标记——否则 filterMusicList 会把它剔除，
    // 它永远播不到，也就永远没有机会被 unmark，形成静默的永久误杀。
    // 判决权完全留给前台真实播放链路（见 core/player/player.ts 的 setMusicUrl）。
    scheduleRetry()
  } finally {
    if (!isStale()) preloadMusicInfo.isLoading = false
  }
}

export default () => {
  const handleSetPlayInfo = () => {
    resetPreloadInfo()
  }

  const handleConfigUpdated: typeof global.state_event.configUpdated = (keys) => {
    if (!keys.includes('player.togglePlayMethod')) return
    if (!preloadMusicInfo.info || preloadMusicInfo.info.isTempPlay) return
    // 播放模式变了，之前算出的"下一首"可能已经不对：全部重来
    resetRandomNextMusicInfo()
    resetPreloadInfo()
  }

  const handlePlayProgressChanged: typeof global.state_event.playProgressChanged = (progress) => {
    if (preloadMusicInfo.info) return // 本首歌已经选定预取目标，重试交给内部定时器
    const duration = progress.maxPlayTime
    if (duration > 10 && duration - progress.nowPlayTime < 10) void preloadNextMusicUrl()
  }

  global.app_event.on('musicToggled', handleSetPlayInfo)
  global.state_event.on('configUpdated', handleConfigUpdated)
  global.state_event.on('playProgressChanged', handlePlayProgressChanged)
}
