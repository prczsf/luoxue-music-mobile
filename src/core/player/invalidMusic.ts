/**
 * 运行时"不可播放"歌曲标记
 *
 * 一首歌换遍所有音源后仍拿不到播放地址时，只把它记进这个内存集合，由播放过滤逻辑跳过。
 * **绝不从用户列表里删歌**：播放列表就是用户数据，删除会立即写库且不可撤销。
 * 详见 docs/adr/0006-unplayable-music-handling.md
 *
 * 生命周期：仅本次运行有效，App 重启即清空；歌曲再次成功取到地址时自动解除标记。
 */
const invalidMusicIds = new Set<string>()

type Music = LX.Music.MusicInfo | LX.Download.ListItem

const getMusicId = (musicInfo: Music) => 'progress' in musicInfo ? musicInfo.metadata.musicInfo.id : musicInfo.id

/** 标记歌曲不可播放（所有音源都已尝试且失败） */
export const markMusicInvalid = (musicInfo: Music) => {
  invalidMusicIds.add(getMusicId(musicInfo))
}

/** 解除标记（重新取到可用地址时） */
export const unmarkMusicInvalid = (musicInfo: Music) => {
  invalidMusicIds.delete(getMusicId(musicInfo))
}

export const isMusicInvalid = (musicInfo: Music | null) => {
  if (!musicInfo) return false
  return invalidMusicIds.has(getMusicId(musicInfo))
}
