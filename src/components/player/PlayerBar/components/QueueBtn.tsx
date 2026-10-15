import { useCallback, useRef, useState } from 'react'
import { TouchableOpacity, View } from 'react-native'

import { Icon } from '@/components/common/Icon'
import Modal, { type ModalType } from '@/components/common/Modal'
import { useTheme } from '@/store/theme/hook'
import { useHorizontalMode } from '@/utils/hooks'
import { createStyle } from '@/utils/tools'
import { scaleSizeH, scaleSizeW } from '@/utils/pixelRatio'
import { BorderWidths } from '@/theme'
import { useRoamingStatus } from '@/core/roaming'
// 分层例外（roaming-plan §3.5）：播放栏按钮复用漫游页的队列面板内容组件
import QueuePanel from '@/screens/Home/Views/Roaming/QueuePanel'

/**
 * 漫游播放列表按钮（roaming-plan §3.5）
 * 仅漫游进行中且竖屏时渲染（横屏走漫游页右侧常驻栏），非漫游态零布局变化
 * 点击呼出底部弹层，内容与横屏侧栏共用 QueuePanel
 */
export default () => {
  const theme = useTheme()
  const status = useRoamingStatus()
  const isHorizontal = useHorizontalMode()
  const modalRef = useRef<ModalType>(null)
  const [visible, setVisible] = useState(false)

  const handleOpen = useCallback(() => {
    setVisible(true)
    requestAnimationFrame(() => { modalRef.current?.setVisible(true) })
  }, [])
  const handleClose = useCallback(() => {
    modalRef.current?.setVisible(false)
  }, [])
  const handleHide = useCallback(() => {
    setVisible(false)
  }, [])

  if (isHorizontal || !status.active) return null

  return (
    <>
      <TouchableOpacity
        style={styles.button}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        onPress={handleOpen}
      >
        <Icon name="list-order" size={20} color={theme['c-button-font']} />
      </TouchableOpacity>
      {visible ? (
        <Modal ref={modalRef} bgHide={true} bgColor="rgba(0,0,0,0.45)" onHide={handleHide}>
          <View style={styles.sheetContainer}>
            <View style={[styles.sheetContent, { backgroundColor: theme['c-content-background'] }]}>
              {/* 漫游被停止时 QueuePanel 经 onClose 自动收起 */}
              <QueuePanel onClose={handleClose} />
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  )
}

const styles = createStyle({
  button: {
    width: scaleSizeW(38),
    height: scaleSizeH(38),
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    height: '60%',
    paddingTop: scaleSizeH(10),
    paddingBottom: scaleSizeH(10),
    borderTopWidth: BorderWidths.normal,
    elevation: 8,
  },
})
