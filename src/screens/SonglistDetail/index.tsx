import { useEffect, useRef } from 'react'

import MusicList, { type MusicListType } from './MusicList'
import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { type ListInfoItem } from '@/store/songlist/state'
import PlayerBar from '@/components/player/PlayerBar'
import { ListInfoContext } from './state'
import songlistState from '@/store/songlist/state'
import { getAutoplayStartIndex } from '@/utils/autoplayOnOpen'
import { handlePlay } from './listAction'


export default ({ componentId, info }: { componentId: string, info: ListInfoItem }) => {
  const musicListRef = useRef<MusicListType>(null)
  const isUnmountedRef = useRef(false)

  useEffect(() => {
    setComponentId(COMPONENT_IDS.songlistDetail, componentId)

    isUnmountedRef.current = false

    const promise = musicListRef.current?.loadList(info.source, info.id)
    if (promise) {
      void promise.then(() => {
        if (isUnmountedRef.current) return
        const detailInfo = songlistState.listDetailInfo
        if (detailInfo.id != info.id || detailInfo.source != info.source) return
        const index = getAutoplayStartIndex(`online:${info.source}:${info.id}`, detailInfo.list.length)
        if (index == null) return
        void handlePlay(info.id, info.source, detailInfo.list, index)
      })
    }

    return () => {
      isUnmountedRef.current = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  return (
    <PageContent>
      <StatusBar />
      <ListInfoContext.Provider value={info}>
        <MusicList ref={musicListRef} componentId={componentId} />
      </ListInfoContext.Provider>
      <PlayerBar />
    </PageContent>
  )
}

// const styles = createStyle({
//   container: {
//     width: '100%',
//     flex: 1,
//     flexDirection: 'row',
//     borderTopWidth: BorderWidths.normal,
//   },
//   content: {
//     flex: 1,
//   },
// })
