import BackgroundTimer from 'react-native-background-timer'

/**
 * 统一的播放失败自动切歌延迟计时器
 *
 * 播放链路（player.ts）与播放器事件链路（playerEvent.ts）共用同一个计时器实例与代际号：
 * 任意一方取消或手动切歌时，旧代际回调即便已在队列边缘也直接丢弃，避免“按一下跳两首”。
 */
let delayNextTimeout: number | null = null
let delayNextGeneration = 0

export const cancelDelayNext = () => {
  delayNextGeneration++
  if (!delayNextTimeout) return
  BackgroundTimer.clearTimeout(delayNextTimeout)
  delayNextTimeout = null
}

export const scheduleDelayNext = (callback: () => void, delay = 2000) => {
  cancelDelayNext()
  const generation = delayNextGeneration
  delayNextTimeout = BackgroundTimer.setTimeout(() => {
    delayNextTimeout = null
    if (generation != delayNextGeneration) return
    callback()
  }, delay)
}
