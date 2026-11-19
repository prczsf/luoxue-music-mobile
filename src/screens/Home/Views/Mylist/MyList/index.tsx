import { useRef } from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Navigation } from 'react-native-navigation'

import { Icon } from '@/components/common/Icon'
import PageHeader from '@/components/PageHeader'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { scaleSizeH } from '@/utils/pixelRatio'
import { useI18n } from '@/lang'
import listState from '@/store/list/state'
import { setActiveList, updateUserListPosition } from '@/core/list'

import ListMenu, { type ListMenuType } from './ListMenu'
import ListNameEdit, { type ListNameEditType } from './ListNameEdit'
import List from './List'
import ListImportExport, { type ListImportExportType } from './ListImportExport'
import { handleRemove, handleSync } from './listAction'
import ListMusicSort, { type ListMusicSortType } from './ListMusicSort'
import DuplicateMusic, { type DuplicateMusicType } from './DuplicateMusic'
import FailureMusicModal, { type FailureMusicModalType } from './FailureMusicModal'

/**
 * 歌单管理页（独立页面，从曲目页头部 [⋮] 进入，back 返回曲目页）
 * - 分组：固定列表（试听/收藏） / 我的歌单（含歌曲数）
 * - 右上角 [+] 新建歌单；行 [⋮] 支持上移/下移 等操作
 * - 点击行：切换到该列表并自动返回曲目页
 */
export default ({ componentId }: { componentId: string }) => {
  const theme = useTheme()
  const t = useI18n()
  const listMenuRef = useRef<ListMenuType>(null)
  const listNameEditRef = useRef<ListNameEditType>(null)
  const listMusicSortRef = useRef<ListMusicSortType>(null)
  const duplicateMusicRef = useRef<DuplicateMusicType>(null)
  const failureMusicModalRef = useRef<FailureMusicModalType>(null)
  const listImportExportRef = useRef<ListImportExportType>(null)

  const handleBack = () => {
    void Navigation.pop(componentId)
  }
  const handleCreate = () => {
    listNameEditRef.current?.showCreate(listState.userList.length)
  }
  const handleSelect = (listInfo: LX.List.MyListInfo) => {
    setActiveList(listInfo.id)
    void Navigation.pop(componentId)
  }
  const handleMovePosition = (listInfo: LX.List.UserListInfo, direction: 'up' | 'down') => {
    const index = listState.userList.findIndex(l => l.id == listInfo.id)
    if (index < 0) return
    const position = direction == 'up' ? index - 1 : index + 1
    if (position < 0 || position >= listState.userList.length) return
    void updateUserListPosition(position, [listInfo.id])
  }

  return (
    <View style={[styles.container, { backgroundColor: theme['c-content-background'] }]}>
      <PageHeader
        title={t('list_manage')}
        onBack={handleBack}
        right={<TouchableOpacity style={styles.headerBtn} onPress={handleCreate}>
          <Icon name="add_folder" size={20} color={theme['c-button-font']} />
        </TouchableOpacity>}
      />
      <List
        onShowMenu={(info, position) => listMenuRef.current?.show(info, position)}
        onSelect={handleSelect}
      />
      <ListNameEdit ref={listNameEditRef} />
      <ListMusicSort ref={listMusicSortRef} />
      <DuplicateMusic ref={duplicateMusicRef} />
      <FailureMusicModal ref={failureMusicModalRef} />
      <ListImportExport ref={listImportExportRef} />
      <ListMenu
        ref={listMenuRef}
        onNew={index => listNameEditRef.current?.showCreate(index)}
        onRename={info => listNameEditRef.current?.show(info)}
        onSort={info => listMusicSortRef.current?.show(info)}
        onDuplicateMusic={info => duplicateMusicRef.current?.show(info)}
        onCleanFailureMusic={info => failureMusicModalRef.current?.show(info)}
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
  headerBtn: {
    width: scaleSizeH(48),
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
})
