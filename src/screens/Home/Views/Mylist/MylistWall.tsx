import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, TouchableOpacity, View, type FlatListProps, type GestureResponderEvent } from 'react-native'

import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { useActiveListId, useMyList } from '@/store/list/hook'
import { usePlayMusicInfo } from '@/store/player/hook'
import { useSettingValue } from '@/store/setting/hook'
import { createStyle } from '@/utils/tools'
import { scaleSizeH, scaleSizeW } from '@/utils/pixelRatio'
import { BorderWidths } from '@/theme'
import { useI18n } from '@/lang'
import { LIST_IDS } from '@/config/constant'
import { getListMusics } from '@/core/list'
import { getListUpdateInfo } from '@/utils/data'
import { updateSetting } from '@/core/common'

type FlatListType = FlatListProps<LX.List.MyListInfo>

const GRID_NUM_COLUMNS = 2
const GRID_ITEM_HEIGHT = scaleSizeH(86)
const LIST_ITEM_HEIGHT = scaleSizeH(56)

const formatUpdateTime = (time: number | null | undefined): string => {
  if (!time) return ''
  const d = new Date(time)
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const getDisplayName = (item: LX.List.MyListInfo, t: (k: 'list_name_default' | 'list_name_love') => string): string => {
  if (item.id == LIST_IDS.DEFAULT) return t('list_name_default')
  if (item.id == LIST_IDS.LOVE) return t('list_name_love')
  return item.name
}

const ListCard = memo(({ item, index, count, updateTime, viewMode, active, playing, onPress, onPlayList, onShowMenu }: {
  item: LX.List.MyListInfo
  index: number
  count: number | undefined
  updateTime: string
  viewMode: 'list' | 'grid'
  active: boolean
  playing: boolean
  onPress: (item: LX.List.MyListInfo) => void
  onPlayList: (item: LX.List.MyListInfo) => void
  onShowMenu: (info: { listInfo: LX.List.MyListInfo, index: number }, position: { x: number, y: number, w: number, h: number }) => void
}) => {
  const theme = useTheme()
  const t = useI18n()
  const handleMenuPress = (e: GestureResponderEvent) => {
    const { pageX, pageY } = e.nativeEvent
    onShowMenu({ listInfo: item, index }, { x: Math.ceil(pageX), y: Math.ceil(pageY), w: 0, h: 0 })
  }
  const handleLongPress = () => {
    onShowMenu({ listInfo: item, index }, { x: 0, y: 0, w: 0, h: 0 })
  }
  if (viewMode == 'grid') {
    return (
      <TouchableOpacity
        style={[styles.gridItem, { borderColor: theme['c-border-background'], backgroundColor: active ? theme['c-primary-background-active'] : theme['c-content-background'] }]}
        onPress={() => { onPress(item) }}
        onLongPress={handleLongPress}
      >
        <View style={styles.gridIconWrap}>
          <Icon name="album" size={30} color={active ? theme['c-primary-font'] : theme['c-350']} />
          {playing ? <Icon style={styles.gridPlayingIcon} name="play-outline" size={12} color={theme['c-primary-font']} /> : null}
        </View>
        <Text numberOfLines={1} size={14} color={active ? theme['c-primary-font'] : theme['c-font']}>{getDisplayName(item, (k) => t(k) as unknown as string)}</Text>
        <Text numberOfLines={1} size={12} color={theme['c-font-label']}>
          {count == null ? '' : t('list_music_count', { total: count })}{updateTime ? ` · ${updateTime}` : ''}
        </Text>
        <TouchableOpacity style={styles.gridMoreBtn} onPress={handleMenuPress}>
          <Icon name="dots-vertical" color={theme['c-350']} size={12} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.gridPlayBtn} onPress={() => { onPlayList(item) }}>
          <Icon name="play-outline" color={theme['c-primary-font']} size={18} />
        </TouchableOpacity>
      </TouchableOpacity>
    )
  }
  return (
    <TouchableOpacity
      style={[styles.listItem, { borderBottomColor: theme['c-border-background'], backgroundColor: active ? theme['c-primary-background-active'] : 'transparent' }]}
      onPress={() => { onPress(item) }}
      onLongPress={handleLongPress}
    >
      <View style={styles.listIconWrap}>
        <Icon name="album" size={26} color={active ? theme['c-primary-font'] : theme['c-350']} />
        {playing ? <Icon style={styles.listPlayingIcon} name="play-outline" size={11} color={theme['c-primary-font']} /> : null}
      </View>
      <View style={styles.listInfo}>
        <Text numberOfLines={1} size={15} color={active ? theme['c-primary-font'] : theme['c-font']}>{getDisplayName(item, (k) => t(k) as unknown as string)}</Text>
        <Text numberOfLines={1} size={12} color={theme['c-font-label']}>
          {count == null ? '' : t('list_music_count', { total: count })}{updateTime ? ` · ${updateTime}` : ''}
        </Text>
      </View>
      <TouchableOpacity style={styles.listPlayBtn} onPress={() => { onPlayList(item) }}>
        <Icon name="play-outline" color={theme['c-button-font']} size={18} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.listMoreBtn} onPress={handleMenuPress}>
        <Icon name="dots-vertical" color={theme['c-350']} size={14} />
      </TouchableOpacity>
    </TouchableOpacity>
  )
})

const useListCounts = (allList: LX.List.MyListInfo[]) => {
  const [counts, setCounts] = useState<Record<string, number>>({})
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
      setCounts((prev) => ({ ...prev, ...Object.fromEntries(entries) }))
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
  return counts
}

const useListUpdateTimes = (allList: LX.List.MyListInfo[]) => {
  const [times, setTimes] = useState<Record<string, number>>({})
  useEffect(() => {
    let isMounted = true
    void getListUpdateInfo().then((info) => {
      if (!isMounted) return
      const next: Record<string, number> = {}
      for (const l of allList) {
        const t = info[l.id]?.updateTime
        if (t) next[l.id] = t
        else if ((l as LX.List.UserListInfo).locationUpdateTime) next[l.id] = (l as LX.List.UserListInfo).locationUpdateTime!
      }
      setTimes(next)
    })
    return () => {
      isMounted = false
    }
  }, [allList])
  return times
}

export interface MylistWallProps {
  onOpenDetail: (listInfo: LX.List.MyListInfo) => void
  onPlayList: (listInfo: LX.List.MyListInfo) => void
  onShowMenu: (info: { listInfo: LX.List.MyListInfo, index: number }, position: { x: number, y: number, w: number, h: number }) => void
  onCreate: () => void
  onManage: () => void
}

export default ({ onOpenDetail, onPlayList, onShowMenu, onCreate, onManage }: MylistWallProps) => {
  const theme = useTheme()
  const t = useI18n()
  const allList = useMyList()
  const activeListId = useActiveListId()
  const playMusicInfo = usePlayMusicInfo()
  const viewMode = useSettingValue('list.mylistViewMode')
  const counts = useListCounts(allList)
  const updateTimes = useListUpdateTimes(allList)

  const data = useMemo(() => allList.filter(l => l.id != LIST_IDS.TEMP), [allList])

  const handlePress = useCallback((item: LX.List.MyListInfo) => {
    onOpenDetail(item)
  }, [onOpenDetail])

  const handlePlayList = useCallback((item: LX.List.MyListInfo) => {
    onPlayList(item)
  }, [onPlayList])

  const toggleViewMode = useCallback(() => {
    updateSetting({ 'list.mylistViewMode': viewMode == 'list' ? 'grid' : 'list' })
  }, [viewMode])

  const renderItem: FlatListType['renderItem'] = ({ item, index }) => (
    <ListCard
      item={item}
      index={index}
      count={counts[item.id]}
      updateTime={formatUpdateTime(updateTimes[item.id])}
      viewMode={viewMode}
      active={activeListId == item.id}
      playing={playMusicInfo.listId == item.id}
      onPress={handlePress}
      onPlayList={handlePlayList}
      onShowMenu={onShowMenu}
    />
  )

  const getkey: FlatListType['keyExtractor'] = item => item.id

  return (
    <View style={styles.container}>
      <View style={[styles.toolbar, { borderBottomColor: theme['c-border-background'] }]}>
        <Text style={styles.toolbarTitle} size={17} numberOfLines={1} color={theme['c-button-font']}>{t('nav_love')}</Text>
        <TouchableOpacity style={styles.toolbarBtn} onPress={toggleViewMode}>
          <Icon color={theme['c-button-font']} name={viewMode == 'list' ? 'menu' : 'album'} size={18} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarBtn} onPress={onCreate}>
          <Icon color={theme['c-button-font']} name="add_folder" size={20} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarBtn} onPress={onManage}>
          <Icon color={theme['c-button-font']} name="dots-vertical" size={18} />
        </TouchableOpacity>
      </View>
      <FlatList
        style={styles.list}
        contentContainerStyle={viewMode == 'grid' ? styles.gridContent : undefined}
        data={data}
        key={viewMode}
        numColumns={viewMode == 'grid' ? GRID_NUM_COLUMNS : 1}
        renderItem={renderItem}
        keyExtractor={getkey}
        removeClippedSubviews={true}
        initialNumToRender={18}
        maxToRenderPerBatch={9}
        windowSize={9}
      />
    </View>
  )
}

const styles = createStyle({
  container: {
    flex: 1,
    flexDirection: 'column',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: scaleSizeH(48),
    paddingLeft: scaleSizeW(15),
    borderBottomWidth: BorderWidths.normal,
  },
  toolbarTitle: {
    flex: 1,
    fontWeight: 'bold',
  },
  toolbarBtn: {
    width: scaleSizeH(48),
    height: scaleSizeH(48),
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    flex: 1,
  },
  gridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: scaleSizeW(8),
  },
  gridItem: {
    width: '47%',
    margin: '1.5%',
    borderWidth: 1,
    borderRadius: 8,
    padding: scaleSizeW(10),
    minHeight: GRID_ITEM_HEIGHT,
    justifyContent: 'center',
  },
  gridIconWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  gridPlayingIcon: {
    marginLeft: 4,
  },
  gridMoreBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridPlayBtn: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: LIST_ITEM_HEIGHT,
    paddingLeft: scaleSizeW(12),
    paddingRight: scaleSizeW(4),
    borderBottomWidth: BorderWidths.normal,
  },
  listIconWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 40,
  },
  listPlayingIcon: {
    marginLeft: 2,
  },
  listInfo: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  listMoreBtn: {
    width: 40,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listPlayBtn: {
    width: 44,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
})
