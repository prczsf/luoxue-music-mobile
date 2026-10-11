import settingState from '@/store/setting/state'
import { existsFile, externalStorageDirectoryPath, mkdir } from '@/utils/fs'

export const DEFAULT_DOWNLOAD_DIR_NAME = 'Download/lx-music'

export const getDefaultDownloadPath = () => `${externalStorageDirectoryPath}/${DEFAULT_DOWNLOAD_DIR_NAME}`

/**
 * 获取当前生效的下载目录：
 * - 用户在设置中指定目录则使用用户目录
 * - 否则使用默认目录 SDCard/Download/lx-music（首次使用时自动创建）
 */
export const getDownloadDir = async() => {
  const savePath = settingState.setting['download.savePath']?.trim()
  const dir = savePath || getDefaultDownloadPath()
  try {
    await ensureDir(dir)
  } catch {}
  return dir
}

const ensureDir = async(dir: string) => {
  if (await existsFile(dir)) return
  const parent = dir.substring(0, dir.lastIndexOf('/'))
  if (parent && parent != dir) await ensureDir(parent)
  try {
    await mkdir(dir)
  } catch {
    if (!(await existsFile(dir))) throw new Error(`mkdir failed: ${dir}`)
  }
}
