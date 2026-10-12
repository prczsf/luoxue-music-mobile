import settingState from '@/store/setting/state'
import { getPlayQuality } from '@/core/music/utils'
import { toast } from '@/utils/tools'
import { copyFile, downloadFile, temporaryDirectoryPath, unlink } from '@/utils/fs'
import { getMusicUrl } from '@/core/music'
import { filterFileName } from '@/utils/common'
import { log } from '@/utils/log'
export { getDownloadDir } from '@/core/downloadPath'

const inFlightIds = new Set<string>()

export const isDownloadingMusic = (id: string): boolean => {
  return inFlightIds.has(id)
}


/**
 * 带有自动换源与智能音质降级的 URL 获取流程
 */
const fetchDownloadUrl = async(
  onlineMusic: LX.Music.MusicInfoOnline,
  quality: LX.Quality,
): Promise<{ url: string, quality: LX.Quality, isDowngraded: boolean }> => {
  const candidates = [
    onlineMusic.meta?.toggleMusicInfo,
    onlineMusic,
  ].filter(Boolean) as LX.Music.MusicInfoOnline[]

  // 1. 尝试使用指定音质（允许自动换源）
  for (const target of candidates) {
    try {
      const url = await getMusicUrl({
        musicInfo: target,
        quality,
        isRefresh: false,
        allowToggleSource: true,
      })
      if (url) return { url, quality, isDowngraded: false }
    } catch {}
  }

  // 2. 若目标高音质获取失败，自动降级至 128k 重新触发跨源搜索
  if (quality != '128k') {
    for (const target of candidates) {
      try {
        const url = await getMusicUrl({
          musicInfo: target,
          quality: '128k',
          isRefresh: true,
          allowToggleSource: true,
        })
        if (url) return { url, quality: '128k', isDowngraded: true }
      } catch {}
    }
  }

  throw new Error('All sources failed')
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
    toast(`${global.i18n.t('list_downloading_tip')}: ${musicInfo.name}`, 'short')
    return
  }

  inFlightIds.add(musicInfo.id)

  const requested = qualityOverride ?? settingState.setting['download.quality'] ?? '128k'
  const effective = getPlayQuality(requested, musicInfo as LX.Music.MusicInfoOnline)
  if (effective != requested) {
    toast(global.i18n.t('list_download_quality_fallback', { want: requested, got: effective }), 'short')
  }
  toast(`${global.i18n.t('list_download_start')}: ${musicInfo.name}`, 'short')
  const tempPath = `${temporaryDirectoryPath}/lx_dl_tmp_${Date.now()}`

  try {
    const { url, quality: actualQuality, isDowngraded } = await fetchDownloadUrl(
      musicInfo as LX.Music.MusicInfoOnline,
      effective,
    )
    if (!url) throw new Error('url is empty')

    if (isDowngraded) {
      toast(global.i18n.t('list_download_quality_fallback', { want: effective, got: actualQuality }), 'short')
    }

    let ext = 'mp3'
    if (actualQuality == 'flac' || actualQuality == 'flac24bit') {
      ext = 'flac'
    } else {
      const urlPath = url.split(/[?#]/)[0]
      const rawExt = urlPath.substring(urlPath.lastIndexOf('.') + 1).toLowerCase()
      if (rawExt && rawExt.length <= 5 && /^[a-z0-9]+$/.test(rawExt)) {
        ext = rawExt
      }
    }

    const baseName = filterFileName(`${musicInfo.singer} - ${musicInfo.name}`) || musicInfo.id
    const fileName = actualQuality == '128k' ? baseName : `${baseName} [${actualQuality}]`
    const targetFilePath = `${dirPath}/${fileName}.${ext}`

    const result = await downloadFile(url, tempPath).promise
    if (result.statusCode != 200) throw new Error(`statusCode: ${result.statusCode}`)

    // 写入前移除可能存在的同名旧文件，消除 EEXIST 冲突
    await unlink(targetFilePath).catch(() => {})
    await copyFile(tempPath, targetFilePath)

    toast(`${global.i18n.t('list_download_success')}: ${musicInfo.name}`, 'long')
  } catch (error) {
    log.error('download music failed', error)
    toast(`${global.i18n.t('list_download_failed', { msg: (error as Error).message })}: ${musicInfo.name}`, 'long')
  } finally {
    inFlightIds.delete(musicInfo.id)
    void unlink(tempPath).catch(() => {})
  }
}
