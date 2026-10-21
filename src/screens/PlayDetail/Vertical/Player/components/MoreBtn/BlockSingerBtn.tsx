import playerState from '@/store/player/state'
import { handleBlockSinger } from '@/core/blockSinger'
import Btn from './Btn'

/** 屏蔽当前歌手（内部走「不喜欢」规则，不动歌单） */
export default () => {
  const handlePress = () => {
    let musicInfo = playerState.playMusicInfo.musicInfo
    if (!musicInfo) return
    if ('progress' in musicInfo) musicInfo = musicInfo.metadata.musicInfo
    void handleBlockSinger(musicInfo)
  }

  return <Btn icon="minus-box" onPress={handlePress} />
}
