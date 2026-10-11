import { useEffect } from 'react'
import { StatusBar, TouchableOpacity, View } from 'react-native'
import { Navigation } from 'react-native-navigation'

import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { scaleSizeH, scaleSizeW } from '@/utils/pixelRatio'
import { BorderWidths } from '@/theme'
import { useI18n } from '@/lang'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS, LIST_IDS } from '@/config/constant'
import { setActiveList, getListMusics } from '@/core/list'
import { useMyList } from '@/store/list/hook'
import PlayerBar from '@/components/player/PlayerBar'
import StatusBarView from '@/components/common/StatusBar'
import PageContent from '@/components/PageContent'

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
 */
export default ({ componentId, listId }: { componentId: string, listId: string }) => {
  const theme = useTheme()
  const t = useI18n()
  const allList = useMyList()

  useEffect(() => {
    setComponentId(COMPONENT_IDS.mylistDetail, componentId)
    setActiveList(listId)
    // 预热该列表歌曲缓存，详情 MusicList 挂载后经 mylistToggled/初载拉取
    void getListMusics(listId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  const handleBack = () => {
    void Navigation.pop(componentId)
  }

  const name = getListName(listId, allList, (k) => t(k as 'list_name_default'))

  return (
    <PageContent>
      <StatusBarView />
      <View style={[styles.header, { paddingTop: StatusBar.currentHeight ?? 0, borderBottomColor: theme['c-border-background'] }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={handleBack}>
          <Icon name="chevron-left" size={22} color={theme['c-button-font']} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} size={17} color={theme['c-button-font']} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.headerBtn} />
      </View>
      <View style={styles.content}>
        <MusicList listId={listId} />
      </View>
      <PlayerBar />
    </PageContent>
  )
}

const styles = createStyle({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: scaleSizeH(48) + 24,
    paddingBottom: 24,
    borderBottomWidth: BorderWidths.normal,
  },
  headerBtn: {
    width: scaleSizeH(48),
    height: scaleSizeH(48),
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontWeight: 'bold',
    paddingLeft: scaleSizeW(4),
  },
  content: {
    flex: 1,
  },
})
