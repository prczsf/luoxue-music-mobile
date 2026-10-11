import { useCallback, useRef } from 'react'
import { TouchableOpacity, View } from 'react-native'

import ListMenu, { type ListMenuType, type Position, type SelectInfo } from '../Home/Views/Mylist/MusicList/ListMenu'
import { clearMusicUrl, downloadMusicFile, handleDislikeMusic, handlePlay, handlePlayLater, handleRemove, handleShare, handleShowMusicSourceDetail, handleUpdateMusicInfo, handleUpdateMusicPosition } from '../Home/Views/Mylist/MusicList/listAction'
import List, { type ListType } from '../Home/Views/Mylist/MusicList/List'
import ListMusicAdd, { type MusicAddModalType as ListMusicAddType } from '@/components/MusicAddModal'
import ListMusicMultiAdd, { type MusicMultiAddModalType as ListAddMultiType } from '@/components/MusicMultiAddModal'
import { createStyle, toast, checkStoragePermissions, requestStoragePermission } from '@/utils/tools'
import { type LayoutChangeEvent } from 'react-native'
import MultipleModeBar, { type SelectMode, type MultipleModeBarType } from '../Home/Views/Mylist/MusicList/MultipleModeBar'
import MultipleActionBar, { type MultipleActionBarType } from '../Home/Views/Mylist/MusicList/MultipleActionBar'
import ListSearchBar, { type ListSearchBarType } from '../Home/Views/Mylist/MusicList/ListSearchBar'
import ListMusicSearch, { type ListMusicSearchType } from '../Home/Views/Mylist/MusicList/ListMusicSearch'
import MusicPositionModal, { type MusicPositionModalType } from '../Home/Views/Mylist/MusicList/MusicPositionModal'
import MetadataEditModal, { type MetadataEditType, type MetadataEditProps } from '@/components/MetadataEditModal'
import MusicToggleModal, { type MusicToggleModalType } from '../Home/Views/Mylist/MusicList/MusicToggleModal'
import DownloadQualityModal, { type DownloadQualityModalType } from '../Home/Views/Mylist/MusicList/DownloadQualityModal'
import { getDownloadDir } from '@/core/downloadPath'
import { getListMusicSync } from '@/utils/listManage'
import { getListMusics } from '@/core/list'
import { playList } from '@/core/player/player'
import { useListFetching } from '@/store/list/hook'
import { useTheme } from '@/store/theme/hook'
import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { BorderWidths } from '@/theme'
import { scaleSizeW } from '@/utils/pixelRatio'

/**
 * 歌单详情歌曲编排器（详情页专用）
 * - 与 Home MusicList 能力对齐：播放/播放全部/搜索/多选批量/单曲菜单/下载
 * - 数据源固定为 props.listId；详情 index 已 setActiveList(listId)，全局事件链路天然打通
 */
export default ({ listId }: { listId: string }) => {
  const theme = useTheme()
  const t = useI18n()
  const fetching = useListFetching(listId)
  const listMusicSearchRef = useRef<ListMusicSearchType>(null)
  const listRef = useRef<ListType>(null)
  const multipleModeBarRef = useRef<MultipleModeBarType>(null)
  const multipleActionBarRef = useRef<MultipleActionBarType>(null)
  const listSearchBarRef = useRef<ListSearchBarType>(null)
  const listMusicAddRef = useRef<ListMusicAddType>(null)
  const listMusicMultiAddRef = useRef<ListAddMultiType>(null)
  const musicPositionModalRef = useRef<MusicPositionModalType>(null)
  const metadataEditTypeRef = useRef<MetadataEditType>(null)
  const listMenuRef = useRef<ListMenuType>(null)
  const musicToggleModalRef = useRef<MusicToggleModalType>(null)
  const downloadQualityModalRef = useRef<DownloadQualityModalType>(null)
  const layoutHeightRef = useRef<number>(0)
  const isShowMultipleModeBar = useRef(false)
  const isShowSearchBarModeBar = useRef(false)
  const selectedInfoRef = useRef<SelectInfo>()

  const hancelMultiSelect = useCallback(() => {
    if (isShowSearchBarModeBar.current) {
      multipleModeBarRef.current?.setVisibleBar(false)
    }
    isShowMultipleModeBar.current = true
    multipleModeBarRef.current?.show()
    multipleActionBarRef.current?.show()
    listRef.current?.setIsMultiSelectMode(true)
  }, [])
  const hancelExitSelect = useCallback(() => {
    if (isShowSearchBarModeBar.current) {
      multipleModeBarRef.current?.setVisibleBar(true)
    }
    multipleModeBarRef.current?.exitSelectMode()
    multipleActionBarRef.current?.hide()
    listRef.current?.setIsMultiSelectMode(false)
    isShowMultipleModeBar.current = false
  }, [])
  const hancelSwitchSelectMode = useCallback((mode: SelectMode) => {
    multipleModeBarRef.current?.setSwitchMode(mode)
    listRef.current?.setSelectMode(mode)
  }, [])
  const hancelScrollToTop = useCallback(() => {
    listRef.current?.scrollToTop()
  }, [])

  const showMenu = useCallback((musicInfo: LX.Music.MusicInfo, index: number, position: Position) => {
    listMenuRef.current?.show({
      musicInfo,
      index,
      listId,
      single: false,
      selectedList: listRef.current!.getSelectedList(),
    }, position)
  }, [listId])
  const handleShowSearch = useCallback(() => {
    isShowSearchBarModeBar.current = true
    if (isShowMultipleModeBar.current) {
      multipleModeBarRef.current?.setVisibleBar(false)
      multipleActionBarRef.current?.setVisibleBar(false)
    }
    listSearchBarRef.current?.show()
  }, [])
  const handleExitSearch = useCallback(() => {
    isShowSearchBarModeBar.current = false
    listMusicSearchRef.current?.hide()
    listSearchBarRef.current?.hide()
    if (isShowMultipleModeBar.current) {
      multipleModeBarRef.current?.setVisibleBar(true)
      multipleActionBarRef.current?.setVisibleBar(true)
    }
  }, [])
  const handlePlaySearch = useCallback((info: LX.Music.MusicInfo) => {
    const list = getListMusicSync(listId)
    const index = list.findIndex(m => m.id == info.id)
    if (index < 0) return
    handlePlay(listId, index)
    handleExitSearch()
  }, [handleExitSearch, listId])
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    layoutHeightRef.current = e.nativeEvent.layout.height
  }, [])

  const handlePlayAll = useCallback(() => {
    if (fetching) return
    void getListMusics(listId).then(list => {
      if (!list.length) return
      void playList(listId, 0)
    })
  }, [fetching, listId])

  const handleAddMusic = useCallback((info: SelectInfo) => {
    if (info.selectedList.length) {
      listMusicMultiAddRef.current?.show({ selectedList: info.selectedList, listId: info.listId, isMove: false })
    } else {
      listMusicAddRef.current?.show({ musicInfo: info.musicInfo, listId: info.listId, isMove: false })
    }
  }, [])
  const handleMoveMusic = useCallback((info: SelectInfo) => {
    if (info.selectedList.length) {
      listMusicMultiAddRef.current?.show({ selectedList: info.selectedList, listId: info.listId, isMove: true })
    } else {
      listMusicAddRef.current?.show({ musicInfo: info.musicInfo, listId: info.listId, isMove: true })
    }
  }, [])
  const getSelectedInfo = useCallback((): SelectInfo | null => {
    const selectedList = listRef.current?.getSelectedList() ?? []
    if (!selectedList.length) return null
    return { musicInfo: selectedList[0], index: 0, listId, single: false, selectedList }
  }, [listId])
  const handleBarAdd = useCallback(() => {
    const info = getSelectedInfo()
    if (info) handleAddMusic(info)
  }, [getSelectedInfo, handleAddMusic])
  const handleBarMove = useCallback(() => {
    const info = getSelectedInfo()
    if (info) handleMoveMusic(info)
  }, [getSelectedInfo, handleMoveMusic])
  const handleBarRemove = useCallback(() => {
    const info = getSelectedInfo()
    if (info) handleRemove(info.listId, info.musicInfo, info.selectedList, hancelExitSelect)
  }, [getSelectedInfo, hancelExitSelect])
  const runDownload = useCallback((info: SelectInfo, quality?: LX.Quality) => {
    void (async() => {
      const granted = await checkStoragePermissions() || await requestStoragePermission()
      if (!granted) {
        toast(global.i18n.t('storage_permission_tip_disagree'), 'long')
        return
      }
      selectedInfoRef.current = info
      const dir = await getDownloadDir()
      void downloadMusicFile(info.musicInfo, dir, quality)
    })()
  }, [])
  const handleDownload = useCallback((info: SelectInfo) => {
    runDownload(info)
  }, [runDownload])
  const handleDownloadQuality = useCallback((info: SelectInfo) => {
    downloadQualityModalRef.current?.show(info)
  }, [])
  const handleDownloadQualityConfirm = useCallback((info: SelectInfo, quality: LX.Quality) => {
    runDownload(info, quality)
  }, [runDownload])
  const handleEditMetadata = useCallback((info: SelectInfo) => {
    if (info.musicInfo.source != 'local') return
    selectedInfoRef.current = info
    metadataEditTypeRef.current?.show(info.musicInfo.meta.filePath)
  }, [])
  const handleUpdateMetadata = useCallback<MetadataEditProps['onUpdate']>((info) => {
    if (!selectedInfoRef.current || selectedInfoRef.current.musicInfo.source != 'local') return
    handleUpdateMusicInfo(selectedInfoRef.current.listId, selectedInfoRef.current.musicInfo, info)
  }, [])


  return (
    <View style={styles.container}>
      <View style={{ zIndex: 2 }}>
        <View style={[styles.actionRow, { borderBottomColor: theme['c-border-background'] }]}>
          <TouchableOpacity style={styles.actionBtn} onPress={handlePlayAll}>
            <Icon color={theme['c-button-font']} name="play-outline" size={20} />
            <Text size={14} color={theme['c-button-font']}>{t('play_all')}</Text>
          </TouchableOpacity>
          <View style={styles.actionSpacer} />
          <TouchableOpacity style={styles.actionBtn} onPress={handleShowSearch}>
            <Icon color={theme['c-button-font']} name="search-2" size={18} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={hancelScrollToTop}>
            <Icon color={theme['c-button-font']} name="chevron-right-2" size={18} />
          </TouchableOpacity>
        </View>
        <MultipleModeBar
          ref={multipleModeBarRef}
          onSwitchMode={hancelSwitchSelectMode}
          onSelectAll={isAll => listRef.current?.selectAll(isAll)}
          onExitSelectMode={hancelExitSelect}
        />
        <ListSearchBar
          ref={listSearchBarRef}
          onSearch={keyword => listMusicSearchRef.current?.search(keyword, layoutHeightRef.current)}
          onExitSearch={handleExitSearch}
        />
      </View>
      <View style={{ flex: 1 }} onLayout={onLayout}>
        <List
          ref={listRef}
          onShowMenu={showMenu}
          onMuiltSelectMode={hancelMultiSelect}
          onSelectAll={isAll => multipleModeBarRef.current?.setIsSelectAll(isAll)}
          onSelectCountChange={count => multipleActionBarRef.current?.setCount(count)}
        />
        <ListMusicSearch
          ref={listMusicSearchRef}
          onPlay={handlePlaySearch}
        />
        <MultipleActionBar
          ref={multipleActionBarRef}
          onAdd={handleBarAdd}
          onMove={handleBarMove}
          onRemove={handleBarRemove}
        />
      </View>
      <ListMusicAdd ref={listMusicAddRef} onAdded={hancelExitSelect} />
      <ListMusicMultiAdd ref={listMusicMultiAddRef} onAdded={hancelExitSelect} />
      <MusicPositionModal ref={musicPositionModalRef}
        onUpdatePosition={(info, postion) => { handleUpdateMusicPosition(postion, info.listId, info.musicInfo, info.selectedList, hancelExitSelect) }} />
      <ListMenu
        ref={listMenuRef}
        onPlay={info => { handlePlay(info.listId, info.index) }}
        onPlayLater={info => { hancelExitSelect(); handlePlayLater(info.listId, info.musicInfo, info.selectedList, hancelExitSelect) }}
        onRemove={info => { hancelExitSelect(); handleRemove(info.listId, info.musicInfo, info.selectedList, hancelExitSelect) }}
        onDislikeMusic={info => { void handleDislikeMusic(info.musicInfo) }}
        onCopyName={info => { handleShare(info.musicInfo) }}
        onMusicSourceDetail={info => { void handleShowMusicSourceDetail(info.musicInfo) }}
        onAdd={handleAddMusic}
        onMove={handleMoveMusic}
        onEditMetadata={handleEditMetadata}
        onChangePosition={info => musicPositionModalRef.current?.show(info)}
        onToggleSource={info => musicToggleModalRef.current?.show(info)}
        onRemoveCache={info => { void clearMusicUrl(info.musicInfo) }}
        onDownload={handleDownload}
        onDownloadQuality={handleDownloadQuality}
      />
      <MetadataEditModal
        ref={metadataEditTypeRef}
        onUpdate={handleUpdateMetadata}
      />
      <MusicToggleModal ref={musicToggleModalRef} />
      <DownloadQualityModal ref={downloadQualityModalRef} onConfirm={handleDownloadQualityConfirm} />
    </View>
  )
}

const styles = createStyle({
  container: {
    flex: 1,
    flexDirection: 'column',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingLeft: scaleSizeW(8),
    paddingRight: scaleSizeW(8),
    borderBottomWidth: BorderWidths.normal,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: '100%',
    justifyContent: 'center',
  },
  actionSpacer: {
    flex: 1,
  },
})
