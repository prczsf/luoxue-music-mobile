import { state } from './state'
import { event } from './event'
import { hasDislikeFor } from '@/utils/dislikeMatch'


export const hasDislike = (info: LX.Music.MusicInfo | LX.Download.ListItem) => {
  if ('progress' in info) info = info.metadata.musicInfo
  return hasDislikeFor(state.dislikeInfo, info)
}

export const setDislikeInfo = (dislikeInfo: LX.Dislike.DislikeInfo) => {
  state.dislikeInfo.rules = dislikeInfo.rules
  state.dislikeInfo.rawRules = dislikeInfo.rawRules
  state.dislikeInfo.names = dislikeInfo.names
  state.dislikeInfo.musicNames = dislikeInfo.musicNames
  state.dislikeInfo.singerNames = dislikeInfo.singerNames
  state.dislikeInfo.singerKeywords = dislikeInfo.singerKeywords
  state.dislikeInfo.nameKeywords = dislikeInfo.nameKeywords
  event.dislike_changed()
}
