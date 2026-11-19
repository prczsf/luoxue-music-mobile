import { playNext, setMusicUrl } from '@/core/player/player'
import { cancelDelayNext, scheduleDelayNext } from '@/core/player/delayNext'
import { markMusicInvalid } from '@/core/player/invalidMusic'
import { recordPlayFailure } from '@/core/player/playFailureStats'
import { setStatusText } from '@/core/player/playStatus'
import { getPosition, isEmpty, setStop } from '@/plugins/player'
import { clearMusicUrlByMusic } from '@/utils/data'
import { isActive } from '@/utils/tools'
import BackgroundTimer from 'react-native-background-timer'
import playerState from '@/store/player/state'
import { setNowPlayTime } from '@/core/player/progress'


export default () => {
  let retryNum = 0
  let prevTimeoutId: string | null = null

  let loadingTimeout: number | null = null

  /**
   * 起播超时：音频流握手超过这个时间基本可判死链或严重丢包（移动端正常 1~3s 内起播）。
   * 旧值 25s 会让一次失效地址白等半分钟，叠加二次超时能拖过 50s（ADR 0009 不变式④）
   */
  const LOADING_TIMEOUT = 8000
  /** 播放失败后切下一首前的等待：只为让"失败"状态可见，不再是 5s 的长停顿 */
  const DELAY_NEXT_TIMEOUT = 2000
  const startLoadingTimeout = () => {
    // console.log('start load timeout')
    clearLoadingTimeout()
    loadingTimeout = BackgroundTimer.setTimeout(() => {
      loadingTimeout = null
      if (global.lx.isPlayedStop) return

      // 如果加载超时，首次尝试刷新URL；二次仍超时则标记不可播放并切下一首
      const currentId = playerState.musicInfo.id
      const musicInfo = playerState.playMusicInfo.musicInfo
      if (!currentId || !musicInfo) return
      if (prevTimeoutId == currentId) {
        prevTimeoutId = null
        markMusicInvalid(musicInfo)
        void recordPlayFailure(musicInfo, 'load timeout')
        if ('source' in musicInfo) void clearMusicUrlByMusic(musicInfo)
        void playNext(true)
      } else {
        prevTimeoutId = currentId
        setMusicUrl(musicInfo, true)
      }
    }, LOADING_TIMEOUT)
  }
  const clearLoadingTimeout = () => {
    if (!loadingTimeout) return
    // console.log('clear load timeout')
    BackgroundTimer.clearTimeout(loadingTimeout)
    loadingTimeout = null
  }

  const addDelayNextTimeout = () => {
    scheduleDelayNext(() => {
      if (global.lx.isPlayedStop) {
        setStatusText('')
        return
      }
      void playNext(true)
    }, DELAY_NEXT_TIMEOUT)
  }

  const handleLoadstart = () => {
    console.log('handleLoadstart', playerState.isPlay)
    if (global.lx.isPlayedStop || !playerState.musicInfo.id || isEmpty()) return
    startLoadingTimeout()
    setStatusText(global.i18n.t('player__loading'))
  }

  // const handleLoadeddata = () => {
  //   setStatusText(global.i18n.t('player__loading'))
  // }

  // const handleCanplay = () => {
  //   setStatusText('')
  // }

  const handlePlaying = () => {
    setStatusText('')
    clearLoadingTimeout()
  }

  const handleEmpied = () => {
    cancelDelayNext()
    clearLoadingTimeout()
  }

  const handleWating = () => {
    setStatusText(global.i18n.t('player__buffering'))
  }

  const handleError = () => {
    if (!playerState.musicInfo.id) return
    clearLoadingTimeout()
    if (global.lx.isPlayedStop) return
    // URL 无效时只刷新一次：刷新本身就是重跑整条取址链，刷两次只会把失败路径再拉长一倍（ADR 0009 不变式④）
    const musicInfo = playerState.playMusicInfo.musicInfo
    if (musicInfo && retryNum < 1) {
      void getPosition().then((position) => {
        if (position) setNowPlayTime(position)
      }).finally(() => {
        // console.log(this.retryNum)
        if (playerState.playMusicInfo.musicInfo !== musicInfo) return
        retryNum++
        setMusicUrl(musicInfo, true)
        setStatusText(global.i18n.t('player__refresh_url'))
      })
      return
    }
    if (musicInfo) {
      markMusicInvalid(musicInfo)
      void recordPlayFailure(musicInfo, 'playback error')
      if ('source' in musicInfo) void clearMusicUrlByMusic(musicInfo)
    }
    if (!isEmpty()) void setStop()

    if (isActive()) {
      setStatusText(global.i18n.t('player__error'))
      addDelayNextTimeout()
    } else {
      console.warn('error skip to next')
      void playNext(true)
    }
  }

  const handleSetPlayInfo = () => {
    retryNum = 0
    prevTimeoutId = null
    cancelDelayNext()
    clearLoadingTimeout()
  }

  // const handlePlayedStop = () => {
  //   clearDelayNextTimeout()
  //   clearLoadingTimeout()
  // }


  global.app_event.on('playerLoadstart', handleLoadstart)
  // global.app_event.on('playerLoadeddata', handleLoadeddata)
  // global.app_event.on('playerCanplay', handleCanplay)
  global.app_event.on('playerPlaying', handlePlaying)
  global.app_event.on('playerWaiting', handleWating)
  global.app_event.on('playerEmptied', handleEmpied)
  global.app_event.on('playerError', handleError)
  global.app_event.on('musicToggled', handleSetPlayInfo)
}
