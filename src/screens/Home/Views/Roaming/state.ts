import { useCallback, useEffect, useRef, useState } from 'react'

import { getExcludeLists, getRoamingIndex, invalidateIndex, setExcludeLists, useRoamingStatus, type RoamingIndex } from '@/core/roaming'

export { useRoamingStatus }

/**
 * 漫游页面态（roaming-plan §1 / §3.2）
 * - 索引元数据订阅：歌单/歌曲变更后延迟重建，避免连发事件抖动重建
 * - 履带队列状态：走 conveyor 自带的 subscribe/getStatus，非 React 更新安全
 * - 排除歌单名单：内存态，确认时持久化并触发索引重建
 */

/**
 * 索引元数据（页面只需要总量/歌单数/常听歌手）
 * 默认先取缓存索引即时渲染，随后按需重建刷新
 */
export const useIndexMeta = (): { index: RoamingIndex | null, reload: () => void } => {
  const [index, setIndex] = useState<RoamingIndex | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const load = useCallback(async(force = false) => {
    try {
      const idx = await getRoamingIndex(force)
      setIndex(idx)
    } catch {
      // 索引重建失败保持旧数据，页面继续可用
    }
  }, [])

  useEffect(() => {
    void load(false)
    const handleUpdate = () => {
      clearTimer()
      // 短暂延迟合并连发事件，再触发一次重建
      timerRef.current = setTimeout(() => { void load(true) }, 500)
    }
    global.app_event.on('myListMusicUpdate', handleUpdate)
    global.app_event.on('mylistUpdated', handleUpdate)
    return () => {
      clearTimer()
      global.app_event.off('myListMusicUpdate', handleUpdate)
      global.app_event.off('mylistUpdated', handleUpdate)
    }
  }, [load])

  const reload = useCallback(() => {
    void load(true)
  }, [load])

  return { index, reload }
}

/**
 * 排除歌单名单：挂载时读取，确认选择时持久化 + 重建索引
 */
export const useExcludeLists = (): { excluded: string[], save: (ids: string[]) => Promise<void> } => {
  const [excluded, setExcluded] = useState<string[]>([])

  useEffect(() => {
    let isMounted = true
    void getExcludeLists().then(ids => {
      if (isMounted) setExcluded(ids)
    })
    return () => { isMounted = false }
  }, [])

  const save = useCallback(async(ids: string[]) => {
    setExcluded(ids)
    await setExcludeLists(ids)
    invalidateIndex()
  }, [])

  return { excluded, save }
}
