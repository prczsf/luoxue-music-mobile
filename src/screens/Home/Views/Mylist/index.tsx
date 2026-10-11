import { useCallback, useRef } from 'react'
import { View } from 'react-native'

import { createStyle } from '@/utils/tools'
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'
import listState from '@/store/list/state'
import { getListMusics, updateUserListPosition } from '@/core/list'
import { playList } from '@/core/player/player'

import MylistWall from './MylistWall'
import ListMenu, { type ListMenuType, type Position } from './MyList/ListMenu'
import ListNameEdit, { type ListNameEditType } from './MyList/ListNameEdit'
import ListMusicSort, { type ListMusicSortType } from './MyList/ListMusicSort'
import DuplicateMusic, { type DuplicateMusicType } from './MyList/DuplicateMusic'
import ListImportExport, { type ListImportExportType } from './MyList/ListImportExport'
import { handleRemove, handleSync } from './MyList/listAction'

/**
 * 我的列表页（歌单墙）
 * - 清单/网格展示歌单：名+歌曲数+更新时间；点卡片 push 详情页；卡片播放按钮直接播该歌单
 * - 长按/[...]菜单复用歌单操作；右上角新建；管理入口进 LIST_MANAGE_SCREEN
 */
export default () => {
  const listMenuRef = useRef<ListMenuType>(null)
  const listNameEditRef = useRef<ListNameEditType>(null)
  const listMusicSortRef = useRef<ListMusicSortType>(null)
  const duplicateMusicRef = useRef<DuplicateMusicType>(null)
  const listImportExportRef = useRef<ListImportExportType>(null)

  const handleOpenDetail = useCallback((listInfo: LX.List.MyListInfo) => {
    navigations.pushMylistDetailScreen(commonState.componentIds.home!, listInfo.id)
  }, [])

  const handlePlayList = useCallback((listInfo: LX.List.MyListInfo) => {
    void getListMusics(listInfo.id).then(list => {
      if (!list.length) return
      void playList(listInfo.id, 0)
    })
  }, [])

  const handleShowMenu = useCallback((info: { listInfo: LX.List.MyListInfo, index: number }, position: Position) => {
    listMenuRef.current?.show(info, position)
  }, [])

  const handleCreate = useCallback(() => {
    listNameEditRef.current?.showCreate(listState.userList.length)
  }, [])

  const handleManage = useCallback(() => {
    navigations.pushListManageScreen(commonState.componentIds.home!)
  }, [])

  const handleMovePosition = useCallback((listInfo: LX.List.UserListInfo, direction: 'up' | 'down') => {
    const index = listState.userList.findIndex(l => l.id == listInfo.id)
    if (index < 0) return
    const position = direction == 'up' ? index - 1 : index + 1
    if (position < 0 || position >= listState.userList.length) return
    void updateUserListPosition(position, [listInfo.id])
  }, [])

  return (
    <View style={styles.container}>
      <MylistWall
        onOpenDetail={handleOpenDetail}
        onPlayList={handlePlayList}
        onShowMenu={handleShowMenu}
        onCreate={handleCreate}
        onManage={handleManage}
      />
      <ListNameEdit ref={listNameEditRef} />
      <ListMusicSort ref={listMusicSortRef} />
      <DuplicateMusic ref={duplicateMusicRef} />
      <ListImportExport ref={listImportExportRef} />
      <ListMenu
        ref={listMenuRef}
        onNew={index => listNameEditRef.current?.showCreate(index)}
        onRename={info => listNameEditRef.current?.show(info)}
        onSort={info => listMusicSortRef.current?.show(info)}
        onDuplicateMusic={info => duplicateMusicRef.current?.show(info)}
        onImport={(info, position) => listImportExportRef.current?.import(info, position)}
        onExport={(info, position) => listImportExportRef.current?.export(info, position)}
        onRemove={info => { handleRemove(info) }}
        onSync={info => { handleSync(info) }}
        onSelectLocalFile={(info, position) => listImportExportRef.current?.selectFile(info, position)}
        onMovePosition={handleMovePosition}
      />
    </View>
  )
}

const styles = createStyle({
  container: {
    flex: 1,
    flexDirection: 'column',
  },
})
