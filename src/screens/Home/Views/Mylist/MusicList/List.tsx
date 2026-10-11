import { playList } from '@/core/player/player'
import { useMemo, useRef, useState, useEffect, forwardRef, useImperativeHandle, type ReactNode } from 'react'
import { Animated, Dimensions, FlatList, StyleSheet, TouchableOpacity, View, type NativeScrollEvent, type NativeSyntheticEvent, type FlatListProps } from 'react-native'

import listState from '@/store/list/state'
import playerState from '@/store/player/state'
import { getListPosition, getListPrevSelectId, saveListPosition } from '@/utils/data'
import { getListMusics, setActiveList } from '@/core/list'
import { setNavActiveId } from '@/core/common'
import ListItem, { ITEM_HEIGHT } from './ListItem'
import { createStyle, getRowInfo } from '@/utils/tools'
import { usePlayInfo, usePlayMusicInfo } from '@/store/player/hook'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { Icon } from '@/components/common/Icon'
import Button from '@/components/common/Button'
import Text from '@/components/common/Text'
import type { Position } from './ListMenu'
import type { SelectMode } from './MultipleModeBar'
import { useActiveListId } from '@/store/list/hook'
import { useSettingValue } from '@/store/setting/hook'

type FlatListType = FlatListProps<LX.Music.MusicInfo>
type ListStatus = 'loading' | 'ready' | 'error'

export interface ListProps {
  onShowMenu: (musicInfo: LX.Music.MusicInfo, index: number, position: Position) => void
  onMuiltSelectMode: () => void
  onSelectAll: (isAll: boolean) => void
  onSelectCountChange: (count: number) => void
}
export interface ListType {
  setIsMultiSelectMode: (isMultiSelectMode: boolean) => void
  setSelectMode: (mode: SelectMode) => void
  selectAll: (isAll: boolean) => void
  getSelectedList: () => LX.List.ListMusics
  scrollToInfo: (info: LX.Music.MusicInfo) => void
  scrollToTop: () => void
}

const SLOW_LOAD_DELAY = 1000

const usePlayIndex = () => {
  const activeListId = useActiveListId()
  const playMusicInfo = usePlayMusicInfo()
  const playInfo = usePlayInfo()
  const playIndex = useMemo(() => {
    return playMusicInfo.listId == activeListId ? playInfo.playIndex : -1
  }, [activeListId, playInfo.playIndex, playMusicInfo.listId])
  return playIndex
}

const usePulse = () => {
  const opacity = useRef(new Animated.Value(0.45)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.45, duration: 600, useNativeDriver: true }),
    ]))
    loop.start()
    return () => { loop.stop() }
  }, [opacity])
  return opacity
}

const ListSkeleton = ({ showRetry, onRetry, rowNum }: { showRetry?: boolean, onRetry: () => void, rowNum: number }) => {
  const theme = useTheme()
  const t = useI18n()
  const opacity = usePulse()
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- RN DimensionValue 需要字面量类型，tsc 与 eslint 推断不一致
  const rowWidth = `${100 / rowNum}%` as `${number}%`
  return (
    <Animated.View style={[styles.stateView, { opacity }]}>
      <View style={styles.skeletonGrid}>
        {Array.from({ length: rowNum * 6 }).map((_, i) => (
          <View key={i} style={[styles.skeletonRow, { width: rowWidth }]}>
            <View style={[styles.skeletonIndex, { backgroundColor: theme['c-border-background'] }]} />
            <View style={styles.skeletonInfo}>
              <View style={[styles.skeletonName, { backgroundColor: theme['c-border-background'] }]} />
              <View style={[styles.skeletonSub, { backgroundColor: theme['c-border-background'] }]} />
            </View>
          </View>
        ))}
      </View>
      {showRetry
        ? <Button style={styles.retryBtn} onPress={onRetry}>
            <Text size={13} color={theme['c-primary-font']}>{t('list_retry')}</Text>
          </Button>
        : null}
    </Animated.View>
  )
}

const LoadErrorView = ({ onRetry }: { onRetry: () => void }) => {
  const theme = useTheme()
  const t = useI18n()
  return (
    <TouchableOpacity style={styles.stateView} onPress={onRetry}>
      <Icon name="help" size={40} color={theme['c-350']} />
      <Text size={13} style={styles.stateTip} color={theme['c-font-label']}>{t('list_error')}</Text>
    </TouchableOpacity>
  )
}

const ListEmptyView = ({ onSearch }: { onSearch: () => void }) => {
  const theme = useTheme()
  const t = useI18n()
  return (
    <View style={styles.stateView}>
      <Icon name="album" size={44} color={theme['c-350']} />
      <Text size={13} style={styles.stateTip} color={theme['c-font-label']}>{t('list_empty')}</Text>
      <Button style={styles.emptyBtn} onPress={onSearch}>
        <Text size={14} color={theme['c-primary-font']}>{t('list_empty_search_btn')}</Text>
      </Button>
    </View>
  )
}

const TopProgressBar = () => {
  const theme = useTheme()
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]))
    loop.start()
    return () => { loop.stop() }
  }, [anim])
  const screenWidth = Dimensions.get('window').width
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-screenWidth, screenWidth] })
  return (
    <View style={styles.progressBarWrap} pointerEvents="none">
      <Animated.View style={[styles.progressBar, { backgroundColor: theme['c-primary-font-active'], transform: [{ translateX }] }]} />
    </View>
  )
}

const List = forwardRef<ListType, ListProps>((props, ref) => {
  const { onShowMenu, onMuiltSelectMode, onSelectAll, onSelectCountChange } = props
  const flatListRef = useRef<FlatList>(null)
  const [currentList, setList] = useState<LX.List.ListMusics>([])
  const [listStatus, setListStatus] = useState<ListStatus>('loading')
  const [slowLoad, setSlowLoad] = useState(false)
  const slowTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const listFirstScrollRef = useRef(false)
  const isMultiSelectModeRef = useRef(false)
  const selectModeRef = useRef<SelectMode>('single')
  const prevSelectIndexRef = useRef(-1)
  const [selectedList, setSelectedList] = useState<LX.List.ListMusics>([])
  const selectedListRef = useRef<LX.List.ListMusics>([])
  const currentListIdRef = useRef('')
  const waitJumpListPositionRef = useRef(false)
  const isUpdateingList = useRef(false)
  const rowInfo = useRef(getRowInfo())
  const isShowAlbumName = useSettingValue('list.isShowAlbumName')
  const isShowInterval = useSettingValue('list.isShowInterval')

  const clearSlowTimer = () => {
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current)
      slowTimerRef.current = undefined
    }
  }

  useImperativeHandle(ref, () => ({
    setIsMultiSelectMode(isMultiSelectMode) {
      isMultiSelectModeRef.current = isMultiSelectMode
      if (!isMultiSelectMode) {
        prevSelectIndexRef.current = -1
        handleUpdateSelectedList([])
      }
    },
    setSelectMode(mode) {
      selectModeRef.current = mode
    },
    selectAll(isAll) {
      let list: LX.List.ListMusics
      if (isAll) {
        list = [...currentList]
      } else {
        list = []
      }
      selectedListRef.current = list
      setSelectedList(list)
      onSelectCountChange(list.length)
    },
    getSelectedList() {
      return selectedListRef.current
    },
    scrollToInfo(info) {
      void getListMusics(listState.activeListId).then((list) => {
        const index = list.findIndex(m => m.id == info.id)
        if (index < 0) return
        flatListRef.current?.scrollToIndex({ index: Math.floor(index / (rowInfo.current.rowNum ?? 1)), viewPosition: 0.3, animated: true })
      })
    },
    scrollToTop() {
      flatListRef.current?.scrollToOffset({
        offset: 0,
        animated: true,
      })
    },
  }))

  const updateList = (id: string) => {
    if (currentListIdRef.current == id) return
    currentListIdRef.current = id
    setListStatus('loading')
    isUpdateingList.current = true
    setSlowLoad(false)
    clearSlowTimer()
    slowTimerRef.current = setTimeout(() => { setSlowLoad(true) }, SLOW_LOAD_DELAY)
    void Promise.all([getListMusics(id), getListPosition(id)]).then(([list, position]) => {
      requestAnimationFrame(() => {
        if (currentListIdRef.current != id) return
        clearSlowTimer()
        selectedListRef.current = []
        setSelectedList([])
        setList([...list])
        setListStatus('ready')
        isUpdateingList.current = false
        requestAnimationFrame(() => {
          listFirstScrollRef.current = true
          if (waitJumpListPositionRef.current) {
            waitJumpListPositionRef.current = false
            if (playerState.playMusicInfo.listId == id && playerState.playInfo.playIndex > -1) {
              try {
                flatListRef.current?.scrollToIndex({ index: Math.floor(playerState.playInfo.playIndex / (rowInfo.current.rowNum ?? 1)), viewPosition: 0.3, animated: false })
                return
              } catch {}
            }
          }
          flatListRef.current?.scrollToOffset({ offset: position, animated: false })
        })
      })
    }).catch((err) => {
      if (currentListIdRef.current != id) return
      clearSlowTimer()
      isUpdateingList.current = false
      console.warn('getListMusics failed', err)
      setListStatus('error')
    })
  }

  const initLoad = () => {
    setListStatus('loading')
    setSlowLoad(false)
    clearSlowTimer()
    slowTimerRef.current = setTimeout(() => { setSlowLoad(true) }, SLOW_LOAD_DELAY)
    const handleFail = (err: unknown) => {
      clearSlowTimer()
      console.warn('getListPrevSelectId failed', err)
      setListStatus('error')
    }
    if (global.lx.jumpMyListPosition) {
      global.lx.jumpMyListPosition = false
      if (playerState.playMusicInfo.listId) {
        waitJumpListPositionRef.current = true
        updateList(playerState.playMusicInfo.listId)
      } else void getListPrevSelectId().then(updateList).catch(handleFail)
    } else void getListPrevSelectId().then(updateList).catch(handleFail)
  }

  const handleRetry = () => {
    const id = currentListIdRef.current
    if (id) {
      currentListIdRef.current = ''
      updateList(id)
    } else initLoad()
  }

  const handleGoSearch = () => {
    setNavActiveId('nav_search')
  }

  useEffect(() => {
    initLoad()
    const handleChange = (ids: string[]) => {
      if (!ids.includes(listState.activeListId)) return
      const id = listState.activeListId
      void getListMusics(id).then((list) => {
        if (currentListIdRef.current != id) return
        selectedListRef.current = []
        setSelectedList([])
        setList([...list])
        setListStatus('ready')
      }).catch((err) => {
        console.warn('getListMusics update failed', err)
      })
    }

    const handleJumpPosition = () => {
      requestAnimationFrame(() => {
        const listId = playerState.playMusicInfo.listId
        if (!listId) return
        if (listId != listState.activeListId) {
          setActiveList(listId)
          if (currentListIdRef.current != listId) waitJumpListPositionRef.current = true
        } else if (playerState.playInfo.playIndex > -1) {
          if (isUpdateingList.current) waitJumpListPositionRef.current = true
          else {
            try {
              flatListRef.current?.scrollToIndex({ index: Math.floor(playerState.playInfo.playIndex / (rowInfo.current.rowNum ?? 1)), viewPosition: 0.3, animated: true })
            } catch {}
          }
        }
      })
    }

    global.state_event.on('mylistToggled', updateList)
    global.app_event.on('myListMusicUpdate', handleChange)
    global.app_event.on('jumpListPosition', handleJumpPosition)

    return () => {
      global.state_event.off('mylistToggled', updateList)
      global.app_event.off('myListMusicUpdate', handleChange)
      global.app_event.off('jumpListPosition', handleJumpPosition)
      clearSlowTimer()
    }
  }, [])

  const activeIndex = usePlayIndex()
  const handlePlay = (index: number) => {
    void playList(listState.activeListId, index)
  }

  const handleUpdateSelectedList = (newList: LX.List.ListMusics) => {
    if (selectedListRef.current.length && newList.length == currentList.length) onSelectAll(true)
    else if (selectedListRef.current.length == currentList.length) onSelectAll(false)
    selectedListRef.current = newList
    setSelectedList(newList)
    onSelectCountChange(newList.length)
  }
  const handleSelect = (item: LX.Music.MusicInfo, pressIndex: number) => {
    let newList: LX.List.ListMusics
    if (selectModeRef.current == 'single') {
      prevSelectIndexRef.current = pressIndex
      const index = selectedListRef.current.indexOf(item)
      if (index < 0) {
        newList = [...selectedListRef.current, item]
      } else {
        newList = [...selectedListRef.current]
        newList.splice(index, 1)
      }
    } else {
      if (selectedListRef.current.length) {
        const prevIndex = prevSelectIndexRef.current
        const currentIndex = pressIndex
        if (prevIndex == currentIndex) {
          newList = []
        } else if (currentIndex > prevIndex) {
          newList = currentList.slice(prevIndex, currentIndex + 1)
        } else {
          newList = currentList.slice(currentIndex, prevIndex + 1)
          newList.reverse()
        }
      } else {
        newList = [item]
        prevSelectIndexRef.current = pressIndex
      }
    }

    handleUpdateSelectedList(newList)
  }

  const handlePress = (item: LX.Music.MusicInfo, index: number) => {
    requestAnimationFrame(() => {
      if (!global.lx.homePagerIdle) return
      if (listStatus != 'ready') return
      if (isMultiSelectModeRef.current) {
        handleSelect(item, index)
      } else {
        handlePlay(index)
      }
    })
  }

  const handleLongPress = (item: LX.Music.MusicInfo, index: number) => {
    if (isMultiSelectModeRef.current) return
    prevSelectIndexRef.current = index
    handleUpdateSelectedList([item])
    onMuiltSelectMode()
  }

  const handleScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (listFirstScrollRef.current) {
      listFirstScrollRef.current = false
      return
    }
    void saveListPosition(listState.activeListId, nativeEvent.contentOffset.y)
  }

  const renderItem: FlatListType['renderItem'] = ({ item, index }) => (
    <ListItem
      item={item}
      index={index}
      activeIndex={activeIndex}
      onPress={handlePress}
      onLongPress={handleLongPress}
      onShowMenu={onShowMenu}
      selectedList={selectedList}
      rowInfo={rowInfo.current}
      isShowAlbumName={isShowAlbumName}
      isShowInterval={isShowInterval}
    />
  )
  const getkey: FlatListType['keyExtractor'] = item => item.id
  const getItemLayout: FlatListType['getItemLayout'] = (data, index) => {
    return { length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index }
  }

  let body: ReactNode
  if (listStatus == 'error') {
    body = <LoadErrorView onRetry={handleRetry} />
  } else if (listStatus == 'loading' && (slowLoad || !currentList.length)) {
    body = <ListSkeleton showRetry={slowLoad} onRetry={handleRetry} rowNum={rowInfo.current.rowNum ?? 1} />
  } else {
    body = (
      <>
        <FlatList
          ref={flatListRef}
          onScroll={handleScroll}
          style={styles.list}
          contentContainerStyle={currentList.length ? undefined : styles.listEmptyContent}
          data={currentList}
          maxToRenderPerBatch={4}
          numColumns={rowInfo.current.rowNum}
          horizontal={false}
          windowSize={8}
          removeClippedSubviews={true}
          initialNumToRender={12}
          renderItem={renderItem}
          ListEmptyComponent={<ListEmptyView onSearch={handleGoSearch} />}
          keyExtractor={getkey}
          extraData={activeIndex}
          getItemLayout={getItemLayout}
        />
        {listStatus == 'loading'
          ? <>
              <View style={styles.mask} />
              <TopProgressBar />
            </>
          : null}
      </>
    )
  }

  return (
    <View style={styles.container}>
      {body}
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
  },
  list: {
    flexGrow: 1,
    flexShrink: 1,
  },
  listEmptyContent: {
    flexGrow: 1,
  },
  mask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 2,
  },
  progressBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 2,
    overflow: 'hidden',
    zIndex: 3,
  },
  progressBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 2,
    width: '55%',
  },
  stateView: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 30,
    paddingRight: 30,
    minHeight: 320,
  },
  stateTip: {
    marginTop: 12,
    textAlign: 'center',
  },
  emptyBtn: {
    marginTop: 16,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 22,
    paddingRight: 22,
    borderRadius: 18,
    borderWidth: 1,
  },
  retryBtn: {
    marginTop: 18,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 18,
    paddingRight: 18,
    borderRadius: 14,
    borderWidth: 1,
  },
  skeletonGrid: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ITEM_HEIGHT,
    paddingLeft: 15,
    paddingRight: 15,
  },
  skeletonIndex: {
    width: 26,
    height: 13,
    borderRadius: 3,
    marginRight: 12,
  },
  skeletonInfo: {
    flexGrow: 1,
    flexShrink: 1,
  },
  skeletonName: {
    width: '58%',
    height: 13,
    borderRadius: 3,
  },
  skeletonSub: {
    width: '34%',
    height: 10,
    borderRadius: 3,
    marginTop: 7,
  },
})

export default List
