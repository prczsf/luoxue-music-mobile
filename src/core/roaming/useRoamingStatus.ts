import { useEffect, useState } from 'react'

import { getStatus, subscribe } from './conveyor'
import type { RoamingStatus } from './conveyor'

/**
 * 漫游状态的 React 订阅 hook（roaming-plan §3.5）
 * conveyor 的 getStatus() 每次返回新对象，不能用 useSyncExternalStore（渲染期反复取快照会无限重渲染）；
 * notify 时把最新 status 对象直接 setState，仅在真实通知时重渲染
 */
export const useRoamingStatus = (): RoamingStatus => {
  const [status, setStatus] = useState<RoamingStatus>(() => getStatus())
  useEffect(() => {
    setStatus(getStatus())
    return subscribe(setStatus)
  }, [])
  return status
}
