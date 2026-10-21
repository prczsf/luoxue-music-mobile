import { useEffect, useState } from 'react'
import { state } from './state'
import { event } from './event'

const getRuleNum = () => {
  const { musicNames, singerNames, names, singerKeywords, nameKeywords } = state.dislikeInfo
  return musicNames.size + singerNames.size + names.size + singerKeywords.length + nameKeywords.length
}

export const useRuleNum = () => {
  const [num, setNum] = useState(getRuleNum())

  useEffect(() => {
    const handleUpdate = () => {
      setNum(getRuleNum())
    }
    event.on('dislike_changed', handleUpdate)
    return () => {
      event.off('dislike_changed', handleUpdate)
    }
  }, [])

  return num
}

/** 订阅「不喜欢」规则，规则变化时触发重渲染 */
export const useDislikeInfo = () => {
  const [info, setInfo] = useState(state.dislikeInfo)

  useEffect(() => {
    const handleUpdate = () => {
      setInfo({ ...state.dislikeInfo })
    }
    event.on('dislike_changed', handleUpdate)
    return () => {
      event.off('dislike_changed', handleUpdate)
    }
  }, [])

  return info
}
