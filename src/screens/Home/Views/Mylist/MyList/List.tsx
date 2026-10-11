import { memo, useEffect, useRef, useState } from 'react'
import { View, TouchableOpacity, SectionList, type SectionListData, type SectionListRenderItem } from 'react-native'

import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { useActiveListId, useListFetching, useMyList } from '@/store/list/hook'
import { createStyle } from '@/utils/tools'
import { LIST_IDS, LIST_SCROLL_POSITION_KEY } from '@/config/constant'
import { getListPosition, saveListPosition } from '@/utils/data'
import Text from '@/components/common/Text'
import { type Position } from './ListMenu'
import { scaleSizeH, scaleSizeW } from '@/utils/pixelRatio'
import Loading from '@/components/common/Loading'
import { getListMusics } from '@/core/list'

const ITEM_HEIGHT = scaleSizeH(40)

interface ListSection {
  key: 'fixed' | 'user'
  title: string
  data: LX.List.MyListInfo[]
}

const ListItem = memo(({ item, index, activeId, count, onPress, onShowMenu }: {
  onPress: (item: LX.List.MyListInfo) => void
  index: number
  count?: number
  activeId: string
  item: LX.List.MyListInfo
  onShowMenu: (item: LX.List.MyListInfo, index: number, position: { x: number, y: number, w: number, h: number }) => void
}) => {
  const theme = useTheme()
  const moreButtonRef = useRef<TouchableOpacity>(null)
  const fetching = useListFetching(item.id)

  const active = activeId == item.id

  const handleShowMenu = () => {
    if (moreButtonRef.current?.measure) {
      moreButtonRef.current.measure((fx, fy, width, height, px, py) => {
        onShowMenu(item, index, { x: Math.ceil(px), y: Math.ceil(py), w: Math.ceil(width), h: Math.ceil(height) })
      })
    }
  }
  const handlePress = () => {
    onPress(item)
  }
  return (
    <View style={{ ...styles.listItem, height: ITEM_HEIGHT }}>
      {
        active
          ? <Icon style={styles.listActiveIcon} name="chevron-right" size={12} color={theme['c-primary-font']} />
          : null
      }
      { fetching ? <Loading color={active ? theme['c-primary-font'] : theme['c-font']} style={styles.loading} /> : null }
      <TouchableOpacity style={styles.listName} onPress={handlePress}>
        <Text numberOfLines={1} color={active ? theme['c-primary-font'] : theme['c-font']}>{item.name}</Text>
      </TouchableOpacity>
      { count == null ? null : <Text style={styles.listCount} size={12} color={theme['c-font-label']}>{global.i18n.t('list_music_count', { total: count })}</Text> }
      <TouchableOpacity onPress={handleShowMenu} ref={moreButtonRef} style={styles.listMoreBtn}>
        <Icon name="dots-vertical" color={theme['c-350']} size={12} />
      </TouchableOpacity>
    </View>
  )
}, (prevProps, nextProps) => {
  return !!(prevProps.item === nextProps.item &&
    prevProps.index === nextProps.index &&
    prevProps.count === nextProps.count &&
    prevProps.item.name == nextProps.item.name &&
    prevProps.activeId != nextProps.item.id &&
    nextProps.activeId != nextProps.item.id
  )
})

export default ({ onShowMenu, onSelect }: {
  onShowMenu: (info: { listInfo: LX.List.MyListInfo, index: number }, position: Position) => void
  onSelect: (listInfo: LX.List.MyListInfo) => void
}) => {
  const theme = useTheme()
  const flatListRef = useRef<SectionList<LX.List.MyListInfo, ListSection>>(null)
  const allList = useMyList()
  const activeListId = useActiveListId()
  const [counts, setCounts] = useState<Record<string, number>>({})

  const handleToggleList = (item: LX.List.MyListInfo) => {
    onSelect(item)
  }

  // 载入各列表的歌曲数量（首次进入 + 列表内歌曲变化时增量刷新）
  useEffect(() => {
    let isMounted = true
    const loadCounts = async(ids?: string[]) => {
      const targetList = ids ? allList.filter(l => ids.includes(l.id)) : allList
      const entries: Array<[string, number]> = []
      for (const listInfo of targetList) {
        const list = await getListMusics(listInfo.id)
        entries.push([listInfo.id, list.length])
      }
      if (!isMounted || !entries.length) return
      setCounts((counts) => ({ ...counts, ...Object.fromEntries(entries) }))
    }
    void loadCounts()
    const handleChange = (ids: string[]) => {
      void loadCounts(ids)
    }
    global.app_event.on('myListMusicUpdate', handleChange)
    return () => {
      isMounted = false
      global.app_event.off('myListMusicUpdate', handleChange)
    }
  }, [allList])

  const handleScroll = ({ nativeEvent }: { nativeEvent: { contentOffset: { y: number } } }) => {
    void saveListPosition(LIST_SCROLL_POSITION_KEY, nativeEvent.contentOffset.y)
  }
  const showMenu = (listInfo: LX.List.MyListInfo, index: number, position: Position) => {
    onShowMenu({ listInfo, index }, position)
  }
  useEffect(() => {
    void getListPosition(LIST_SCROLL_POSITION_KEY).then((offset) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      ;(flatListRef.current?.getScrollResponder() as unknown as { scrollTo?: (opts: { x?: number, y: number, animated?: boolean }) => void } | null)?.scrollTo?.({ x: 0, y: offset, animated: false })
    })
  }, [])

  const sections: ListSection[] = [
    {
      key: 'fixed',
      title: global.i18n.t('list_group_fixed'),
      data: allList.filter(l => l.id == LIST_IDS.DEFAULT || l.id == LIST_IDS.LOVE),
    },
    {
      key: 'user',
      title: global.i18n.t('list_group_user'),
      data: allList.filter(l => l.id != LIST_IDS.DEFAULT && l.id != LIST_IDS.LOVE && l.id != LIST_IDS.TEMP),
    },
  ]

  const renderItem: SectionListRenderItem<LX.List.MyListInfo, ListSection> = ({ item, index }) => (
    <ListItem
      key={item.id}
      item={item}
      index={index}
      count={counts[item.id]}
      activeId={activeListId}
      onPress={handleToggleList}
      onShowMenu={showMenu}
    />
  )
  const renderSectionHeader = ({ section }: { section: SectionListData<LX.List.MyListInfo, ListSection> }) => (
    <View style={[styles.sectionHeader, { backgroundColor: theme['c-content-background'] }]}>
      <Text size={12} color={theme['c-font-label']}>{section.title}</Text>
    </View>
  )
  const renderSectionFooter = ({ section }: { section: SectionListData<LX.List.MyListInfo, ListSection> }) => {
    if (section.data.length || section.key != 'user') return null
    return (
      <View style={styles.sectionEmpty}>
        <Text size={12} color={theme['c-font-label']}>{global.i18n.t('list_empty_user_tip')}</Text>
      </View>
    )
  }

  return (
    <SectionList
      ref={flatListRef}
      onScroll={handleScroll}
      style={styles.container}
      sections={sections}
      maxToRenderPerBatch={9}
      windowSize={9}
      removeClippedSubviews={true}
      initialNumToRender={18}
      renderItem={renderItem}
      keyExtractor={item => item.id}
      renderSectionHeader={renderSectionHeader}
      renderSectionFooter={renderSectionFooter}
    />
  )
}

const styles = createStyle({
  container: {
    flexShrink: 1,
    flexGrow: 0,
  },
  sectionHeader: {
    height: scaleSizeH(28),
    justifyContent: 'center',
    paddingLeft: scaleSizeW(10),
  },
  sectionEmpty: {
    paddingTop: scaleSizeH(8),
    paddingBottom: scaleSizeH(12),
    paddingLeft: scaleSizeW(12),
  },
  listItem: {
    height: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 5,
    paddingLeft: 5,
  },
  listActiveIcon: {
    marginLeft: 3,
    textAlign: 'center',
  },
  loading: {
    marginLeft: 5,
  },
  listName: {
    height: '100%',
    justifyContent: 'center',
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: 5,
  },
  listCount: {
    paddingLeft: scaleSizeW(4),
    paddingRight: scaleSizeW(4),
  },
  listMoreBtn: {
    height: '100%',
    width: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
