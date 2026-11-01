import { action, state } from '@/store/userApi'
import { addUserApi, getUserApiScript, restoreUserApiScript, updateUserApiInfo, updateUserApiScript, removeUserApi as removeUserApiFromStore, setUserApiAllowShowUpdateAlert as setUserApiAllowShowUpdateAlertFromStore } from '@/utils/data'
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

// 重新加载指定源并等待初始化结果。
// 这里与 core/apiSource.ts 的 setApiSource 共用同一套 apiInitPromise 约定：
// 先置为 pending，再由 native 的 init 回调 resolve；超时视为失败，避免脚本异常时不回调导致卡死。
const reloadUserApi = async(id: string): Promise<boolean> => {
  if (global.lx.apiInitPromise[1]) {
    global.lx.apiInitPromise[0] = new Promise(resolve => {
      global.lx.apiInitPromise[1] = false
      global.lx.apiInitPromise[2] = (result: boolean) => {
        global.lx.apiInitPromise[1] = true
        resolve(result)
      }
    })
  }
  await setUserApi(id).catch(() => {
    if (!global.lx.apiInitPromise[1]) global.lx.apiInitPromise[2](false)
  })
  return await Promise.race([
    global.lx.apiInitPromise[0],
    new Promise<boolean>(resolve => {
      setTimeout(() => { resolve(false) }, API_INIT_TIMEOUT)
    }),
  ])
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
 * 覆盖前会留存上一版脚本，若新脚本初始化失败则自动回滚。
 */
export const refreshUserApi = async(id: string): Promise<{ info: LX.UserApi.UserApiInfo, applied: boolean }> => {
  const target = state.list.find(api => api.id === id)
  if (!target) throw new Error('api not found')
  if (!target.url) throw new Error(global.i18n.t('user_api_refresh_no_url'))

  const script = await downloadUserApiScript(target.url)
  // 校验脚本头部并落盘：脚本无效会在这一步抛错，此时本地数据完全未变
  const info = await updateUserApiScript(id, script)
  action.updateUserApi(info)

  if (settingState.setting['common.apiSource'] != id) return { info, applied: false }

  if (await reloadUserApi(id)) return { info, applied: true }

  // 新脚本初始化失败：回滚到上一版，保证源仍然可用
  const prevInfo = await restoreUserApiScript(id).catch(() => null)
  if (prevInfo) {
    action.updateUserApi(prevInfo)
    await reloadUserApi(id)
  }
  throw new Error(global.i18n.t('user_api_refresh_rollback'))
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
