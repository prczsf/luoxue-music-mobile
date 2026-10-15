import { useCallback, useRef, useState } from 'react'
import { Animated, Easing, TouchableOpacity, View } from 'react-native'

import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import Loading from '@/components/common/Loading'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
import { scaleSizeH, scaleSizeW } from '@/utils/pixelRatio'
import { GENRE_PRESETS, refresh, startGenre, startLibrary, type RoamingStatus } from '@/core/roaming'
import SpectrumBars from './SpectrumBars'

/**
 * 风格盲盒墙（roaming-plan §4.1/§4.2）
 * - 2 列色块：图标 + 风格名，点击按风格从在线歌单取歌起播
 * - 激活态高亮 + 频谱动画，再点换一批
 * - 失败：色块轻抖 + 提示 + 自动回退全库漫游（绝不卡死）
 */
const SHAKE_DISTANCE = 5
const SHAKE_DURATION = 320

export default ({ status }: { status: RoamingStatus }) => {
  const theme = useTheme()
  const t = useI18n()
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const shakeAnim = useRef(new Animated.Value(0)).current

  const shake = useCallback(() => {
    shakeAnim.setValue(0)
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: -SHAKE_DISTANCE, duration: SHAKE_DURATION / 4, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: SHAKE_DISTANCE, duration: SHAKE_DURATION / 2, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: SHAKE_DURATION / 4, easing: Easing.linear, useNativeDriver: true }),
    ]).start()
  }, [shakeAnim])

  const handlePress = (id: string) => {
    if (loadingId) return
    const active = status.active && status.ruleKey == `genre:${id}`
    setLoadingId(id)
    void (async() => {
      try {
        const ok = active ? await refresh() : await startGenre(id)
        if (!ok) throw new Error('start failed')
      } catch {
        // 取不到歌：轻抖 + 提示 + 自动回退全库漫游
        shake()
        toast(t('roaming_genre_fallback'))
        try {
          const ok = await startLibrary()
          if (!ok) toast(t('roaming_start_failed'))
        } catch {
          toast(t('roaming_start_failed'))
        }
      } finally {
        setLoadingId(null)
      }
    })()
  }

  return (
    <View style={styles.section}>
      <View style={[styles.sectionHeader, { backgroundColor: theme['c-content-background'] }]}>
        <Text size={13} style={{ fontWeight: 'bold' }} color={theme['c-font-label']}>
          {t('roaming_genre_section')}
        </Text>
      </View>
      <Animated.View style={[styles.grid, { transform: [{ translateX: shakeAnim }] }]}>
        {GENRE_PRESETS.map(preset => {
          const active = status.active && status.ruleKey == `genre:${preset.id}`
          const isLoading = loadingId == preset.id
          return (
            <TouchableOpacity
              key={preset.id}
              style={[
                styles.tile,
                {
                  borderColor: active ? theme['c-primary-font'] : theme['c-border-background'],
                  backgroundColor: active ? theme['c-primary-background-active'] : preset.tint,
                },
              ]}
              activeOpacity={0.75}
              disabled={!!loadingId}
              onPress={() => { handlePress(preset.id) }}
            >
              <View style={styles.tileTopRow}>
                <View style={[styles.iconWrap, { backgroundColor: preset.tint }]}>
                  <Icon name={preset.icon} size={16} color={preset.color} />
                </View>
                <View style={{ flex: 1 }} />
                {isLoading
                  ? <Loading size={12} color={theme['c-primary-font']} />
                  : active
                    ? <SpectrumBars color={theme['c-primary-font']} />
                    : <Icon name="play-outline" size={13} color={theme['c-350']} />
                }
              </View>
              <Text numberOfLines={1} size={14} style={styles.tileName} color={active ? theme['c-primary-font'] : theme['c-font']}>
                {t(preset.nameKey)}
              </Text>
            </TouchableOpacity>
          )
        })}
      </Animated.View>
    </View>
  )
}

const styles = createStyle({
  section: {
    marginTop: scaleSizeH(12),
  },
  sectionHeader: {
    height: scaleSizeH(32),
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: scaleSizeW(12),
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scaleSizeW(10),
    paddingHorizontal: scaleSizeW(10),
    paddingTop: scaleSizeH(10),
    paddingBottom: scaleSizeH(10),
  },
  tile: {
    width: '47.5%',
    borderWidth: 1,
    borderRadius: 12,
    padding: scaleSizeW(12),
    minHeight: scaleSizeH(76),
    justifyContent: 'space-between',
  },
  tileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: scaleSizeW(28),
    height: scaleSizeW(28),
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileName: {
    fontWeight: 'bold',
    marginTop: scaleSizeH(6),
  },
})
