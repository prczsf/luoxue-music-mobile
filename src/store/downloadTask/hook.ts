import { useEffect, useState } from 'react'

import { event, getTasks } from '@/core/download'

/**
 * 下载任务列表（含实时进度）
 * 任务对象是就地修改的，这里每次事件都复制数组以触发重渲染
 */
export const useDownloadTasks = () => {
  const [tasks, setTasks] = useState<LX.Download.ListItem[]>(() => [...getTasks()])

  useEffect(() => {
    const handleUpdate = () => {
      setTasks([...getTasks()])
    }
    event.on('updated', handleUpdate)
    event.on('progress', handleUpdate)
    return () => {
      event.off('updated', handleUpdate)
      event.off('progress', handleUpdate)
    }
  }, [])

  return tasks
}
