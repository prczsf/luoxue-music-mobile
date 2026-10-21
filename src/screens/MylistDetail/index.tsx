import { useEffect } from 'react'
import { View } from 'react-native'
import { Navigation } from 'react-native-navigation'

import PageContent from '@/components/PageContent'
import PageHeader from '@/components/PageHeader'
import PlayerBar from '@/components/player/PlayerBar'
import { useI18n } from '@/lang'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS, LIST_IDS } from '@/config/constant'
import { setActiveList, getListMusics } from '@/core/list'
import { useMyList } from '@/store/list/hook'
import { createStyle } from '@/utils/tools'
import { playList } from '@/core/player/player'
import { getAutoplayStartIndex } from '@/utils/autoplayOnOpen'

import MusicList from './MusicList'

const getListName = (listId: string, allList: Array<{ id: string, name: string }>, t: (key: string) => string) => {
  if (listId == LIST_IDS.DEFAULT) return t('list_name_default')
  if (listId == LIST_IDS.LOVE) return t('list_name_love')
  return allList.find(l => l.id == listId)?.name ?? ''
}

/**
 * 我的歌单详情页（独立 screen，从我的列表页 push 进入）
 * - passProps: { listId }
 * - 进入即 setActiveList(listId)，歌曲能力复用 MusicList（播放/搜索/多选/单曲菜单全带）
 * - 顶部栏统一用 PageHeader（尺寸与 Home 顶部栏一致，不再手写）
 */
export default ({ componentId, listId }: { componentId: string, listId: string }) => {
  const t = useI18n()
  const allList = useMyList()

  useEffect(() => {
    setComponentId(COMPONENT_IDS.mylistDetail, componentId)
    setActiveList(listId)
    // 预热该列表歌曲缓存，详情 MusicList 挂载后经 mylistToggled/初载拉取
    void getListMusics(listId).then(list => {
      const index = getAutoplayStartIndex(`list:${listId}`, list.length)
      if (index == null) return
      void playList(listId, index)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleBack = () => {
    void Navigation.pop(componentId)
  }

  const name = getListName(listId, allList, (k) => t(k as 'list_name_default'))

  return (
    <PageContent>
      <PageHeader title={name} onBack={handleBack} />
      <View style={styles.content}>
        <MusicList listId={listId} />
      </View>
      <PlayerBar />
    </PageContent>
  )
}

const styles = createStyle({
  content: {
    flex: 1,
  },
})
