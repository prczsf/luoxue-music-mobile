import { requestMsg } from '@/utils/message'

/**
 * 取播放地址失败的错误分类
 *
 * 播放链路（player.ts）与预取链路（preloadNextMusic.ts）都需要判断"这次失败到底是临时故障，
 * 还是这首歌确实没有可播音源"，两处共用这里的判断，避免各写一份而漂移。
 */

/**
 * 临时故障：网络抖动 / 限流 / 请求取消 / 接口未初始化。
 * 这类失败只说明"这次没拿到"，不代表歌曲没有可播源，不能据此判歌曲不可播放。
 */
const transientUrlErrorMessages = new Set<string>([
  requestMsg.fail,
  requestMsg.unachievable,
  requestMsg.timeout,
  requestMsg.notConnectNetwork,
  requestMsg.cancelRequest,
  requestMsg.tooManyRequests,
])

const getErrorMessage = (err: unknown) => err instanceof Error ? err.message : ''

/** 错误信息为空时按临时故障处理（宁可重试，不要误判歌曲不可播放） */
export const isTransientUrlError = (err: unknown) => {
  const message = getErrorMessage(err)
  return !message || transientUrlErrorMessages.has(message) || message == 'source init failed'
}

/** 换遍所有音源仍然失败（getOnlineOtherSourceMusicUrl 抛出的固定错误） */
export const isSourceExhaustedError = (err: unknown) => getErrorMessage(err) == global.i18n.t('toggle_source_failed')
