import { memo, useEffect, useRef } from 'react'
import { ScrollView, TouchableOpacity, View } from 'react-native'

import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { chooseDialog, createStyle, toast } from '@/utils/tools'
import { scaleSizeH, scaleSizeW } from '@/utils/pixelRatio'
import { BorderWidths } from '@/theme'
import { LIST_IDS } from '@/config/constant'
import { playList } from '@/core/player/player'
import { addDislikeInfo } from '@/core/dislikeList'
import { blockSingers } from '@/core/blockSinger'
import { splitSingers } from '@/utils/singer'
import { removeAt, stop } from '@/core/roaming'
import { useRoamingStatus } from './state'

/**
 * 播放列表面板（roaming-plan §3.5）
 * 竖屏弹层 / 横屏侧栏共用的内容组件：
 * 标题（当前第几首/共几首）→ 结束漫游 → 最近听过（置灰可回溯）→ 当前播放（高亮）→ 接下来播放
 * - 不想听：剔出列表并自动补一首（当前播放行不显示该按钮）
 * - 长按「不再播放」：写入不听名单，之后永不再播（确认弹窗 + 提示）
 */

interface MusicRowProps {
  musicInfo: LX.Music.MusicInfo
  /** 窗口内绝对下标 */
  index: number
  variant: 'recent' | 'current' | 'upcoming'
  onPressRecent?: (index: number) => void
  onDislike?: (index: number) => void
  onBlock?: (musicInfo: LX.Music.MusicInfo) => void
}

const MusicRow = memo(({ musicInfo, index, variant, onPressRecent, onDislike, onBlock }: MusicRowProps) => {
  const theme = useTheme()
  const t = useI18n()
  const isCurrent = variant == 'current'
  const handlePress = () => {
    if (variant == 'recent') onPressRecent?.(index)
  }
  const handleLongPress = () => {
    if (variant == 'upcoming') onBlock?.(musicInfo)
  }
  return (
    <TouchableOpacity
      style={[
        styles.row,
        {
          borderBottomColor: theme['c-border-background'],
          backgroundColor: isCurrent ? theme['c-primary-background-active'] : 'transparent',
          opacity: variant == 'recent' ? 0.45 : 1,
        },
      ]}
      activeOpacity={0.7}
      onPress={variant == 'recent' ? handlePress : undefined}
      onLongPress={variant == 'upcoming' ? handleLongPress : undefined}
    >
      {isCurrent ? <View style={[styles.playingBar, { backgroundColor: theme['c-primary-font'] }]} /> : null}
      <View style={styles.rowInfo}>
        <Text numberOfLines={1} size={14} color={isCurrent ? theme['c-primary-font'] : theme['c-font']}>
          {musicInfo.name}
        </Text>
        <Text numberOfLines={1} size={11} color={theme['c-font-label']}>
          {musicInfo.singer}
        </Text>
      </View>
      {variant == 'upcoming' && onDislike ? (
        <TouchableOpacity
          style={[styles.dislikeBtn, { borderColor: theme['c-border-background'] }]}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          onPress={() => { onDislike(index) }}
        >
          <Icon name="remove" size={12} color={theme['c-font-label']} />
          <Text size={11} color={theme['c-font-label']}>{t('roaming_dislike')}</Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  )
})

const SectionTitle = ({ text }: { text: string }) => {
  const theme = useTheme()
  return (
    <View style={[styles.sectionTitle, { backgroundColor: theme['c-content-background'] }]}>
      <Text size={12} style={{ fontWeight: 'bold' }} color={theme['c-font-label']}>{text}</Text>
    </View>
  )
}

export default ({ onClose }: { onClose?: () => void }) => {
  const theme = useTheme()
  const t = useI18n()
  const status = useRoamingStatus()

  // 漫游在别处被停止（切歌单等）→ 通知外层关闭弹层/收起侧栏
  const wasActiveRef = useRef(status.active)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    if (wasActiveRef.current && !status.active) onCloseRef.current?.()
    wasActiveRef.current = status.active
  }, [status.active])

  if (!status.active) return null

  const { queue, playIndex, playedRecent } = status
  const titleIndex = playIndex >= 0 ? playIndex + 1 : 1
  const recentOffset = playIndex - playedRecent.length
  const currentMusic = playIndex >= 0 ? queue[playIndex] : null
  const upcoming = playIndex >= 0 ? queue.slice(playIndex + 1) : []

  const handleEnd = () => {
    stop()
    // 当前歌自然播完，不打断播放（ADR 0003 §5 生命周期 a）
  }
  const handleRecentPress = (index: number) => {
    void playList(LIST_IDS.ROAMING, index)
  }
  const handleDislike = (index: number) => {
    removeAt(index)
  }
  const handleBlock = (musicInfo: LX.Music.MusicInfo) => {
    void (async() => {
      const choice = await chooseDialog({
        title: t('roaming_block'),
        message: musicInfo.name,
        buttons: [t('dialog_cancel'), t('roaming_block'), t('block_singer')],
      })
      if (choice == 1) {
        await addDislikeInfo([{ name: musicInfo.name, singer: musicInfo.singer }])
        toast(t('roaming_block_success', { name: musicInfo.name }))
      } else if (choice == 2) {
        await blockSingers(splitSingers(musicInfo.singer))
      }
    })()
  }

  return (
    <View style={styles.container}>
      {/* 标题 + 结束漫游 */}
      <View style={[styles.header, { borderBottomColor: theme['c-border-background'] }]}>
        <Text numberOfLines={1} size={15} style={styles.headerTitle} color={theme['c-font']}>
          {t('roaming_queue_title', { index: titleIndex, total: queue.length })}
        </Text>
        <TouchableOpacity
          style={[styles.endBtn, { borderColor: theme['c-border-background'] }]}
          activeOpacity={0.7}
          onPress={handleEnd}
        >
          <Icon name="exit" size={14} color={theme['c-font-label']} />
          <Text size={12} color={theme['c-font-label']}>{t('roaming_end')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} bounces={false}>
        {playedRecent.length ? (
          <>
            <SectionTitle text={t('roaming_recent')} />
            {playedRecent.map((musicInfo, i) => (
              <MusicRow
                key={`recent-${musicInfo.id}-${recentOffset + i}`}
                musicInfo={musicInfo}
                index={recentOffset + i}
                variant="recent"
                onPressRecent={handleRecentPress}
              />
            ))}
          </>
        ) : null}

        {currentMusic ? (
          <MusicRow
            key={`current-${currentMusic.id}`}
            musicInfo={currentMusic}
            index={playIndex}
            variant="current"
          />
        ) : null}

        {upcoming.length ? (
          <>
            <SectionTitle text={t('roaming_up_next')} />
            {upcoming.map((musicInfo, i) => (
              <MusicRow
                key={`next-${musicInfo.id}-${playIndex + 1 + i}`}
                musicInfo={musicInfo}
                index={playIndex + 1 + i}
                variant="upcoming"
                onDislike={handleDislike}
                onBlock={handleBlock}
              />
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  )
}

const styles = createStyle({
  container: {
    flex: 1,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: scaleSizeH(46),
    paddingHorizontal: scaleSizeW(14),
    borderBottomWidth: BorderWidths.normal,
  },
  headerTitle: {
    flex: 1,
    fontWeight: 'bold',
  },
  endBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: BorderWidths.normal,
    borderRadius: 14,
    paddingVertical: scaleSizeH(4),
    paddingHorizontal: scaleSizeW(10),
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: scaleSizeH(12),
  },
  sectionTitle: {
    height: scaleSizeH(28),
    justifyContent: 'center',
    paddingLeft: scaleSizeW(14),
    marginTop: scaleSizeH(6),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: scaleSizeH(48),
    paddingLeft: scaleSizeW(14),
    paddingRight: scaleSizeW(10),
    borderBottomWidth: BorderWidths.normal,
  },
  playingBar: {
    position: 'absolute',
    left: 0,
    top: '25%',
    bottom: '25%',
    width: 3,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  rowInfo: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    paddingRight: scaleSizeW(8),
  },
  dislikeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: BorderWidths.normal,
    borderRadius: 12,
    paddingVertical: scaleSizeH(3),
    paddingHorizontal: scaleSizeW(8),
  },
})
