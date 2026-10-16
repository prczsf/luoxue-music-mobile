import { getDownloadDir } from '@/core/downloadPath'
import { checkStoragePermissions, confirmDialog, requestStoragePermission, toast } from '@/utils/tools'
import { log } from '@/utils/log'
import type { Message } from '@/lang'
import { MAX_BATCH_COUNT, addTasks, createTask, getExistingBaseNames, hasTask } from './queue'
import { getMusicBaseName } from './task'

const t = (key: keyof Message, params?: Record<string, string | number>) => global.i18n.t(key, params)

/**
 * 批量下载：确认后按当前设置入队
 * - 单次上限 {@link MAX_BATCH_COUNT}，超出部分截断并提示
 * - 跳过已有任务、以及目标目录已存在同名基础文件的歌曲（见 ADR 0004）
 */
export const startBatchDownload = async(
  musics: LX.Music.MusicInfo[],
  quality?: LX.Quality,
): Promise<void> => {
  const onlineList = musics.filter(music => music.source != 'local')
  if (!onlineList.length) return

  const granted = await checkStoragePermissions() || await requestStoragePermission()
  if (!granted) {
    toast(t('storage_permission_tip_disagree'), 'long')
    return
  }

  const dir = await getDownloadDir()
  const existingNames = await getExistingBaseNames(dir).catch(error => {
    log.error('read download dir failed', error)
    return new Set<string>()
  })

  const limited = onlineList.length > MAX_BATCH_COUNT
  const targetList = onlineList.slice(0, MAX_BATCH_COUNT)
  const seenIds = new Set<string>()
  const pending: LX.Music.MusicInfoOnline[] = []
  let skipped = 0
  for (const music of targetList) {
    if (seenIds.has(music.id) || hasTask(music.id) || existingNames.has(getMusicBaseName(music))) {
      skipped++
      continue
    }
    seenIds.add(music.id)
    pending.push(music)
  }

  if (!pending.length) {
    toast(t('list_download_all_done', { num: 0, skipped }), 'long')
    return
  }

  const confirm = await confirmDialog({
    message: t('list_download_all_confirm', { num: pending.length }),
    confirmButtonText: t('confirm_button_text'),
    cancelButtonText: t('list_import_part_button_cancel'),
  })
  if (!confirm) return

  const added = addTasks(pending.map(music => createTask(music, dir, quality)))
  toast(t('list_download_all_done', { num: added, skipped }), 'long')
  if (limited) toast(t('list_download_all_limit', { num: MAX_BATCH_COUNT }), 'long')
}
