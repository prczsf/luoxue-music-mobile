import { useRef, useImperativeHandle, forwardRef, useState, useCallback, memo, useEffect } from 'react'
import { FlatList, TouchableOpacity, View, type FlatListProps as _FlatListProps } from 'react-native'
import Dialog, { type DialogType } from '@/components/common/Dialog'
import Text from '@/components/common/Text'
import CheckBox from '@/components/common/CheckBox'
import ButtonPrimary from '@/components/common/ButtonPrimary'
import Button from '@/components/common/Button'
import { Icon } from '@/components/common/Icon'
import { getListMusics, removeListMusics } from '@/core/list'
import { LIST_IDS } from '@/config/constant'
import {
  DEFAULT_FAILURE_CLEANUP_THRESHOLD,
  listSuspectFailureMusics,
  removePlayFailureByIds,
  type SuspectFailureMusic,
} from '@/core/player/playFailureStats'
import { playList } from '@/core/player/player'
import playerState from '@/store/player/state'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { useUnmounted } from '@/utils/hooks'
import { scaleSizeH } from '@/utils/pixelRatio'
import { createStyle, toast } from '@/utils/tools'

type FlatListProps = _FlatListProps<SuspectFailureMusic>
const ITEM_HEIGHT = scaleSizeH(60)

const ListItem = memo(({ item, checked, onToggle, onPlay }: {
  item: SuspectFailureMusic
  checked: boolean
  onToggle: (id: string) => void
  onPlay: (item: SuspectFailureMusic) => void
}) => {
  const theme = useTheme()
  const t = useI18n()

  return (
    <View
      style={{
        ...styles.listItem,
        height: ITEM_HEIGHT,
        backgroundColor: checked ? theme['c-primary-background-hover'] : 'transparent',
      }}
      onStartShouldSetResponder={() => true}
    >
      <View style={styles.checkboxWrap}>
        <CheckBox check={checked} onChange={() => { onToggle(item.musicInfo.id) }} size={0.9} />
      </View>
      <TouchableOpacity style={styles.listItemInfo} onPress={() => { onToggle(item.musicInfo.id) }}>
        <Text color={theme['c-font']} size={14} numberOfLines={1}>{item.musicInfo.name}</Text>
        <Text color={theme['c-font-label']} size={12} numberOfLines={1}>
          {item.musicInfo.singer}
          {item.stats.reason ? ` · ${item.stats.reason}` : ''}
        </Text>
      </TouchableOpacity>
      <View style={styles.listItemRight}>
        <Text size={12} color="#ff5252" style={styles.countText}>
          {t('list_clean_unplayable_count', { count: item.stats.count })}
        </Text>
        <Button style={styles.playBtn} onPress={() => { onPlay(item) }}>
          <Icon name="play-outline" style={{ color: theme['c-button-font'] }} size={17} />
        </Button>
      </View>
    </View>
  )
}, (prev, next) => prev.item === next.item && prev.checked === next.checked)

const Content = ({ listInfo, onDone }: {
  listInfo: LX.List.MyListInfo
  onDone: () => void
}) => {
  const theme = useTheme()
  const t = useI18n()
  const isUnmountedRef = useUnmounted()
  const [items, setItems] = useState<SuspectFailureMusic[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void getListMusics(listInfo.id).then(async(list) => {
      const currentPlayingId = playerState.playMusicInfo.musicInfo?.id ?? null
      const suspects = await listSuspectFailureMusics(
        list,
        DEFAULT_FAILURE_CLEANUP_THRESHOLD,
        currentPlayingId,
      )
      if (isUnmountedRef.current) return
      setItems(suspects)
      setSelectedIds(new Set(suspects.map(s => s.musicInfo.id)))
      setLoaded(true)
    })
  }, [isUnmountedRef, listInfo.id])

  const handleToggle = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleToggleAll = useCallback(() => {
    setSelectedIds(prev => {
      if (prev.size == items.length) return new Set()
      return new Set(items.map(s => s.musicInfo.id))
    })
  }, [items])

  const handlePlay = useCallback((item: SuspectFailureMusic) => {
    void getListMusics(listInfo.id).then((list) => {
      const idx = list.findIndex(m => m.id == item.musicInfo.id)
      if (idx < 0) return
      void playList(listInfo.id, idx)
    })
  }, [listInfo.id])

  const handleRemoveSelected = useCallback(() => {
    if (!selectedIds.size) return
    const ids = Array.from(selectedIds)
    void removeListMusics(listInfo.id, ids).then(async() => {
      await removePlayFailureByIds(ids)
      toast(t('list_clean_unplayable_done', { num: ids.length }))
      onDone()
    })
  }, [listInfo.id, onDone, selectedIds, t])

  const renderItem = useCallback(({ item }: { item: SuspectFailureMusic }) => (
    <ListItem
      item={item}
      checked={selectedIds.has(item.musicInfo.id)}
      onToggle={handleToggle}
      onPlay={handlePlay}
    />
  ), [handlePlay, handleToggle, selectedIds])

  const keyExtractor = useCallback<NonNullable<FlatListProps['keyExtractor']>>(item => item.musicInfo.id, [])
  const getItemLayout = useCallback<NonNullable<FlatListProps['getItemLayout']>>((_data, index) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  }), [])

  const isAllSelected = items.length > 0 && selectedIds.size == items.length
  const listName = listInfo.id == LIST_IDS.DEFAULT
    ? t('list_name_default')
    : listInfo.id == LIST_IDS.LOVE
      ? t('list_name_love')
      : listInfo.name

  return (
    <>
      <Text style={styles.title} size={15}>
        {t('list_clean_unplayable_title', { name: listName, num: items.length })}
      </Text>
      {
        !loaded ? null : items.length ? (
          <>
            <FlatList
              style={styles.list}
              maxToRenderPerBatch={6}
              windowSize={8}
              removeClippedSubviews={true}
              initialNumToRender={12}
              data={items}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              getItemLayout={getItemLayout}
            />
            <View style={[styles.footer, { borderTopColor: theme['c-border-background'] }]}>
              <ButtonPrimary onPress={handleToggleAll}>
                {isAllSelected ? t('list_clean_unplayable_deselect_all') : t('list_clean_unplayable_select_all')}
              </ButtonPrimary>
              <ButtonPrimary disabled={!selectedIds.size} onPress={handleRemoveSelected}>
                {t('list_clean_unplayable_remove_btn', { num: selectedIds.size })}
              </ButtonPrimary>
            </View>
          </>
        ) : (
          <View style={styles.empty}>
            <Text color={theme['c-font-label']}>
              {t('list_clean_unplayable_empty', { count: DEFAULT_FAILURE_CLEANUP_THRESHOLD })}
            </Text>
          </View>
        )
      }
    </>
  )
}

export interface FailureMusicModalType {
  show: (info: LX.List.MyListInfo) => void
}

const Modal = forwardRef<FailureMusicModalType, {}>((_props, ref) => {
  const [info, setInfo] = useState<LX.List.MyListInfo | null>(null)
  const dialogRef = useRef<DialogType>(null)

  useImperativeHandle(ref, () => ({
    show(listInfo) {
      setInfo(listInfo)
      requestAnimationFrame(() => {
        dialogRef.current?.setVisible(true)
      })
    },
  }))

  const handleHide = useCallback(() => {
    requestAnimationFrame(() => {
      setInfo(null)
    })
  }, [])

  const handleDone = useCallback(() => {
    dialogRef.current?.setVisible(false)
  }, [])

  return (
    <Dialog ref={dialogRef} onHide={handleHide}>
      {info ? <Content listInfo={info} onDone={handleDone} /> : null}
    </Dialog>
  )
})

export default forwardRef<FailureMusicModalType, {}>((_props, ref) => {
  const modalRef = useRef<FailureMusicModalType>(null)
  const [visible, setVisible] = useState(false)

  useImperativeHandle(ref, () => ({
    show(listInfo) {
      if (visible) modalRef.current?.show(listInfo)
      else {
        setVisible(true)
        requestAnimationFrame(() => {
          modalRef.current?.show(listInfo)
        })
      }
    },
  }))

  return visible ? <Modal ref={modalRef} /> : null
})

const styles = createStyle({
  title: {
    textAlign: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  list: {
    flexGrow: 0,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 8,
  },
  checkboxWrap: {
    flex: 0,
  },
  listItemInfo: {
    flex: 1,
    paddingRight: 8,
    gap: 2,
  },
  listItemRight: {
    flex: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countText: {
    paddingHorizontal: 4,
  },
  playBtn: {
    padding: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingVertical: 10,
    paddingLeft: 12,
    borderTopWidth: 0.5,
  },
  empty: {
    paddingVertical: 35,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
})
