import { action, state } from '@/store/userApi'
import { addUserApi, clearUserApiScriptPending, getUserApiScript, restoreUserApiScript, saveUserApiScriptPending, updateUserApiInfo, updateUserApiScript, removeUserApi as removeUserApiFromStore, setUserApiAllowShowUpdateAlert as setUserApiAllowShowUpdateAlertFromStore } from '@/utils/data'
import { destroy, loadScript } from '@/utils/nativeModules/userApi'
import { log as writeLog } from '@/utils/log'
import { httpFetch } from '@/utils/request'
import settingState from '@/store/setting/state'

const SCRIPT_MAX_SIZE = 9_000_000
const API_INIT_TIMEOUT = 15_000


export const setUserApi = async(apiId: string) => {
  global.lx.qualityList = {}
  setUserApiStatus(false, 'initing')

  const target = state.list.find(api => api.id === apiId)
  if (!target) throw new Error('api not found')
  const script = await getUserApiScript(target.id)
  loadScript({ ...target, script })
}

export const destroyUserApi = () => {
  destroy()
}


export const setUserApiStatus: typeof action['setStatus'] = (status, message) => {
  action.setStatus(status, message)
}

export const setUserApiList: typeof action['setUserApiList'] = (list) => {
  action.setUserApiList(list)
}

export const importUserApi = async(script: string, meta?: {
  url?: string
  importType?: LX.UserApi.UserApiImportType
}) => {
  const info = await addUserApi(script, meta)
  action.addUserApi(info)
}

// 与 core/apiSource.ts 的 setApiSource 共用同一套 apiInitPromise 约定：
// 先置为 pending，再由 native 的 init 回调 resolve；超时视为失败，避免脚本异常时不回调导致卡死。
/**
 * 等待"当前没有初始化在途"。
 *
 * 不能直接 await `apiInitPromise[0]`：若上一次初始化因脚本异常没有回调，那个 promise 永不 resolve，
 * 后续的回滚会一起卡死。这里改成轮询 + 超时，超时则明确失败而不是挂起。
 */
const waitIdleInit = async(timeout = API_INIT_TIMEOUT): Promise<boolean> => {
  const end = Date.now() + timeout
  while (!global.lx.apiInitPromise[1]) {
    if (Date.now() > end) return false
    await new Promise<void>(resolve => { setTimeout(resolve, 100) })
  }
  return true
}

/**
 * 新建一份初始化 promise 并接管 resolve 回调。
 * 保留 async 是因为仓库的 `promise-function-async` 规则要求返回 Promise 的函数必须声明为 async；
 * 末尾直接返回（不 await）以避免多一次微任务调度。
 */
const createInitPromise = async(): Promise<boolean> => {
  global.lx.apiInitPromise[0] = new Promise<boolean>(resolve => {
    global.lx.apiInitPromise[1] = false
    global.lx.apiInitPromise[2] = (result: boolean) => {
      global.lx.apiInitPromise[1] = true
      resolve(result)
    }
  })
  return global.lx.apiInitPromise[0]
}

const waitInitResult = async(promise: Promise<boolean>): Promise<boolean> => {
  return await Promise.race([
    promise,
    new Promise<boolean>(resolve => {
      setTimeout(() => {
        // 超时也要释放 pending 标记，否则后续调用会一直以为还有初始化在途
        if (!global.lx.apiInitPromise[1]) global.lx.apiInitPromise[1] = true
        resolve(false)
      }, API_INIT_TIMEOUT)
    }),
  ])
}

/** 用指定的脚本文本加载源（不读存储），用于"提交前先试跑" */
const loadUserApiScript = async(id: string, script: string) => {
  const target = state.list.find(api => api.id === id)
  if (!target) throw new Error('api not found')
  global.lx.qualityList = {}
  setUserApiStatus(false, 'initing')
  loadScript({ ...target, script })
}

const reloadUserApi = async(id: string): Promise<boolean> => {
  if (!await waitIdleInit()) throw new Error(global.i18n.t('user_api_refresh_busy'))
  const initPromise = createInitPromise()
  await setUserApi(id).catch(() => {
    if (!global.lx.apiInitPromise[1]) global.lx.apiInitPromise[2](false)
  })
  return await waitInitResult(initPromise)
}

/**
 * 用待提交的脚本试跑一次。
 * 只有当前启用的源才会走到这里（非当前源没法在不切换的前提下试跑）。
 */
const verifyUserApiScript = async(id: string, script: string): Promise<boolean> => {
  if (!await waitIdleInit()) throw new Error(global.i18n.t('user_api_refresh_busy'))
  const initPromise = createInitPromise()
  await loadUserApiScript(id, script).catch(() => {
    if (!global.lx.apiInitPromise[1]) global.lx.apiInitPromise[2](false)
  })
  return await waitInitResult(initPromise)
}

const downloadUserApiScript = async(url: string) => {
  let script: string
  try {
    script = await httpFetch(url).promise.then(resp => resp.body) as string
  } catch (error: unknown) {
    throw new Error((error as Error)?.message ?? 'request failed')
  }
  if (typeof script != 'string' || !script.length) throw new Error(global.i18n.t('user_api_refresh_invalid_script'))
  if (!/^\/\*[\S|\s]+?\*\//.test(script)) throw new Error(global.i18n.t('user_api_refresh_invalid_script'))
  if (script.length > SCRIPT_MAX_SIZE) throw new Error(global.i18n.t('user_api_refresh_too_large'))
  return script
}

/**
 * 按已记录的源地址重新拉取脚本并覆盖当前源（不新增源、不占源数量上限）。
 *
 * 提交顺序（避免"新脚本写坏可用源"）：
 * 1. 下载 + 头部校验（失败则本地数据完全未变）
 * 2. 当前源：先写 `__pending` 键并用它试跑，初始化失败则丢弃 pending 并恢复原脚本
 * 3. 试跑通过后才覆盖正式脚本，同时留存上一版 `__prev`
 * 非当前源无法试跑，直接覆盖，靠 `__prev` 与「恢复上一版」兜底。
 */
export const refreshUserApi = async(id: string): Promise<{ info: LX.UserApi.UserApiInfo, applied: boolean }> => {
  const target = state.list.find(api => api.id === id)
  if (!target) throw new Error('api not found')
  if (!target.url) throw new Error(global.i18n.t('user_api_refresh_no_url'))

  const script = await downloadUserApiScript(target.url)
  const isActive = settingState.setting['common.apiSource'] == id

  if (isActive) {
    await saveUserApiScriptPending(id, script)
    if (!await verifyUserApiScript(id, script)) {
      await clearUserApiScriptPending(id)
      // 试跑已经把失败脚本装进运行实例了，必须重新加载正式脚本把它换回来
      await reloadUserApi(id)
      throw new Error(global.i18n.t('user_api_refresh_rollback'))
    }
  }

  const info = await updateUserApiScript(id, script)
  action.updateUserApi(info)
  await clearUserApiScriptPending(id)

  return { info, applied: isActive }
}

export const restorePrevUserApi = async(id: string): Promise<{ info: LX.UserApi.UserApiInfo, applied: boolean }> => {
  const info = await restoreUserApiScript(id)
  action.updateUserApi(info)

  if (settingState.setting['common.apiSource'] != id) return { info, applied: false }
  if (!await reloadUserApi(id)) throw new Error(global.i18n.t('user_api_restore_prev_failed'))
  return { info, applied: true }
}

export const setUserApiUrl = async(id: string, url: string) => {
  const info = await updateUserApiInfo(id, { url })
  if (info) action.updateUserApi(info)
  return info
}

export const removeUserApi = async(ids: string[]) => {
  const list = await removeUserApiFromStore(ids)
  action.setUserApiList(list)
}

export const setUserApiAllowShowUpdateAlert = async(id: string, enable: boolean) => {
  await setUserApiAllowShowUpdateAlertFromStore(id, enable)
  action.setUserApiAllowShowUpdateAlert(id, enable)
}

export const log = {
  r_info(...params: any[]) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    writeLog.info(...params)
  },
  r_warn(...params: any[]) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    writeLog.warn(...params)
  },
  r_error(...params: any[]) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    writeLog.error(...params)
  },
  log(...params: any[]) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    if (global.lx.isEnableUserApiLog) writeLog.info(...params)
  },
  info(...params: any[]) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    if (global.lx.isEnableUserApiLog) writeLog.info(...params)
  },
  warn(...params: any[]) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    if (global.lx.isEnableUserApiLog) writeLog.warn(...params)
  },
  error(...params: any[]) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    if (global.lx.isEnableUserApiLog) writeLog.error(...params)
  },
}
