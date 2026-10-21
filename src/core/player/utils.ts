import { clearPlayedList } from './playedList'
import { isMusicInvalid } from './invalidMusic'
import { hasDislikeFor } from '@/utils/dislikeMatch'
import { state } from '@/store/dislikeList'

/**
 * 过滤列表中已播放的歌曲
 */
export const filterMusicList = ({ playedList, listId, list, playerMusicInfo, dislikeInfo, isNext }: {
  /**
   * 已播放列表
   */
  playedList: LX.Player.PlayMusicInfo[] | readonly LX.Player.PlayMusicInfo[]
  /**
   * 列表id
   */
  listId: string
  /**
   * 播放列表
   */
  list: Array<LX.Music.MusicInfo | LX.Download.ListItem>
  /**
   * 下载目录
   */
  // savePath: string
  /**
   * 播放器内当前歌曲（`playInfo.playerPlayIndex`指向的歌曲）
   */
  playerMusicInfo?: LX.Music.MusicInfo | LX.Download.ListItem

  /**
   * 不喜欢的歌曲名字列表
   */
  dislikeInfo: Omit<LX.Dislike.DislikeInfo, 'rules'>

  isNext: boolean
}) => {
  let playerIndex = -1

  let canPlayList: Array<LX.Music.MusicInfo | LX.Download.ListItem> = []
  const filteredPlayedList = playedList.filter(pmInfo => pmInfo.listId == listId && !pmInfo.isTempPlay).map(({ musicInfo }) => musicInfo)
  let isExcluded = false
  const filteredList: Array<LX.Music.MusicInfo | LX.Download.ListItem> = list.filter(s => {
    // if (!assertApiSupport(s.source)) return false
    if ('progress' in s) {
      if (!s.isComplate) return false
    } else if (hasDislikeFor(dislikeInfo, s) || isMusicInvalid(s)) {
      // "不喜欢"与"不可播放"（源已穷尽）同样只在播放时过滤，不删用户列表；
      // 当前播放歌保留在列表内以便下标计算，随后由下面的分支把它从候选里剔除
      if (s.id != playerMusicInfo?.id) return false
      isExcluded = true
    }

    canPlayList.push(s)

    let index = filteredPlayedList.findIndex(m => m.id == s.id)
    if (index > -1) {
      filteredPlayedList.splice(index, 1)
      return false
    }
    return true
  })
  if (playerMusicInfo) {
    if (isExcluded) {
      if (filteredList.length <= 1) {
        filteredList.splice(0, 1)
        if (canPlayList.length > 1) {
          let currentMusicIndex = canPlayList.findIndex(m => m.id == playerMusicInfo.id)
          if (isNext) {
            playerIndex = currentMusicIndex - 1
            if (playerIndex < 0 && canPlayList.length > 1) playerIndex = canPlayList.length - 2
          } else {
            playerIndex = currentMusicIndex
            if (canPlayList.length <= 1) playerIndex = -1
          }
          canPlayList.splice(currentMusicIndex, 1)
        } else canPlayList.splice(0, 1)
      } else {
        let currentMusicIndex = filteredList.findIndex(m => m.id == playerMusicInfo.id)
        if (isNext) {
          playerIndex = currentMusicIndex - 1
          if (playerIndex < 0 && filteredList.length > 1) playerIndex = filteredList.length - 2
        } else {
          playerIndex = currentMusicIndex
          if (filteredList.length <= 1) playerIndex = -1
        }
        filteredList.splice(currentMusicIndex, 1)
      }
    } else {
      playerIndex = (filteredList.length ? filteredList : canPlayList).findIndex(m => m.id == playerMusicInfo.id)
    }
  }
  return {
    filteredList,
    canPlayList,
    playerIndex,
  }
}

/**
 * 过滤列表中已播放的歌曲
 */
export const filterList = async({ playedList, listId, list, playerMusicInfo, isNext }: {
  playedList: LX.Player.PlayMusicInfo[] | readonly LX.Player.PlayMusicInfo[]
  listId: string
  list: Array<LX.Music.MusicInfo | LX.Download.ListItem>
  playerMusicInfo?: LX.Music.MusicInfo | LX.Download.ListItem
  isNext: boolean
}) => {
  // if (this.list.listName === null) return
  // console.log(isCheckFile)
  let { filteredList, canPlayList, playerIndex } = filterMusicList({
    listId,
    list,
    playedList,
    // savePath: global.lx.setting['download.savePath'],
    playerMusicInfo,
    dislikeInfo: state.dislikeInfo,
    isNext,
  })

  if (!filteredList.length && playedList.length) {
    clearPlayedList()
    return { filteredList: canPlayList, playerIndex }
  }
  return { filteredList, playerIndex }
}

