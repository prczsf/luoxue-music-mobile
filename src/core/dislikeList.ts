import { action } from '@/store/dislikeList'


export const addDislikeInfo = async(infos: LX.Dislike.DislikeMusicInfo[]) => {
  await global.dislike_event.dislike_music_add(infos)
}

/**
 * 屏蔽歌手：追加 `@歌手` 规则（走「包含」匹配，合唱曲一并屏蔽）。
 * 复用 dislike_music_add 事件，因此与「不喜欢」共享持久化与跨端同步。
 */
export const addDislikeSinger = async(singers: string[]) => {
  await global.dislike_event.dislike_music_add(singers.map(singer => ({ name: '', singer })))
}

export const overwirteDislikeInfo = async(rules: string) => {
  await global.dislike_event.dislike_data_overwrite(rules)
}

export const clearDislikeInfo = async() => {
  await global.dislike_event.dislike_music_clear()
}


export const hasDislike = (info: LX.Music.MusicInfo | LX.Download.ListItem | null) => {
  if (!info) return false
  return action.hasDislike(info)
}


export const setDislikeInfo = (info: LX.Dislike.DislikeInfo) => {
  action.setDislikeInfo(info)
}

export { getDislikeInfo } from '@/utils/dislikeManage'
