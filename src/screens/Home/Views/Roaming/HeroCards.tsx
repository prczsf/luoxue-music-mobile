import { useCallback, useState } from 'react'
import { StyleSheet, TouchableOpacity, View, type GestureResponderEvent } from 'react-native'

import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import Loading from '@/components/common/Loading'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
import { scaleSizeH, scaleSizeW } from '@/utils/pixelRatio'
import {
  refresh,
  startLibrary,
  startHotMix,
  getHotMixRatio,
  setHotMixRatio,
  getHotMixPercent,
  HOT_MIX_RATIOS,
  type HotMixRatio,
  type RoamingIndex,
  type RoamingStatus,
} from '@/core/roaming'
import SpectrumBars from './SpectrumBars'

/**
 * Hero 卡片区（roaming-plan §3.3）
 * - 全部歌曲：一击起播；激活态高亮 + 频谱动画 +「重新洗牌」按钮；再点卡片 = 换一批
 * - 熟歌热歌（P2）：常听老歌 + 榜单新歌；底部三档胶囊只改后续续杯比例，不重播
 * - 右上角过滤入口：弹出排除歌单弹层（与工具栏同一入口）
 * - 空态（总歌 <5）：半透明遮罩 + 引导文案，点击滚到下方风格盲盒
 */
export default ({ status, index, onScrollToGenre, onOpenFilter }: {
  status: RoamingStatus
  index: RoamingIndex | null
  onScrollToGenre: () => void
  onOpenFilter: () => void
}) => {
  const theme = useTheme()
  const t = useI18n()
  const [loading, setLoading] = useState(false)
  const [hotLoading, setHotLoading] = useState(false)
  const [ratio, setRatio] = useState<HotMixRatio>(getHotMixRatio())
  const totalSongs = index?.totalSongs ?? 0
  const isEmpty = !!index && totalSongs < 5
  const active = status.active && status.ruleKey == 'library'
  const hotActive = status.active && status.ruleKey == 'hotmix'
  const percent = getHotMixPercent(ratio)

  const handlePress = useCallback(() => {
    if (loading) return
    setLoading(true)
    void (async() => {
      try {
        const ok = active ? await refresh() : await startLibrary()
        if (!ok) toast(t('roaming_start_failed'))
      } finally {
        setLoading(false)
      }
    })()
  }, [active, loading, t])

  const handleHotMixPress = useCallback(() => {
    if (hotLoading) return
    setHotLoading(true)
    void (async() => {
      try {
        const ok = hotActive ? await refresh() : await startHotMix()
        if (!ok) toast(t('roaming_start_failed'))
      } finally {
        setHotLoading(false)
      }
    })()
  }, [hotActive, hotLoading, t])

  const handleRatioPress = useCallback((id: HotMixRatio) => {
    // 只改后续续杯比例，不重播当前窗口
    setHotMixRatio(id)
    setRatio(id)
  }, [])

  const handleEmptyPress = (e: GestureResponderEvent) => {
    e.stopPropagation?.()
    onScrollToGenre()
  }

  return (
    <View style={styles.heroWrap}>
      <TouchableOpacity
        style={[
          styles.heroItem,
          {
            borderColor: active ? theme['c-primary-font'] : theme['c-border-background'],
            backgroundColor: active ? theme['c-primary-background-active'] : theme['c-content-background'],
          },
        ]}
        activeOpacity={0.75}
        disabled={isEmpty}
        onPress={handlePress}
      >
        <View style={styles.heroTopRow}>
          <View style={[styles.heroIconWrap, { backgroundColor: theme['c-primary-background-hover'] }]}>
            <Icon name="list-random" size={20} color={active ? theme['c-primary-font'] : theme['c-font']} />
          </View>
          <View style={{ flex: 1 }} />
          {loading
            ? <Loading size={14} color={theme['c-primary-font']} />
            : active
              ? <SpectrumBars color={theme['c-primary-font']} />
              : <Icon name="play-outline" size={16} color={theme['c-350']} />
          }
          {active && !loading ? (
            <TouchableOpacity
              style={[styles.reshuffleBtn, { borderColor: theme['c-primary-font'] }]}
              activeOpacity={0.75}
              onPress={(e) => { e.stopPropagation?.(); handlePress() }}
            >
              <Icon name="list-random" size={11} color={theme['c-primary-font']} />
              <Text size={11} color={theme['c-primary-font']}>{t('roaming_reshuffle')}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.filterBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
            onPress={(e) => { e.stopPropagation?.(); onOpenFilter() }}
          >
            <Icon name="slider" size={15} color={active ? theme['c-primary-font'] : theme['c-350']} />
          </TouchableOpacity>
        </View>

        <Text numberOfLines={1} size={16} style={styles.heroTitle} color={active ? theme['c-primary-font'] : theme['c-font']}>
          {t('roaming_hero_library')}
        </Text>
        <Text numberOfLines={1} size={12} color={theme['c-font-label']}>
          {index ? t('roaming_hero_library_desc', { lists: index.participatingLists, num: index.totalSongs }) : ' '}
        </Text>

        {isEmpty ? (
          <TouchableOpacity style={styles.emptyMask} activeOpacity={0.85} onPress={handleEmptyPress}>
            <Icon name="album" size={30} color={theme['c-350']} />
            <Text size={13} style={styles.emptyText} color={theme['c-font-label']}>
              {t('roaming_empty_local')}
            </Text>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>

      {/* 熟歌热歌（P2）：常听老歌 + 榜单新歌 */}
      <TouchableOpacity
        style={[
          styles.heroItem,
          styles.heroItemHot,
          {
            borderColor: hotActive ? theme['c-primary-font'] : theme['c-border-background'],
            backgroundColor: hotActive ? theme['c-primary-background-active'] : theme['c-content-background'],
          },
        ]}
        activeOpacity={0.75}
        onPress={handleHotMixPress}
      >
        <View style={styles.heroTopRow}>
          <View style={[styles.heroIconWrap, { backgroundColor: theme['c-primary-background-hover'] }]}>
            <Icon name="leaderboard" size={20} color={hotActive ? theme['c-primary-font'] : theme['c-font']} />
          </View>
          <View style={{ flex: 1 }} />
          {hotLoading
            ? <Loading size={14} color={theme['c-primary-font']} />
            : hotActive
              ? <SpectrumBars color={theme['c-primary-font']} />
              : <Icon name="play-outline" size={16} color={theme['c-350']} />
          }
        </View>

        <Text numberOfLines={1} size={16} style={styles.heroTitle} color={hotActive ? theme['c-primary-font'] : theme['c-font']}>
          {t('roaming_hero_hotmix')}
        </Text>
        <Text numberOfLines={1} size={12} color={theme['c-font-label']}>
          {t('roaming_hotmix_desc', { local: percent.local, hot: percent.hot })}
        </Text>

        <View style={styles.ratioRow}>
          {HOT_MIX_RATIOS.map(item => {
            const selected = item.id == ratio
            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.ratioChip,
                  {
                    borderColor: selected ? theme['c-primary-font'] : theme['c-border-background'],
                    backgroundColor: selected ? theme['c-primary-background-active'] : 'transparent',
                  },
                ]}
                activeOpacity={0.7}
                onPress={(e) => { e.stopPropagation?.(); handleRatioPress(item.id) }}
              >
                <Text size={11} color={selected ? theme['c-primary-font'] : theme['c-font-label']}>
                  {t(item.labelKey)}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </TouchableOpacity>
    </View>
  )
}

const styles = createStyle({
  heroItem: {
    borderWidth: 1,
    borderRadius: 12,
    padding: scaleSizeW(14),
    minHeight: scaleSizeH(118),
    justifyContent: 'space-between',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reshuffleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: scaleSizeW(8),
    paddingVertical: scaleSizeH(3),
    marginLeft: scaleSizeW(6),
  },
  filterBtn: {
    marginLeft: scaleSizeW(6),
    width: 26,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroIconWrap: {
    width: scaleSizeW(36),
    height: scaleSizeW(36),
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroTitle: {
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 2,
  },
  emptyMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    marginTop: scaleSizeH(6),
    textAlign: 'center',
    paddingHorizontal: scaleSizeW(16),
  },
  heroWrap: {
    gap: scaleSizeH(10),
  },
  heroItemHot: {
    minHeight: scaleSizeH(104),
  },
  ratioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scaleSizeW(6),
    marginTop: scaleSizeH(8),
  },
  ratioChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: scaleSizeW(10),
    paddingVertical: scaleSizeH(3),
  },
})
