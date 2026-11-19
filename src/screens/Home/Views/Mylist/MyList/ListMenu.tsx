import { useRef, useImperativeHandle, forwardRef, useState } from 'react'
import { TouchableOpacity, View, ScrollView } from 'react-native'
import { useI18n } from '@/lang'
import Modal, { type ModalType } from '@/components/common/Modal'
import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import { LIST_IDS } from '@/config/constant'
import musicSdk from '@/utils/musicSdk'
import { scaleSizeH, scaleSizeW } from '@/utils/pixelRatio'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import listState from '@/store/list/state'

export interface SelectInfo {
  listInfo: LX.List.MyListInfo
  index: number
}

const initSelectInfo = {}

export type Position = { x: number, y: number, w: number, h: number }

export interface ListMenuProps {
  onRename: (listInfo: LX.List.UserListInfo) => void
  onSort: (listInfo: LX.List.MyListInfo) => void
  onDuplicateMusic: (listInfo: LX.List.MyListInfo) => void
  onCleanFailureMusic?: (listInfo: LX.List.MyListInfo) => void
  onImport: (listInfo: LX.List.MyListInfo, index: number) => void
  onExport: (listInfo: LX.List.MyListInfo, index: number) => void
  onSync: (listInfo: LX.List.UserListInfo) => void
  onSelectLocalFile: (listInfo: LX.List.MyListInfo, index: number) => void
  onRemove: (listInfo: LX.List.UserListInfo) => void
  onNew?: (position: number) => void
  onMovePosition?: (listInfo: LX.List.UserListInfo, direction: 'up' | 'down') => void
}

export interface ListMenuType {
  show: (selectInfo: SelectInfo, position?: Position) => void
}

interface ActionItem {
  key: string
  label: string
  icon: string
  danger?: boolean
  disabled?: boolean
  handler: () => void
}

export default forwardRef<ListMenuType, ListMenuProps>(({
  onRename,
  onSort,
  onDuplicateMusic,
  onCleanFailureMusic,
  onImport,
  onExport,
  onSync,
  onSelectLocalFile,
  onRemove,
}, ref) => {
  const t = useI18n()
  const theme = useTheme()
  const modalRef = useRef<ModalType>(null)
  const selectInfoRef = useRef<SelectInfo>(initSelectInfo as SelectInfo)
  const [listInfo, setListInfo] = useState<LX.List.MyListInfo | null>(null)
  const [visible, setVisible] = useState(false)

  useImperativeHandle(ref, () => ({
    show(selectInfo) {
      selectInfoRef.current = selectInfo
      setListInfo(selectInfo.listInfo)
      setVisible(true)
      requestAnimationFrame(() => {
        modalRef.current?.setVisible(true)
      })
    },
  }))

  const handleClose = () => {
    modalRef.current?.setVisible(false)
  }

  const getListName = (item: LX.List.MyListInfo | null): string => {
    if (!item) return ''
    if (item.id == LIST_IDS.DEFAULT) return t('list_name_default')
    if (item.id == LIST_IDS.LOVE) return t('list_name_love')
    return item.name
  }

  const isFixed = listInfo?.id == LIST_IDS.DEFAULT || listInfo?.id == LIST_IDS.LOVE

  const getActions = (): ActionItem[] => {
    if (!listInfo) return []
    const info = selectInfoRef.current

    if (isFixed) {
      // 内置列表：仅显示对它们有意义的操作，彻底删除置灰的重命名/删除/上下移
      return [
        {
          key: 'sort',
          label: t('list_sort'),
          icon: 'slider',
          handler: () => { handleClose(); onSort(listInfo) },
        },
        {
          key: 'duplicateMusic',
          label: t('lists__duplicate'),
          icon: 'help',
          handler: () => { handleClose(); onDuplicateMusic(listInfo) },
        },
        ...(onCleanFailureMusic ? [{
          key: 'cleanFailureMusic',
          label: t('list_clean_unplayable'),
          icon: 'remove',
          handler: () => { handleClose(); onCleanFailureMusic(listInfo) },
        }] : []),
        {
          key: 'local_file',
          label: t('list_select_local_file'),
          icon: 'sd-card',
          disabled: !!listState.fetchingListStatus[listInfo.id],
          handler: () => { handleClose(); onSelectLocalFile(listInfo, info.index) },
        },
        {
          key: 'import',
          label: t('list_import'),
          icon: 'add_folder',
          handler: () => { handleClose(); onImport(listInfo, info.index) },
        },
        {
          key: 'export',
          label: t('list_export'),
          icon: 'share',
          handler: () => { handleClose(); onExport(listInfo, info.index) },
        },
      ]
    }

    // 用户自建列表
    const userList = listInfo as LX.List.UserListInfo
    const canSync = !!(userList.source && musicSdk[userList.source]?.songList)
    const isFetching = !!listState.fetchingListStatus[listInfo.id]

    const actions: ActionItem[] = [
      {
        key: 'rename',
        label: t('list_rename'),
        icon: 'album',
        handler: () => { handleClose(); onRename(userList) },
      },
      {
        key: 'sort',
        label: t('list_sort'),
        icon: 'slider',
        handler: () => { handleClose(); onSort(listInfo) },
      },
      {
        key: 'duplicateMusic',
        label: t('lists__duplicate'),
        icon: 'help',
        handler: () => { handleClose(); onDuplicateMusic(listInfo) },
      },
      ...(onCleanFailureMusic ? [{
        key: 'cleanFailureMusic',
        label: t('list_clean_unplayable'),
        icon: 'remove',
        handler: () => { handleClose(); onCleanFailureMusic(listInfo) },
      }] : []),
    ]

    if (canSync) {
      actions.push({
        key: 'sync',
        label: t('list_sync'),
        icon: 'available_updates',
        disabled: isFetching,
        handler: () => { handleClose(); onSync(userList) },
      })
    }

    actions.push(
      {
        key: 'local_file',
        label: t('list_select_local_file'),
        icon: 'sd-card',
        disabled: isFetching,
        handler: () => { handleClose(); onSelectLocalFile(listInfo, info.index) },
      },
      {
        key: 'import',
        label: t('list_import'),
        icon: 'add_folder',
        handler: () => { handleClose(); onImport(listInfo, info.index) },
      },
      {
        key: 'export',
        label: t('list_export'),
        icon: 'share',
        handler: () => { handleClose(); onExport(listInfo, info.index) },
      },
      {
        key: 'remove',
        label: t('list_remove'),
        icon: 'remove',
        danger: true,
        handler: () => {
          handleClose()
          if (!listInfo || isFixed) return
          onRemove(listInfo as LX.List.UserListInfo)
        },
      },
    )

    return actions
  }

  return (
    <>
      {visible ? (
        <Modal
          ref={modalRef}
          bgHide={true}
          bgColor="rgba(0,0,0,0.45)"
          onHide={() => { setVisible(false) }}
        >
          <View style={styles.sheetContainer}>
            <View style={[styles.sheetContent, { backgroundColor: theme['c-content-background'] }]}>
              {/* 抽屉顶部：歌单概要 */}
              <View style={[styles.sheetHeader, { borderBottomColor: theme['c-border-background'] }]}>
                <View style={styles.headerIconWrap}>
                  <Icon
                    name={listInfo?.id == LIST_IDS.LOVE ? 'love' : 'album'}
                    size={20}
                    color={listInfo?.id == LIST_IDS.LOVE ? theme['c-primary-font'] : theme['c-font']}
                  />
                </View>
                <View style={styles.headerTextWrap}>
                  <Text size={15} numberOfLines={1} style={{ fontWeight: 'bold' }} color={theme['c-font']}>
                    {getListName(listInfo)}
                  </Text>
                </View>
                <TouchableOpacity style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={handleClose}>
                  <Icon name="close" size={16} color={theme['c-350']} />
                </TouchableOpacity>
              </View>

              {/* 动作选项列表 */}
              <ScrollView style={styles.actionList} bounces={false}>
                {getActions().map((action) => (
                  <TouchableOpacity
                    key={action.key}
                    style={[
                      styles.actionItem,
                      {
                        borderBottomColor: theme['c-border-background'],
                        opacity: action.disabled ? 0.45 : 1,
                      },
                    ]}
                    activeOpacity={0.65}
                    disabled={action.disabled}
                    onPress={action.handler}
                  >
                    <View style={styles.actionIconWrap}>
                      <Icon
                        name={action.icon}
                        size={17}
                        color={action.danger ? '#ff5252' : theme['c-button-font']}
                      />
                    </View>
                    <Text
                      size={14}
                      color={action.danger ? '#ff5252' : theme['c-font']}
                      style={styles.actionLabel}
                    >
                      {action.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  )
})

const styles = createStyle({
  sheetContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '75%',
    paddingBottom: scaleSizeH(20),
    elevation: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scaleSizeW(16),
    paddingVertical: scaleSizeH(14),
    borderBottomWidth: 1,
  },
  headerIconWrap: {
    marginRight: scaleSizeW(10),
  },
  headerTextWrap: {
    flex: 1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionList: {
    paddingHorizontal: scaleSizeW(16),
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: scaleSizeH(13),
    borderBottomWidth: 0.5,
  },
  actionIconWrap: {
    width: scaleSizeW(28),
    alignItems: 'center',
    marginRight: scaleSizeW(12),
  },
  actionLabel: {
    flex: 1,
  },
})
