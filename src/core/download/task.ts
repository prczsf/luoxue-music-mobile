import settingState from '@/store/setting/state'
import { getLyricInfo, getMusicUrl, getPicPath } from '@/core/music'
import { getPlayQuality } from '@/core/music/utils'
import { getDownloadDir } from '@/core/downloadPath'
import {
  copyFile,
  downloadFile,
  readFileSlice,
  scanFile,
  temporaryDirectoryPath,
  unlink,
  writeFile,
} from '@/utils/fs'
import { buildLyrics } from '@/utils/lrcTools'
import { filterFileName, sizeFormate } from '@/utils/common'
import { formatMusicName, toast } from '@/utils/tools'
import { compressImage } from '@/utils/imageCompress'
import { writeLyric, writeMetadata, writePic } from '@/utils/localMediaMetadata'
import { log } from '@/utils/log'

/** 封面 / 歌词等信息获取的超时时间，超时即放弃该项，不阻塞音频下载 */
const INFO_TIMEOUT = 5000
/** 进度上报间隔 */
const PROGRESS_INTERVAL = 500
/** 读取文件头用于识别容器的字节数 */
const HEADER_BYTES = 16
/** 直链失效（如服务端 410/403）时换链接重试的次数 */
const MAX_AUDIO_RETRY = 2
/** 两次下载尝试之间的间隔 */
const AUDIO_RETRY_DELAY = 1000

export interface RunTaskHandlers {
  onProgress?: (info: LX.Download.ProgressInfo) => void
  /** 音频下载任务创建后回调，调用方可据此停止下载（取消任务） */
  onJobCreated?: (jobId: number) => void
  isCancelled?: () => boolean
}

/** 任务被取消时抛出，由队列静默处理 */
export class DownloadCancelledError extends Error {
  constructor() {
    super('download cancelled')
  }
}

export const getMusicBaseName = (musicInfo: LX.Music.MusicInfo) => {
  return filterFileName(formatMusicName(settingState.setting['download.fileName'], musicInfo.name, musicInfo.singer)) ||
    musicInfo.id
}

const withTimeout = async<T>(promise: Promise<T>, timeout: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { reject(new Error(`timeout: ${timeout}ms`)) }, timeout)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const delay = async(ms: number): Promise<void> => {
  await new Promise((resolve) => { setTimeout(resolve, ms) })
}

const b64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
/** 把 base64 头部按字节解码，避免为识别容器引入 Buffer 依赖 */
const decodeBase64Header = (b64: string, byteLength: number): number[] => {
  const bytes: number[] = []
  let buffer = 0
  let bits = 0
  for (let i = 0; i < b64.length && bytes.length < byteLength; i++) {
    const value = b64Chars.indexOf(b64[i])
    if (value < 0) continue
    buffer = (buffer << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xFF)
    }
  }
  return bytes
}

const ascii = (bytes: number[], start: number, length: number) =>
  String.fromCharCode(...bytes.slice(start, start + length))

const extFromUrl = (url: string): LX.Download.FileExt | null => {
  const urlPath = url.split(/[?#]/)[0]
  const rawExt = urlPath.substring(urlPath.lastIndexOf('.') + 1).toLowerCase()
  switch (rawExt) {
    case 'mp3':
    case 'flac':
    case 'ogg':
    case 'wav':
    case 'ape':
      return rawExt
    case 'm4a':
    case 'mp4':
      return 'm4a'
    default:
      return null
  }
}

/**
 * 以文件头魔术字识别真实容器，识别不出时回退 URL 后缀
 * 音源标称音质与服务端实际文件不一致时，避免按错误后缀落盘
 */
const detectExt = async(filePath: string, url: string): Promise<LX.Download.FileExt> => {
  try {
    const bytes = decodeBase64Header(await readFileSlice(filePath, HEADER_BYTES, 0), HEADER_BYTES)
    if (bytes.length >= HEADER_BYTES) {
      if (ascii(bytes, 0, 3) == 'ID3') return 'mp3'
      if (bytes[0] == 0xFF && (bytes[1] == 0xFB || bytes[1] == 0xF3 || bytes[1] == 0xF2)) return 'mp3'
      if (ascii(bytes, 0, 4) == 'fLaC') return 'flac'
      if (ascii(bytes, 0, 4) == 'OggS') return 'ogg'
      if (ascii(bytes, 0, 4) == 'RIFF' && ascii(bytes, 8, 4) == 'WAVE') return 'wav'
      if (ascii(bytes, 0, 4) == 'MAC ') return 'ape'
      if (ascii(bytes, 4, 4) == 'ftyp') return 'm4a'
    }
  } catch (error) {
    log.error('detect audio container failed', error)
  }
  return extFromUrl(url) ?? 'mp3'
}

const buildCandidates = (musicInfo: LX.Music.MusicInfoOnline) => {
  return [musicInfo.meta.toggleMusicInfo, musicInfo].filter(Boolean) as LX.Music.MusicInfoOnline[]
}

interface NegotiateResult {
  url: string
  quality: LX.Quality
  /** 是否发生了音质降级 */
  isQualityFallback: boolean
  /** 是否切换到了其它音源 */
  isSourceToggled: boolean
}

/** 音质协商选项 */
interface NegotiateOptions {
  /** 是否忽略缓存、重新获取链接 */
  isRefresh?: boolean
  /** 已尝试并失效的链接，跳过以免重复拿到同一条死链 */
  skipUrls?: Set<string>
}

/**
 * 音质协商：阶梯降级 + 跨源兜底
 * - autoToggleSource 关闭时不做任何降级与换源，直接用请求音质取链接
 * - `skipUrls` 中的链接视为已失效，跳过后再取下一候选
 */
const negotiateUrl = async(
  musicInfo: LX.Music.MusicInfoOnline,
  requested: LX.Quality,
  autoToggleSource: boolean,
  options: NegotiateOptions = {},
): Promise<NegotiateResult> => {
  const candidates = autoToggleSource ? buildCandidates(musicInfo) : [musicInfo]
  const effective = autoToggleSource ? getPlayQuality(requested, musicInfo) : requested
  const isRefresh = options.isRefresh ?? false
  let isSourceToggled = false
  const onToggleSource = () => { isSourceToggled = true }

  const tryFetch = async(target: LX.Music.MusicInfoOnline, quality: LX.Quality, refresh: boolean) => {
    try {
      const url = await getMusicUrl({
        musicInfo: target,
        quality,
        isRefresh: refresh,
        onToggleSource,
        allowToggleSource: autoToggleSource,
      })
      if (url && !options.skipUrls?.has(url)) {
        return {
          url,
          quality,
          isQualityFallback: quality != requested,
          isSourceToggled: isSourceToggled || target != musicInfo,
        }
      }
    } catch (error) {
      log.error('fetch download url failed', target.source, quality, error)
    }
    return null
  }

  for (const target of candidates) {
    const result = await tryFetch(target, effective, isRefresh)
    if (result) return result
  }

  // 目标音质全部失败时降级到 128k 再试一轮
  if (autoToggleSource && effective != '128k') {
    for (const target of candidates) {
      const result = await tryFetch(target, '128k', true)
      if (result) return result
    }
  }

  throw new Error('all sources failed')
}

/** 下载并压缩封面，失败返回 null */
const prepareCover = async(musicInfo: LX.Music.MusicInfoOnline): Promise<string | null> => {
  const token = `${Date.now()}_${musicInfo.id}`
  const rawPath = `${temporaryDirectoryPath}/lx_dl_pic_raw_${token}`
  const coverPath = `${temporaryDirectoryPath}/lx_dl_pic_${token}.jpg`
  try {
    const url = await withTimeout(getPicPath({ musicInfo }), INFO_TIMEOUT)
    if (!url) return null
    const result = await withTimeout(downloadFile(url, rawPath).promise, INFO_TIMEOUT)
    if (result.statusCode != 200) throw new Error(`cover statusCode: ${result.statusCode}`)
    const compressed = await compressImage(rawPath, coverPath)
    // 压缩模块在「原图已经足够小」时会直接返回原图路径，而原图在函数结束时会被删除，
    // 这里统一落到固定封面路径上，避免调用方拿到已失效的路径
    if (compressed.path != coverPath) await copyFile(rawPath, coverPath)
    return coverPath
  } catch (error) {
    log.error('prepare cover failed', error)
    return null
  } finally {
    void unlink(rawPath).catch(() => {})
  }
}

/** 按设置合成歌词文本，失败返回 null */
const prepareLyric = async(musicInfo: LX.Music.MusicInfoOnline): Promise<string | null> => {
  try {
    const setting = settingState.setting
    const lrcInfo = await withTimeout(getLyricInfo({ musicInfo }), INFO_TIMEOUT)
    if (!lrcInfo?.lyric) return null
    return buildLyrics(
      lrcInfo,
      setting['download.embedAwlrc'],
      setting['download.embedTlrc'],
      setting['download.embedRlrc'],
    ) || null
  } catch (error) {
    log.error('prepare lyric failed', error)
    return null
  }
}

/**
 * 执行单个下载任务的完整流水线：协商音质 → 三路并发准备 → 打标签 → 落盘 → 伴生文件
 * 音频本身写入失败时抛出异常（任务置为 error），标签/封面/歌词/伴生文件失败只记日志
 */
export const runDownloadTask = async(
  task: LX.Download.ListItem,
  handlers: RunTaskHandlers = {},
): Promise<void> => {
  const setting = settingState.setting
  const musicInfo = task.metadata.musicInfo
  const requested = task.metadata.requestedQuality ?? setting['download.quality'] ?? '128k'
  const autoToggleSource = setting['download.autoToggleSource']
  const embedPic = setting['download.embedPic']
  const embedLyric = setting['download.embedLyric']
  const saveLrcFile = setting['download.saveLrcFile']
  const savePicFile = setting['download.savePicFile']
  const needPic = embedPic || savePicFile
  const needLyric = embedLyric || saveLrcFile

  const dirPath = task.metadata.dirPath ?? await getDownloadDir()
  const tmpPath = `${temporaryDirectoryPath}/lx_dl_tmp_${Date.now()}_${musicInfo.id}`

  let taggedPath = ''
  let coverTempPath: string | null = null

  const throwIfCancelled = () => {
    if (handlers.isCancelled?.()) throw new DownloadCancelledError()
  }

  try {
    // 封面与歌词与音频并发准备：各自超时放弃，不影响音频
    const coverTask = needPic ? prepareCover(musicInfo) : Promise.resolve(null)
    const lyricTask = needLyric ? prepareLyric(musicInfo) : Promise.resolve(null)

    let lastBytes = 0
    let lastTime = Date.now()
    let lastStatus = 0
    let finalUrl = ''
    const triedUrls = new Set<string>()

    // 直链可能已过期（服务端返回 410/403 等）：换一条链接重试，都不行才判定该任务失败
    for (let attempt = 0; attempt <= MAX_AUDIO_RETRY; attempt++) {
      let negotiated: NegotiateResult
      try {
        negotiated = await negotiateUrl(musicInfo, requested, autoToggleSource, {
          isRefresh: attempt > 0,
          skipUrls: triedUrls,
        })
      } catch (error) {
        log.error('negotiate download url failed', musicInfo.source, requested, error)
        if (attempt == 0) throw error
        break
      }
      throwIfCancelled()
      task.metadata.url = negotiated.url
      task.metadata.quality = negotiated.quality
      finalUrl = negotiated.url
      triedUrls.add(negotiated.url)

      // 降级 / 换源提示只在第一次协商时报一次
      if (attempt == 0) {
        if (negotiated.isQualityFallback) {
          toast(global.i18n.t('list_download_quality_fallback', {
            want: requested,
            got: negotiated.quality,
          }), 'short')
        } else if (negotiated.isSourceToggled) {
          toast(global.i18n.t('list_download_source_toggled', {
            want: requested,
            got: negotiated.quality,
          }), 'short')
        }
      }

      lastBytes = 0
      lastTime = Date.now()
      await unlink(tmpPath).catch(() => {})
      const download = downloadFile(negotiated.url, tmpPath, {
        progressInterval: PROGRESS_INTERVAL,
        progress: ({ bytesWritten, contentLength }) => {
          const now = Date.now()
          const elapsed = Math.max(1, now - lastTime)
          const bytesPerSecond = Math.max(1, (bytesWritten - lastBytes) * 1000 / elapsed)
          lastBytes = bytesWritten
          lastTime = now
          handlers.onProgress?.({
            progress: contentLength ? Math.floor(bytesWritten / contentLength * 100) : 0,
            speed: `${sizeFormate(bytesPerSecond)}/s`,
            downloaded: bytesWritten,
            total: contentLength,
          })
        },
      })
      handlers.onJobCreated?.(download.jobId)

      const result = await download.promise
      throwIfCancelled()
      lastStatus = result.statusCode
      if (result.statusCode == 200) break
      log.error('download audio failed', musicInfo.source, musicInfo.id, negotiated.quality, `statusCode: ${result.statusCode}`)
      if (attempt < MAX_AUDIO_RETRY) await delay(AUDIO_RETRY_DELAY)
    }
    if (lastStatus != 200) {
      // 403/404/410/416 一般是直链已失效，换链接重试后仍未成功
      const isLinkExpired = lastStatus == 403 || lastStatus == 404 || lastStatus == 410 || lastStatus == 416
      throw new Error(isLinkExpired
        ? global.i18n.t('list_download_link_expired', { code: lastStatus })
        : `statusCode: ${lastStatus}`)
    }

    const [coverPath, lyricText] = await Promise.all([coverTask, lyricTask])
    coverTempPath = coverPath
    throwIfCancelled()

    const ext = await detectExt(tmpPath, finalUrl)
    const baseName = getMusicBaseName(musicInfo)
    const fileName = `${baseName}.${ext}`
    const filePath = `${dirPath}/${fileName}`
    task.metadata.ext = ext
    task.metadata.fileName = fileName
    task.metadata.filePath = filePath

    // 打标签需要正确的扩展名：jaudiotagger 按扩展名选择解析器，无后缀的临时文件会读取失败
    taggedPath = `${tmpPath}.${ext}`
    await copyFile(tmpPath, taggedPath)

    // 对临时文件写标签，失败只记录并合并成一条提示
    const failedAttaches: string[] = []
    const attach = async(label: string, handler: () => Promise<void>) => {
      try {
        await handler()
      } catch (error) {
        log.error(`attach ${label} failed`, error)
        failedAttaches.push(label)
      }
    }
    await attach(global.i18n.t('setting_download_embed_group'), async() => {
      await writeMetadata(taggedPath, {
        name: musicInfo.name,
        singer: musicInfo.singer,
        albumName: musicInfo.meta.albumName ?? '',
      })
    })
    if (embedPic && coverPath) {
      await attach(global.i18n.t('setting_download_embed_pic'), async() => {
        await writePic(taggedPath, coverPath)
      })
    }
    if (embedLyric && lyricText) {
      await attach(global.i18n.t('setting_download_embed_lyric'), async() => {
        await writeLyric(taggedPath, lyricText)
      })
    }
    // 回读校验：ID3v2 头应出现在文件开头，否则说明标签实际没有写进去
    if (!failedAttaches.length && ext == 'mp3') {
      const header = await readFileSlice(taggedPath, 3, 0).catch(() => '')
      if (header != 'SUQz') {
        log.error('attach verify failed: id3 header not found', musicInfo.source, musicInfo.id, ext)
        failedAttaches.push(global.i18n.t('setting_download_embed_group'))
      }
    }
    if (failedAttaches.length) {
      toast(global.i18n.t('download_task_attach_failed', { what: failedAttaches.join(' / ') }), 'short')
    }

    // 落盘：同名旧文件静默覆盖
    await unlink(filePath).catch(() => {})
    await copyFile(taggedPath, filePath)
    await unlink(tmpPath).catch(() => {})
    await scanFile(filePath).catch(() => {})

    // 伴生文件失败只记日志
    if (saveLrcFile && lyricText) {
      try {
        await writeFile(`${dirPath}/${baseName}.lrc`, lyricText.replace(/\r\n/g, '\n'), 'utf8')
      } catch (error) {
        log.error('write sidecar lyric failed', error)
      }
    }
    if (savePicFile && coverPath) {
      try {
        await copyFile(coverPath, `${dirPath}/${baseName}.jpg`)
      } catch (error) {
        log.error('write sidecar cover failed', error)
      }
    }
  } finally {
    void unlink(tmpPath).catch(() => {})
    if (taggedPath) void unlink(taggedPath).catch(() => {})
    if (coverTempPath) void unlink(coverTempPath).catch(() => {})
  }
}
