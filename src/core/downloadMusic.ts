import { addTask, createTask, hasTask } from '@/core/download'
import { toast } from '@/utils/tools'
export { getDownloadDir } from '@/core/downloadPath'

/**
 * 该歌曲是否已在下载队列中（等待中或下载中）
 */
export const isDownloadingMusic = (id: string): boolean => hasTask(id)

/**
 * 下载单曲：校验后入队，由下载队列按并发上限调度执行
 * 签名保持兼容，调用点无需改动；音质覆盖参数用于本次下载
 */
export const downloadMusicFile = async(
  musicInfo: LX.Music.MusicInfoOnline | LX.Music.MusicInfo,
  dirPath: string,
  qualityOverride?: LX.Quality,
) => {
  if (musicInfo.source == 'local') return
  if (hasTask(musicInfo.id)) {
    toast(`${global.i18n.t('list_downloading_tip')}: ${musicInfo.name}`, 'short')
    return
  }

  toast(`${global.i18n.t('list_download_start')}: ${musicInfo.name}`, 'short')
  addTask(createTask(musicInfo as LX.Music.MusicInfoOnline, dirPath, qualityOverride))
}
