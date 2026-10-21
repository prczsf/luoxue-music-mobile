import Event from '@/event/Event'
import settingState from '@/store/setting/state'
import { getDownloadDir } from '@/core/downloadPath'
import { getDownloadTasks, saveDownloadTasks } from '@/utils/data'
import { throttle } from '@/utils/common'
import { checkStoragePermissions, toast } from '@/utils/tools'
import { existsFile, readDir, stopDownload, temporaryDirectoryPath, unlink } from '@/utils/fs'
import { log } from '@/utils/log'
import { DownloadCancelledError, runDownloadTask } from './task'

const MIN_CONCURRENCY = 1
const MAX_CONCURRENCY = 6
/** 批量下载单次上限 */
export const MAX_BATCH_COUNT = 200
const AUDIO_EXTS = ['mp3', 'flac', 'm4a', 'ogg', 'wav', 'ape']
/** 进度/持久化写盘节流间隔 */
const PERSIST_THROTTLE = 1000

interface InitState {
  tasks: LX.Download.ListItem[]
}
const state: InitState = {
  tasks: [],
}

/** 正在运行的任务：token 用于丢弃已取消任务的迟到回调 */
interface RunningTask {
  token: number
  jobIds: number[]
}
const running = new Map<string, RunningTask>()
let taskToken = 0

class DownloadTaskEvent extends Event {
  updated() {
    this.emit('updated')
  }

  progress() {
    this.emit('progress')
  }
}

type EventMethods = Omit<DownloadTaskEvent, keyof Event>

declare class EventType extends DownloadTaskEvent {
  on<K extends keyof EventMethods>(event: K, listener: EventMethods[K]): any
  off<K extends keyof EventMethods>(event: K, listener: EventMethods[K]): any
}

type DownloadTaskEventTypes = Omit<EventType, keyof Omit<Event, 'on' | 'off'>>

export const event: DownloadTaskEventTypes = new DownloadTaskEvent()

export const getTasks = () => state.tasks

export const getConcurrency = () => {
  const value = settingState.setting['download.concurrency'] ?? 3
  return Math.max(MIN_CONCURRENCY, Math.min(MAX_CONCURRENCY, value))
}

/** 该歌曲是否已有等待中/下载中的任务 */
export const hasTask = (id: string) => {
  return state.tasks.some(task => task.id == id && (task.status == 'waiting' || task.status == 'run'))
}

const waitingText = () => global.i18n.t('download_task_status_waiting')

const persistTasks = throttle(() => {
  // 已完成的任务不持久化（见 ADR 0005）
  const list = state.tasks.filter(task => task.status != 'completed')
  void saveDownloadTasks(list).catch(error => { log.error('save download tasks failed', error) })
}, PERSIST_THROTTLE)

export const createTask = (
  musicInfo: LX.Music.MusicInfoOnline,
  dirPath: string,
  qualityOverride?: LX.Quality,
): LX.Download.ListItem => {
  const quality = qualityOverride ?? settingState.setting['download.quality'] ?? '128k'
  return {
    id: musicInfo.id,
    isComplate: false,
    status: 'waiting',
    statusText: waitingText(),
    downloaded: 0,
    total: 0,
    progress: 0,
    speed: '',
    metadata: {
      musicInfo,
      url: null,
      quality,
      ext: 'mp3',
      fileName: '',
      filePath: '',
      dirPath,
      requestedQuality: quality,
    },
  }
}

/** 移出列表中同名歌曲的已完成/失败旧记录，避免同一首歌出现多条 */
const dropFinishedTask = (id: string) => {
  for (let i = state.tasks.length - 1; i >= 0; i--) {
    const task = state.tasks[i]
    if (task.id != id) continue
    if (task.status == 'waiting' || task.status == 'run') return false
    state.tasks.splice(i, 1)
  }
  return true
}

export const addTasks = (tasks: LX.Download.ListItem[]) => {
  const added: LX.Download.ListItem[] = []
  for (const task of tasks) {
    if (hasTask(task.id)) continue
    if (!dropFinishedTask(task.id)) continue
    state.tasks.push(task)
    added.push(task)
  }
  if (!added.length) return 0
  event.updated()
  persistTasks()
  startPending()
  return added.length
}

export const addTask = (task: LX.Download.ListItem) => addTasks([task])

/** 取消任务：等待中的直接移除，运行中的同时停止下载 */
export const cancelTask = (id: string) => {
  const index = state.tasks.findIndex(task => task.id == id)
  if (index < 0) return
  const job = running.get(id)
  if (job) {
    // 先失效 token，迟到回调不再改任务状态
    running.delete(id)
    job.jobIds.forEach(jobId => { stopDownload(jobId) })
  }
  state.tasks.splice(index, 1)
  event.updated()
  persistTasks()
  startPending()
}

export const cancelAll = () => {
  for (const task of [...state.tasks]) cancelTask(task.id)
}

export const clearCompleted = () => {
  let changed = false
  for (let i = state.tasks.length - 1; i >= 0; i--) {
    if (state.tasks[i].status != 'completed') continue
    state.tasks.splice(i, 1)
    changed = true
  }
  if (!changed) return
  event.updated()
  persistTasks()
}

/** 重试失败任务：丢弃旧进度与 URL，按当前设置重新协商并从头下载 */
export const retryTask = (id: string) => {
  const task = state.tasks.find(item => item.id == id)
  if (!task) return
  if (task.status == 'waiting' || task.status == 'run') return
  task.status = 'waiting'
  task.statusText = waitingText()
  task.downloaded = 0
  task.total = 0
  task.progress = 0
  task.speed = ''
  task.metadata.url = null
  // 目录可能已被用户改动，重试时重新读取当前设置目录
  task.metadata.dirPath = undefined
  event.updated()
  persistTasks()
  startPending()
}

/** 扫描目录中已存在的同名音频基础名，用于批量下载跳过判定 */
export const getExistingBaseNames = async(dirPath: string): Promise<Set<string>> => {
  const names = new Set<string>()
  const files = await readDir(dirPath).catch(() => [])
  for (const file of files) {
    if (file.isDirectory) continue
    const dotIndex = file.name.lastIndexOf('.')
    if (dotIndex <= 0) continue
    const ext = file.name.substring(dotIndex + 1).toLowerCase()
    if (!AUDIO_EXTS.includes(ext)) continue
    names.add(file.name.substring(0, dotIndex))
  }
  return names
}

const startTask = (task: LX.Download.ListItem) => {
  const token = ++taskToken
  const job: RunningTask = { token, jobIds: [] }
  running.set(task.id, job)

  task.status = 'run'
  task.statusText = global.i18n.t('download_task_status_running')
  task.downloaded = 0
  task.total = 0
  task.progress = 0
  task.speed = ''
  event.updated()

  const isAlive = () => running.get(task.id)?.token == token

  void runDownloadTask(task, {
    onProgress: (info) => {
      if (!isAlive()) return
      task.downloaded = info.downloaded
      task.total = info.total
      task.progress = info.progress
      task.speed = info.speed
      event.progress()
    },
    onJobCreated: (jobId) => { job.jobIds.push(jobId) },
    isCancelled: () => !isAlive(),
  }).then(() => {
    if (!isAlive()) return
    running.delete(task.id)
    task.status = 'completed'
    task.isComplate = true
    task.progress = 100
    task.speed = ''
    task.statusText = global.i18n.t('list_download_success')
    event.updated()
    persistTasks()

    // 下载完成：从数据层统一通知文件列表视图重新扫描（此前该事件只声明未广播）
    global.app_event.downloadListUpdate()
    toast(`${global.i18n.t('list_download_success')}: ${task.metadata.musicInfo.name}`, 'long')
    startPending()
  }).catch((error: unknown) => {
    if (!isAlive()) return
    running.delete(task.id)
    if (error instanceof DownloadCancelledError) {
      startPending()
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    task.status = 'error'
    task.statusText = message
    task.speed = ''
    event.updated()
    persistTasks()
    toast(`${global.i18n.t('list_download_failed', { msg: message })}: ${task.metadata.musicInfo.name}`, 'long')
    startPending()
  })
}

/** 按当前并发上限调度等待中的任务 */
const startPending = () => {
  const limit = getConcurrency()
  while (running.size < limit) {
    const task = state.tasks.find(item => item.status == 'waiting' && !running.has(item.id))
    if (!task) break
    startTask(task)
  }
}

const checkStorageAvailable = async() => {
  try {
    const hasPermission = await checkStoragePermissions()
    if (!hasPermission) return false
    const dirPath = await getDownloadDir()
    return await existsFile(dirPath)
  } catch (error) {
    log.error('check download dir failed', error)
    return false
  }
}

/** 清理上次运行残留的临时文件 */
const clearTempFiles = async() => {
  try {
    const files = await readDir(temporaryDirectoryPath)
    const temps = files.filter(file => file.name.startsWith('lx_dl_'))
    await Promise.all(temps.map(async(file) => { await unlink(file.path).catch(() => {}) }))
  } catch (error) {
    log.error('clear download temp files failed', error)
  }
}

let restorePromise: Promise<void> | null = null

/**
 * 启动时恢复未完成的任务：run → waiting，丢弃 URL 与进度，从头重新下载
 * - 恢复前置检查（权限 + 目录可写）不通过时整批置 error，等用户处理后重试
 */
export const restoreTasks = async() => {
  restorePromise ??= (async() => {
    await clearTempFiles()
    let list: LX.Download.ListItem[]
    try {
      list = await getDownloadTasks()
    } catch (error) {
      log.error('read download tasks failed', error)
      return
    }
    const restored = list.filter(task =>
      task.status == 'waiting' || task.status == 'run' || task.status == 'error')
    if (!restored.length) return

    for (const task of restored) {
      task.status = 'waiting'
      task.statusText = waitingText()
      task.downloaded = 0
      task.total = 0
      task.progress = 0
      task.speed = ''
      task.metadata.url = null
      task.metadata.dirPath = undefined
      if (!hasTask(task.id)) state.tasks.push(task)
    }
    event.updated()

    if (!await checkStorageAvailable()) {
      const message = global.i18n.t('download_task_dir_unavailable')
      for (const task of state.tasks) {
        task.status = 'error'
        task.statusText = message
      }
      event.updated()
      persistTasks()
      toast(message, 'short')
      return
    }

    persistTasks()
    startPending()
  })()
  return restorePromise
}
