import { useRef, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react'
import { Animated, View, TouchableOpacity } from 'react-native'

import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { BorderWidths } from '@/theme'

export interface MultipleActionBarProps {
  onAdd: () => void
  onMove: () => void
  onRemove: () => void
}
export interface MultipleActionBarType {
  show: () => void
  hide: () => void
  setVisibleBar: (visible: boolean) => void
  setCount: (count: number) => void
}

/**
 * 多选模式底部动作栏（Material 风格 bottom action bar）
 * 仅在多选模式显示，悬浮于播放条之上
 */
export default forwardRef<MultipleActionBarType, MultipleActionBarProps>(({ onAdd, onMove, onRemove }, ref) => {
  const [visible, setVisible] = useState(false)
  const [animatePlayed, setAnimatPlayed] = useState(true)
  const [visibleBar, setVisibleBar] = useState(true)
  const [count, setCount] = useState(0)
  const animFade = useRef(new Animated.Value(0)).current
  const animTranslateY = useRef(new Animated.Value(20)).current
  const theme = useTheme()

  useImperativeHandle(ref, () => ({
    show() {
      handleShow()
    },
    hide() {
      handleHide()
    },
    setVisibleBar(visible) {
      setVisibleBar(visible)
    },
    setCount(count) {
      setCount(count)
    },
  }))

  const handleShow = useCallback(() => {
    if (visible) return
    setVisible(true)
    setAnimatPlayed(false)
    requestAnimationFrame(() => {
      animFade.setValue(0)
      animTranslateY.setValue(20)
      Animated.parallel([
        Animated.timing(animFade, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(animTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => { setAnimatPlayed(true) })
    })
  }, [visible, animFade, animTranslateY])

  const handleHide = useCallback(() => {
    setAnimatPlayed(false)
    Animated.parallel([
      Animated.timing(animFade, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(animTranslateY, { toValue: 20, duration: 200, useNativeDriver: true }),
    ]).start(finished => {
      if (!finished) return
      setVisible(false)
      setAnimatPlayed(true)
    })
  }, [animFade, animTranslateY])

  const animaStyle = useMemo(() => ({
    ...styles.container,
    opacity: visibleBar ? animFade : 0,
    pointerEvents: visibleBar ? 'auto' : 'none',
    transform: [{ translateY: animTranslateY }],
  } as const), [animFade, animTranslateY, visibleBar])

  const disabled = count == 0
  const renderBtn = (label: string, onPress: () => void) => (
    <TouchableOpacity
      style={styles.btn}
      disabled={disabled}
      onPress={onPress}
    >
      <Text size={15} color={disabled ? theme['c-350'] : theme['c-primary-font']}>{label}</Text>
    </TouchableOpacity>
  )

  const component = useMemo(() => (
    <Animated.View style={animaStyle}>
      <View style={styles.btnGroup}>
        {renderBtn(global.i18n.t('add_to'), onAdd)}
        <View style={styles.divider} />
        {renderBtn(global.i18n.t('move_to'), onMove)}
        <View style={styles.divider} />
        {renderBtn(global.i18n.t('delete'), onRemove)}
      </View>
    </Animated.View>
  ), [animaStyle, count, theme, onAdd, onMove, onRemove])

  return !visible && animatePlayed ? null : component
})

const styles = createStyle({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: BorderWidths.normal,
    height: 48,
    justifyContent: 'center',
    zIndex: 10,
  },
  btnGroup: {
    flexDirection: 'row',
    height: '100%',
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(128,128,128,0.25)',
  },
})
