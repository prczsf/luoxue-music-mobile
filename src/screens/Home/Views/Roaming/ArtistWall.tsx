import { useCallback, useState } from 'react'
import { TouchableOpacity, View } from 'react-native'

import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import Loading from '@/components/common/Loading'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
import { scaleSizeH, scaleSizeW } from '@/utils/pixelRatio'
import { refresh, startArtists, type RoamingIndex, type RoamingStatus } from '@/core/roaming'
import SpectrumBars from './SpectrumBars'

/**
 * 常听歌手墙（roaming-plan §3.4）
 * - Top 9 磁贴：点击单艺人起播；激活态高亮+频谱，再点换一批
 * - 第 10 格「一起听」：进入多选点亮态 → 浮出起播按钮（n=0 禁用）
 * - 起播成功后退出点亮态；空态显示引导文案
 */
const MULTI_RULE_MARK = ','

export default ({ status, index }: { status: RoamingStatus, index: RoamingIndex | null }) => {
  const theme = useTheme()
  const t = useI18n()
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [loadingName, setLoadingName] = useState<string | null>(null)

  const artists = index?.topArtists ?? []
  const multiActive = !!status.active && status.ruleKey?.startsWith('artist:') && status.ruleKey.includes(MULTI_RULE_MARK)

  const toggleSelect = (name: string) => {
    setSelected(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])
  }

  const runStart = useCallback(async(key: string, names: string[]) => {
    setLoadingName(key)
    try {
      const ok = await startArtists(names)
      if (ok) {
        setSelectMode(false)
        setSelected([])
      } else {
        toast(t('roaming_start_failed'))
      }
    } finally {
      setLoadingName(null)
    }
  }, [t])

  const handleArtistPress = (name: string) => {
    if (selectMode) {
      toggleSelect(name)
      return
    }
    if (loadingName) return
    const active = status.active && status.ruleKey == `artist:${name}`
    if (active) {
      setLoadingName(name)
      void refresh().then(ok => { if (!ok) toast(t('roaming_start_failed')) }).finally(() => { setLoadingName(null) })
      return
    }
    void runStart(name, [name])
  }

  const handleMultiPress = () => {
    if (selectMode) {
      setSelectMode(false)
      setSelected([])
      return
    }
    setSelectMode(true)
    setSelected([])
  }

  const handleStartMulti = () => {
    if (!selected.length || loadingName) return
    void runStart('__multi__', selected)
  }

  if (!index) {
    return (
      <View style={styles.section}>
        <SectionHeader count={0} />
        <View style={styles.loadingBox}><Loading size={18} /></View>
      </View>
    )
  }

  if (!artists.length) {
    return (
      <View style={styles.section}>
        <SectionHeader count={0} />
        <View style={styles.emptyBox}>
          <Icon name="album" size={36} color={theme['c-350']} />
          <Text size={13} style={styles.emptyText} color={theme['c-font-label']}>
            {t('roaming_empty_local')}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.section}>
      <SectionHeader count={artists.length} />
      <View style={[styles.grid, { paddingBottom: selectMode ? scaleSizeH(58) : scaleSizeH(10) }]}>
        {artists.map((artist) => {
          const active = status.active && status.ruleKey == `artist:${artist.name}`
          const isSelected = selected.includes(artist.name)
          const isLoading = loadingName == artist.name
          return (
            <TouchableOpacity
              key={artist.name}
              style={[
                styles.tile,
                {
                  borderColor: active ? theme['c-primary-font'] : theme['c-border-background'],
                  backgroundColor: active ? theme['c-primary-background-active'] : theme['c-content-background'],
                },
              ]}
              activeOpacity={0.75}
              onPress={() => { handleArtistPress(artist.name) }}
            >
              <View style={styles.tileTopRow}>
                <Text numberOfLines={1} size={13} style={styles.tileName} color={active ? theme['c-primary-font'] : theme['c-font']}>
                  {artist.name}
                </Text>
                {selectMode
                  ? (
                      <Icon
                        name={isSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={15}
                        color={isSelected ? theme['c-primary-font'] : theme['c-350']}
                      />
                    )
                  : isLoading
                    ? <Loading size={12} color={theme['c-primary-font']} />
                    : active
                      ? <SpectrumBars color={theme['c-primary-font']} />
                      : null
                }
              </View>
              <Text numberOfLines={1} size={11} color={theme['c-font-label']}>
                {t('roaming_artist_local_count', { num: artist.count })}
              </Text>
            </TouchableOpacity>
          )
        })}

        {/* 第 10 格：一起听（多选混播入口） */}
        <TouchableOpacity
          style={[
            styles.tile,
            styles.multiTile,
            {
              borderColor: multiActive ? theme['c-primary-font'] : theme['c-border-background'],
              backgroundColor: selectMode
                ? theme['c-primary-background-active']
                : multiActive
                  ? theme['c-primary-background-active']
                  : theme['c-content-background'],
            },
          ]}
          activeOpacity={0.75}
          onPress={handleMultiPress}
        >
          <View style={styles.multiIconWrap}>
            <Icon
              name={selectMode ? 'close' : 'checkbox-marked'}
              size={20}
              color={selectMode || multiActive ? theme['c-primary-font'] : theme['c-font-label']}
            />
          </View>
          <Text numberOfLines={1} size={13} style={{ fontWeight: 'bold' }} color={selectMode || multiActive ? theme['c-primary-font'] : theme['c-font']}>
            {t('roaming_listen_together')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 多选浮出起播按钮 */}
      {selectMode ? (
        <View style={styles.floatWrap} pointerEvents="box-none">
          <TouchableOpacity
            style={[
              styles.startBtn,
              {
                backgroundColor: theme['c-primary-background-active'],
                borderColor: theme['c-primary-font'],
                opacity: selected.length ? 1 : 0.45,
              },
            ]}
            activeOpacity={0.75}
            disabled={!selected.length || !!loadingName}
            onPress={handleStartMulti}
          >
            {loadingName == '__multi__'
              ? <Loading size={13} color={theme['c-primary-font']} />
              : <Icon name="play-outline" size={15} color={theme['c-primary-font']} />
            }
            <Text size={14} style={{ fontWeight: 'bold' }} color={theme['c-primary-font']}>
              {t('roaming_listen_together_start', { num: selected.length })}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  )
}

const SectionHeader = ({ count }: { count: number }) => {
  const theme = useTheme()
  const t = useI18n()
  return (
    <View style={[styles.sectionHeader, { backgroundColor: theme['c-content-background'] }]}>
      <Text size={13} style={{ fontWeight: 'bold' }} color={theme['c-font-label']}>
        {t('roaming_artist_section')}
      </Text>
      {count ? (
        <Text size={11} color={theme['c-350']} style={{ marginLeft: 6 }}>
          ({count})
        </Text>
      ) : null}
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
    position: 'relative',
  },
  tile: {
    width: '31%',
    borderWidth: 1,
    borderRadius: 10,
    padding: scaleSizeW(10),
    minHeight: scaleSizeH(64),
    justifyContent: 'space-between',
  },
  tileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tileName: {
    flex: 1,
    fontWeight: 'bold',
  },
  multiTile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  multiIconWrap: {
    marginBottom: scaleSizeH(4),
  },
  floatWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: scaleSizeH(18),
    alignItems: 'center',
    zIndex: 10,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: scaleSizeH(8),
    paddingHorizontal: scaleSizeW(18),
    elevation: 4,
  },
  loadingBox: {
    paddingVertical: scaleSizeH(30),
    alignItems: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: scaleSizeH(30),
    paddingHorizontal: scaleSizeW(20),
  },
  emptyText: {
    marginTop: scaleSizeH(8),
    textAlign: 'center',
  },
})
