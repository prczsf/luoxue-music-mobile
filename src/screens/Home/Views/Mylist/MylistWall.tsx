import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Image, ScrollView, TouchableOpacity, View, type GestureResponderEvent } from 'react-native'

import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import Button from '@/components/common/Button'
import { useTheme } from '@/store/theme/hook'
import { useActiveListId, useMyList } from '@/store/list/hook'
import listState from '@/store/list/state'
import { usePlayMusicInfo } from '@/store/player/hook'
import { useSettingValue } from '@/store/setting/hook'
import { createStyle, toast } from '@/utils/tools'
import { scaleSizeH, scaleSizeW } from '@/utils/pixelRatio'
import { BorderWidths } from '@/theme'
import { useI18n } from '@/lang'
import { LIST_IDS } from '@/config/constant'
import { getListMusics } from '@/core/list'
import { getListUpdateInfo } from '@/utils/data'
import { updateSetting } from '@/core/common'

const GRID_NUM_COLUMNS = 2
const GRID_ITEM_HEIGHT = scaleSizeH(92)
const LIST_ITEM_HEIGHT = scaleSizeH(58)
const HERO_ITEM_HEIGHT = scaleSizeH(104)

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

/**
 * 英雄置顶卡片（我喜欢 / 默认列表）
 */
const HeroCard = memo(({ item, count, coverUrl, active, playing, onPress, onPlayList, onShowMenu }: {
  item: LX.List.MyListInfo
  count: number | undefined
  coverUrl?: string
  active: boolean
  playing: boolean
  onPress: (item: LX.List.MyListInfo) => void
  onPlayList: (item: LX.List.MyListInfo) => void
  onShowMenu: (info: { listInfo: LX.List.MyListInfo, index: number }, position: { x: number, y: number, w: number, h: number }) => void
}) => {
  const theme = useTheme()
  const t = useI18n()
  const isLove = item.id == LIST_IDS.LOVE

  const handleMenuPress = (e: GestureResponderEvent) => {
    const { pageX, pageY } = e.nativeEvent
    onShowMenu({ listInfo: item, index: 0 }, { x: Math.ceil(pageX), y: Math.ceil(pageY), w: 0, h: 0 })
  }

  const handleLongPress = () => {
    onShowMenu({ listInfo: item, index: 0 }, { x: 0, y: 0, w: 0, h: 0 })
  }

  const handlePlay = (e: GestureResponderEvent) => {
    e.stopPropagation?.()
    if (count === 0) {
      toast(t('list_empty_play_tip'))
      return
    }
    onPlayList(item)
  }

  return (
    <TouchableOpacity
      style={[
        styles.heroItem,
        {
          borderColor: active ? theme['c-primary-font'] : theme['c-border-background'],
          backgroundColor: active ? theme['c-primary-background-active'] : theme['c-content-background'],
        },
      ]}
      activeOpacity={0.75}
      onPress={() => { onPress(item) }}
      onLongPress={handleLongPress}
    >
      <View style={styles.heroTopRow}>
        <View style={[styles.heroIconWrap, { backgroundColor: isLove ? theme['c-primary-background-hover'] : theme['c-border-background'] }]}>
          {coverUrl
            ? <Image source={{ uri: coverUrl }} style={styles.heroCoverImage} resizeMode="cover" />
            : <Icon name={isLove ? 'love' : 'album'} size={20} color={isLove ? theme['c-primary-font'] : theme['c-font']} />
          }
        </View>
        {playing ? (
          <View style={styles.heroPlayingBadge}>
            <Icon name="play-outline" size={13} color={theme['c-primary-font']} />
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.heroMoreBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={handleMenuPress}>
          <Icon name="dots-vertical" color={theme['c-350']} size={14} />
        </TouchableOpacity>
      </View>

      <Text numberOfLines={1} size={15} style={styles.heroTitle} color={active ? theme['c-primary-font'] : theme['c-font']}>
        {getDisplayName(item, (k) => t(k) as unknown as string)}
      </Text>

      <View style={styles.heroBottomRow}>
        <Text numberOfLines={1} size={12} color={theme['c-font-label']}>
          {count == null ? t('list_music_count_empty') : t('list_music_count', { total: count })}
        </Text>
        <TouchableOpacity
          style={[styles.heroPlayBtn, { backgroundColor: theme['c-primary-background-active'] }]}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          onPress={handlePlay}
        >
          <Icon name="play-outline" color={theme['c-primary-font']} size={16} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )
})

/**
 * 普通歌单卡片（网格 / 清单）
 */
const ListCard = memo(({ item, index, count, updateTime, coverUrl, viewMode, active, playing, onPress, onPlayList, onShowMenu }: {
  item: LX.List.MyListInfo
  index: number
  count: number | undefined
  updateTime: string
  coverUrl?: string
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

  const handlePlay = (e: GestureResponderEvent) => {
    e.stopPropagation?.()
    if (count === 0) {
      toast(t('list_empty_play_tip'))
      return
    }
    onPlayList(item)
  }

  if (viewMode == 'grid') {
    return (
      <TouchableOpacity
        style={[
          styles.gridItem,
          {
            borderColor: active ? theme['c-primary-font'] : theme['c-border-background'],
            backgroundColor: active ? theme['c-primary-background-active'] : theme['c-content-background'],
          },
        ]}
        activeOpacity={0.75}
        onPress={() => { onPress(item) }}
        onLongPress={handleLongPress}
      >
        <View style={styles.gridTopRow}>
          <View style={styles.gridCoverWrap}>
            {coverUrl
              ? <Image source={{ uri: coverUrl }} style={styles.gridCoverImage} resizeMode="cover" />
              : <Icon name="album" size={26} color={active ? theme['c-primary-font'] : theme['c-350']} />
            }
          </View>
          {playing ? (
            <View style={styles.gridPlayingBadge}>
              <Icon name="play-outline" size={11} color={theme['c-primary-font']} />
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={styles.gridMoreBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={handleMenuPress}>
            <Icon name="dots-vertical" color={theme['c-350']} size={13} />
          </TouchableOpacity>
        </View>

        <Text numberOfLines={1} size={14} style={styles.gridName} color={active ? theme['c-primary-font'] : theme['c-font']}>
          {getDisplayName(item, (k) => t(k) as unknown as string)}
        </Text>
        <View style={styles.gridBottomRow}>
          <Text numberOfLines={1} size={11} color={theme['c-font-label']} style={styles.gridCountText}>
            {count == null ? t('list_music_count_empty') : t('list_music_count', { total: count })}
            {updateTime ? ` · ${updateTime}` : ''}
          </Text>
          <TouchableOpacity style={styles.gridPlayBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} onPress={handlePlay}>
            <Icon name="play-outline" color={theme['c-primary-font']} size={16} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <TouchableOpacity
      style={[
        styles.listItem,
        {
          borderBottomColor: theme['c-border-background'],
          backgroundColor: active ? theme['c-primary-background-active'] : 'transparent',
        },
      ]}
      activeOpacity={0.75}
      onPress={() => { onPress(item) }}
      onLongPress={handleLongPress}
    >
      <View style={styles.listCoverWrap}>
        {coverUrl
          ? <Image source={{ uri: coverUrl }} style={styles.listCoverImage} resizeMode="cover" />
          : <Icon name="album" size={24} color={active ? theme['c-primary-font'] : theme['c-350']} />
        }
      </View>
      {playing ? (
        <View style={styles.listPlayingBadge}>
          <Icon name="play-outline" size={11} color={theme['c-primary-font']} />
        </View>
      ) : null}
      <View style={styles.listInfo}>
        <Text numberOfLines={1} size={15} color={active ? theme['c-primary-font'] : theme['c-font']}>
          {getDisplayName(item, (k) => t(k) as unknown as string)}
        </Text>
        <Text numberOfLines={1} size={12} color={theme['c-font-label']}>
          {count == null ? t('list_music_count_empty') : t('list_music_count', { total: count })}
          {updateTime ? ` · ${updateTime}` : ''}
        </Text>
      </View>
      <TouchableOpacity style={styles.listPlayBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} onPress={handlePlay}>
        <Icon name="play-outline" color={theme['c-button-font']} size={18} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.listMoreBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} onPress={handleMenuPress}>
        <Icon name="dots-vertical" color={theme['c-350']} size={14} />
      </TouchableOpacity>
    </TouchableOpacity>
  )
})

const useListMeta = (allList: LX.List.MyListInfo[]) => {
  const [meta, setMeta] = useState<{ counts: Record<string, number>, covers: Record<string, string> }>({ counts: {}, covers: {} })
  useEffect(() => {
    let isMounted = true
    const loadMeta = async(ids?: string[]) => {
      const currentList = listState.allList
      const targetList = ids ? currentList.filter(l => ids.includes(l.id)) : currentList
      const nextCounts: Record<string, number> = {}
      const nextCovers: Record<string, string> = {}
      for (const listInfo of targetList) {
        const list = await getListMusics(listInfo.id)
        nextCounts[listInfo.id] = list.length
        if (list[0]?.meta?.picUrl) {
          nextCovers[listInfo.id] = list[0].meta.picUrl
        }
      }
      if (!isMounted) return
      setMeta(prev => ({
        counts: { ...prev.counts, ...nextCounts },
        covers: { ...prev.covers, ...nextCovers },
      }))
    }
    void loadMeta()
    const handleChange = (ids: string[]) => {
      void loadMeta(ids)
    }

    global.app_event.on('myListMusicUpdate', handleChange)
    return () => {
      isMounted = false
      global.app_event.off('myListMusicUpdate', handleChange)
    }
  }, [allList])
  return meta
}

const useListUpdateTimes = (allList: LX.List.MyListInfo[]) => {
  const [times, setTimes] = useState<Record<string, number>>({})
  useEffect(() => {
    let isMounted = true
    const loadTimes = () => {
      void getListUpdateInfo().then((info) => {
        if (!isMounted) return
        const next: Record<string, number> = {}
        const currentList = listState.allList
        for (const l of currentList) {
          const t = info[l.id]?.updateTime
          if (t) next[l.id] = t
          else if ((l as LX.List.UserListInfo).locationUpdateTime) next[l.id] = (l as LX.List.UserListInfo).locationUpdateTime!
        }
        setTimes(next)
      })
    }
    loadTimes()
    const handleUpdate = () => {
      loadTimes()
    }
    global.app_event.on('myListMusicUpdate', handleUpdate)
    return () => {
      isMounted = false
      global.app_event.off('myListMusicUpdate', handleUpdate)
    }
  }, [allList])
  return times
}

export interface MylistWallProps {
  onOpenDetail: (listInfo: LX.List.MyListInfo) => void
  onPlayList: (listInfo: LX.List.MyListInfo) => void
  onShowMenu: (info: { listInfo: LX.List.MyListInfo, index: number }, position: { x: number, y: number, w: number, h: number }) => void
  onCreate: () => void
  onImport?: () => void
  onManage: () => void
}

export default ({ onOpenDetail, onPlayList, onShowMenu, onCreate, onImport, onManage }: MylistWallProps) => {
  const theme = useTheme()
  const t = useI18n()
  const allList = useMyList()
  const activeListId = useActiveListId()
  const playMusicInfo = usePlayMusicInfo()
  const viewMode = useSettingValue('list.mylistViewMode')
  const { counts, covers } = useListMeta(allList)
  const updateTimes = useListUpdateTimes(allList)

  const fixedLists = useMemo(() => {
    const love = allList.find(l => l.id == LIST_IDS.LOVE)
    const def = allList.find(l => l.id == LIST_IDS.DEFAULT)
    const res: LX.List.MyListInfo[] = []
    if (love) res.push(love)
    if (def) res.push(def)
    return res
  }, [allList])
  const userLists = useMemo(() => allList.filter(l => l.id != LIST_IDS.DEFAULT && l.id != LIST_IDS.LOVE && l.id != LIST_IDS.TEMP), [allList])

  const handlePress = useCallback((item: LX.List.MyListInfo) => {
    onOpenDetail(item)
  }, [onOpenDetail])

  const handlePlayList = useCallback((item: LX.List.MyListInfo) => {
    onPlayList(item)
  }, [onPlayList])

  const toggleViewMode = useCallback(() => {
    updateSetting({ 'list.mylistViewMode': viewMode == 'list' ? 'grid' : 'list' })
  }, [viewMode])

  const renderCard = useCallback((item: LX.List.MyListInfo, index: number) => (
    <ListCard
      key={item.id}
      item={item}
      index={index}
      count={counts[item.id]}
      updateTime={formatUpdateTime(updateTimes[item.id])}
      coverUrl={covers[item.id]}
      viewMode={viewMode}
      active={activeListId == item.id}
      playing={playMusicInfo.listId == item.id}
      onPress={handlePress}
      onPlayList={handlePlayList}
      onShowMenu={onShowMenu}
    />
  ), [counts, updateTimes, covers, viewMode, activeListId, playMusicInfo.listId, handlePress, handlePlayList, onShowMenu])

  const renderGridRows = useCallback((lists: LX.List.MyListInfo[], baseIndex: number) => {
    const rows: LX.List.MyListInfo[][] = []
    for (let i = 0; i < lists.length; i += GRID_NUM_COLUMNS) rows.push(lists.slice(i, i + GRID_NUM_COLUMNS))
    return rows.map((row, rowIndex) => (
      <View key={`${baseIndex}-${rowIndex}`} style={styles.gridRow}>
        {row.map((item, colIndex) => renderCard(item, baseIndex + rowIndex * GRID_NUM_COLUMNS + colIndex))}
        {row.length < GRID_NUM_COLUMNS ? <View key="grid-row-fill" style={styles.gridRowFill} /> : null}
      </View>
    ))
  }, [renderCard])

  return (
    <View style={styles.container}>
      {/* 顶部工具栏 */}
      <View style={[styles.toolbar, { borderBottomColor: theme['c-border-background'] }]}>
        <Text style={styles.toolbarTitle} size={17} numberOfLines={1} color={theme['c-button-font']}>
          {t('list_title_my_lists')}
        </Text>
        <TouchableOpacity style={styles.toolbarBtn} onPress={toggleViewMode}>
          <Icon color={theme['c-button-font']} name={viewMode == 'list' ? 'album' : 'menu'} size={18} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarBtn} onPress={onCreate}>
          <Icon color={theme['c-button-font']} name="add_folder" size={20} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarBtn} onPress={onManage}>
          <Icon color={theme['c-button-font']} name="dots-vertical" size={18} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {/* 置顶英雄区：我喜欢 + 默认列表 */}
        {fixedLists.length ? (
          <View style={styles.heroSection}>
            <View style={styles.heroRow}>
              {fixedLists.map((item) => (
                <HeroCard
                  key={item.id}
                  item={item}
                  count={counts[item.id]}
                  coverUrl={covers[item.id]}
                  active={activeListId == item.id}
                  playing={playMusicInfo.listId == item.id}
                  onPress={handlePress}
                  onPlayList={handlePlayList}
                  onShowMenu={onShowMenu}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* 自建歌单区 */}
        <View style={styles.userSection}>
          <View style={[styles.sectionHeader, { backgroundColor: theme['c-content-background'] }]}>
            <Text size={13} style={{ fontWeight: 'bold' }} color={theme['c-font-label']}>
              {t('list_group_user')}
            </Text>
            {userLists.length ? (
              <Text size={11} color={theme['c-350']} style={{ marginLeft: 6 }}>
                ({userLists.length})
              </Text>
            ) : null}
          </View>

          {userLists.length ? (
            viewMode == 'grid'
              ? <View style={styles.gridContent}>{renderGridRows(userLists, fixedLists.length)}</View>
              : <View style={styles.listContainer}>{userLists.map((item, i) => renderCard(item, fixedLists.length + i))}</View>
          ) : (
            <View style={styles.emptyContainer}>
              <Icon name="album" size={42} color={theme['c-350']} />
              <Text size={13} style={styles.emptyText} color={theme['c-font-label']}>
                {t('list_empty_user_tip')}
              </Text>
              <View style={styles.emptyActionsRow}>
                <Button style={[styles.emptyBtn, { borderColor: theme['c-primary-font'] }]} onPress={onCreate}>
                  <Icon name="add_folder" size={14} color={theme['c-primary-font']} style={{ marginRight: 6 }} />
                  <Text size={13} color={theme['c-primary-font']}>{t('list_create_playlist')}</Text>
                </Button>
                {onImport ? (
                  <Button style={[styles.emptyBtn, { borderColor: theme['c-border-background'], marginLeft: scaleSizeW(10) }]} onPress={onImport}>
                    <Icon name="download-2" size={14} color={theme['c-button-font']} style={{ marginRight: 6 }} />
                    <Text size={13} color={theme['c-button-font']}>{t('list_import_playlist')}</Text>
                  </Button>
                ) : null}
              </View>
            </View>
          )}
        </View>
      </ScrollView>
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
  listContent: {
    paddingBottom: scaleSizeH(16),
  },

  // 英雄区样式
  heroSection: {
    paddingHorizontal: scaleSizeW(10),
    paddingTop: scaleSizeH(10),
    paddingBottom: scaleSizeH(6),
  },
  heroRow: {
    flexDirection: 'row',
    gap: scaleSizeW(10),
  },
  heroItem: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: scaleSizeW(12),
    minHeight: HERO_ITEM_HEIGHT,
    justifyContent: 'space-between',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroIconWrap: {
    width: scaleSizeW(34),
    height: scaleSizeW(34),
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroCoverImage: {
    width: '100%',
    height: '100%',
  },
  heroPlayingBadge: {
    marginLeft: 6,
  },
  heroMoreBtn: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTitle: {
    fontWeight: 'bold',
    marginTop: 4,
    marginBottom: 2,
  },
  heroBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroPlayBtn: {
    width: scaleSizeW(30),
    height: scaleSizeW(30),
    borderRadius: scaleSizeW(15),
    justifyContent: 'center',
    alignItems: 'center',
  },

  // 自建歌单区样式
  userSection: {
    marginTop: scaleSizeH(4),
  },
  sectionHeader: {
    height: scaleSizeH(32),
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: scaleSizeW(12),
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: scaleSizeH(36),
    paddingHorizontal: scaleSizeW(20),
  },
  emptyText: {
    marginTop: scaleSizeH(10),
    marginBottom: scaleSizeH(14),
    textAlign: 'center',
  },
  emptyActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: scaleSizeH(6),
    paddingHorizontal: scaleSizeW(16),
  },

  // 网格视图
  gridContent: {
    paddingHorizontal: scaleSizeW(10),
    paddingTop: scaleSizeH(4),
    paddingBottom: scaleSizeH(12),
  },
  gridRow: {
    flexDirection: 'row',
    gap: scaleSizeW(10),
    marginBottom: scaleSizeH(10),
  },
  gridRowFill: {
    flex: 1,
  },
  gridItem: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: scaleSizeW(12),
    minHeight: GRID_ITEM_HEIGHT,
    justifyContent: 'space-between',
  },
  gridTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gridCoverWrap: {
    width: scaleSizeW(32),
    height: scaleSizeW(32),
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridCoverImage: {
    width: '100%',
    height: '100%',
  },
  gridPlayingBadge: {
    marginLeft: 4,
  },
  gridMoreBtn: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridName: {
    marginVertical: 4,
  },
  gridBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gridCountText: {
    flex: 1,
    marginRight: 6,
  },
  gridPlayBtn: {
    width: scaleSizeW(28),
    height: scaleSizeW(28),
    justifyContent: 'center',
    alignItems: 'center',
  },

  // 清单视图
  listContainer: {
    flexDirection: 'column',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    height: LIST_ITEM_HEIGHT,
    paddingLeft: scaleSizeW(12),
    paddingRight: scaleSizeW(4),
    borderBottomWidth: BorderWidths.normal,
  },
  listCoverWrap: {
    width: scaleSizeW(36),
    height: scaleSizeW(36),
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listCoverImage: {
    width: '100%',
    height: '100%',
  },
  listPlayingBadge: {
    marginLeft: 4,
  },
  listInfo: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    paddingLeft: scaleSizeW(8),
    paddingRight: scaleSizeW(4),
  },
  listPlayBtn: {
    width: scaleSizeW(40),
    height: LIST_ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listMoreBtn: {
    width: scaleSizeW(36),
    height: LIST_ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
