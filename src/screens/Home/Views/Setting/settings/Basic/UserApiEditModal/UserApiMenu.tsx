import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'

import Menu, { type Menus, type MenuType, type Position } from '@/components/common/Menu'
import { useI18n } from '@/lang'
import { getUserApiScriptPrev } from '@/utils/data'

export interface UserApiMenuType {
  show: (info: LX.UserApi.UserApiInfo, position: Position) => void
}

export interface UserApiMenuProps {
  onCopyUrl: (info: LX.UserApi.UserApiInfo) => void
  onRefresh: (info: LX.UserApi.UserApiInfo) => void
  onDetail: (info: LX.UserApi.UserApiInfo) => void
  onSetUrl: (info: LX.UserApi.UserApiInfo) => void
  onRestorePrev: (info: LX.UserApi.UserApiInfo) => void
  onRemove: (info: LX.UserApi.UserApiInfo) => void
}

export default forwardRef<UserApiMenuType, UserApiMenuProps>((props, ref) => {
  const t = useI18n()
  const [visible, setVisible] = useState(false)
  const [menus, setMenus] = useState<Menus>([])
  const menuRef = useRef<MenuType>(null)
  const infoRef = useRef<LX.UserApi.UserApiInfo | null>(null)

  const buildMenus = useCallback((info: LX.UserApi.UserApiInfo, hasPrev: boolean): Menus => {
    const menu: Array<Menus[number]> = []
    // 没有记录地址的源（本地导入 / 旧版本导入）不显示复制与重新拉取，避免给出点不动的入口
    if (info.url) {
      menu.push({ action: 'copyUrl', label: t('user_api_copy_url') })
      menu.push({ action: 'refresh', label: t('user_api_refresh') })
    }
    menu.push({ action: 'detail', label: t('user_api_detail') })
    if (!info.url) menu.push({ action: 'setUrl', label: t('user_api_set_url') })
    if (hasPrev) menu.push({ action: 'restorePrev', label: t('user_api_restore_prev') })
    menu.push({ action: 'remove', label: t('list_remove') })
    return menu
  }, [t])

  useImperativeHandle(ref, () => ({
    show(info, position) {
      infoRef.current = info
      // 「恢复上一版」依赖上一版脚本是否存在，先读一次再组菜单
      void getUserApiScriptPrev(info.id).then(prev => {
        setMenus(buildMenus(info, !!prev))
        if (!visible) setVisible(true)
        requestAnimationFrame(() => {
          menuRef.current?.show(position)
        })
      })
    },
  }), [buildMenus, visible])

  const handleMenuPress = ({ action }: Menus[number]) => {
    const info = infoRef.current
    if (!info) return
    switch (action) {
      case 'copyUrl':
        props.onCopyUrl(info)
        break
      case 'refresh':
        props.onRefresh(info)
        break
      case 'detail':
        props.onDetail(info)
        break
      case 'setUrl':
        props.onSetUrl(info)
        break
      case 'restorePrev':
        props.onRestorePrev(info)
        break
      case 'remove':
        props.onRemove(info)
        break
      default:
        break
    }
  }

  return (
    visible
      ? <Menu ref={menuRef} menus={menus} onPress={handleMenuPress} />
      : null
  )
})
