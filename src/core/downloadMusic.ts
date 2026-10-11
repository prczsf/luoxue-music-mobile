import settingState from '@/store/setting/state'
import { getPlayQuality } from '@/core/music/utils'
import { toast } from '@/utils/tools'
import { copyFile, downloadFile, temporaryDirectoryPath, unlink } from '@/utils/fs'
import { getMusicUrl } from '@/core/music'
import { filterFileName } from '@/utils/common'
import { log } from '@/utils/log'

const inFlightIds = new Set<string>()

export const isDownloadingMusic = (id: string): boolean => {
  return inFlightIds.has(id)
}

/**
 * 下载单曲文件核心逻辑
 * @param musicInfo 歌曲信息
 * @param dirPath 目标保存目录
 * @param qualityOverride 指定音质，若未指定则使用配置中的 download.quality
 */
export const downloadMusicFile = async(
  musicInfo: LX.Music.MusicInfoOnline | LX.Music.MusicInfo,
  dirPath: string,
  qualityOverride?: LX.Quality,
) => {
  if (musicInfo.source == 'local') return
  if (inFlightIds.has(musicInfo.id)) {
    toast(global.i18n.t('list_downloading_tip'), 'short')
    return
  }


  inFlightIds.add(musicInfo.id)

  const requested = qualityOverride ?? settingState.setting['download.quality'] ?? '128k'
  const effective = getPlayQuality(requested, musicInfo as LX.Music.MusicInfoOnline)
  if (effective != requested) {
    toast(global.i18n.t('list_download_quality_fallback', { want: requested, got: effective }), 'long')
  }
  toast(global.i18n.t('list_download_start'))
  const tempPath = `${temporaryDirectoryPath}/lx_dl_tmp_${Date.now()}`
  try {
    const url = await getMusicUrl({ musicInfo: musicInfo as LX.Music.MusicInfoOnline, quality: effective, isRefresh: false })
    if (!url) throw new Error('url is empty')
    const urlPath = url.split(/[?#]/)[0]
    let ext = urlPath.substring(urlPath.lastIndexOf('.') + 1)
    if (!ext || ext.length > 5 || /[^a-zA-Z0-9]/.test(ext)) ext = 'mp3'
    const baseName = filterFileName(`${musicInfo.singer} - ${musicInfo.name}`) || musicInfo.id
    const fileName = effective == '128k' ? baseName : `${baseName} [${effective}]`
    const result = await downloadFile(url, tempPath).promise
    if (result.statusCode != 200) throw new Error(`statusCode: ${result.statusCode}`)
    await copyFile(tempPath, `${dirPath}/${fileName}.${ext}`)
    toast(global.i18n.t('list_download_success'))
  } catch (error) {
    log.error('download music failed', error)
    toast(global.i18n.t('list_download_failed', { msg: (error as Error).message }))
  } finally {
    inFlightIds.delete(musicInfo.id)
    void unlink(tempPath).catch(() => {})
  }
}
