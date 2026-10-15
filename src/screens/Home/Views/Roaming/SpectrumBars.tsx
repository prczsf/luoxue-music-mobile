import { useEffect, useRef } from 'react'
import { Animated, View, StyleSheet } from 'react-native'

/**
 * 激活态频谱小动画（roaming-plan §3.7：激活态呼吸边框 + 频谱条动画）
 * 纯布局高度动画，无需原生驱动；父级负责在未激活时卸载本组件
 */
const BAR_COUNT = 4
const BAR_WIDTH = 3
const BAR_MIN_HEIGHT = 4
const BAR_MAX_HEIGHT = 15

export default ({ color }: { color: string }) => {
  const values = useRef(Array.from({ length: BAR_COUNT }, () => new Animated.Value(BAR_MIN_HEIGHT))).current

  useEffect(() => {
    const anims = values.map((value, i) => {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(value, { toValue: BAR_MAX_HEIGHT, duration: 280 + i * 70, useNativeDriver: false }),
          Animated.timing(value, { toValue: BAR_MIN_HEIGHT, duration: 280 + i * 70, useNativeDriver: false }),
        ]),
      )
      anim.start()
      return anim
    })
    return () => { anims.forEach(anim => { anim.stop() }) }
  }, [values])

  return (
    <View style={styles.container}>
      {values.map((value, i) => (
        <Animated.View key={i} style={[styles.bar, { height: value, backgroundColor: color }]} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: BAR_MAX_HEIGHT,
    gap: 2,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: 1.5,
  },
})
