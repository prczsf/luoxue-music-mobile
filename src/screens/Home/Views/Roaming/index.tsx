import { useCallback, useRef, useState } from 'react'
import { ScrollView, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native'

import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import Modal, { type ModalType } from '@/components/common/Modal'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { useMyList } from '@/store/list/hook'
import { useHorizontalMode } from '@/utils/hooks'
import { createStyle } from '@/utils/tools'
import { scaleSizeH, scaleSizeW } from '@/utils/pixelRatio'
import { BorderWidths } from '@/theme'
import { LIST_IDS } from '@/config/constant'
import { useExcludeLists, useIndexMeta, useRoamingStatus } from './state'
import HeroCards from './HeroCards'
import ArtistWall from './ArtistWall'
import QueuePanel from './QueuePanel'

/**
 * 随心漫游页面（roaming-plan §3.2）
 * - 纵向滚动：Hero（全部歌曲）→ 常听歌手墙（P1 不含风格墙）
 * - 右上角「选择歌单」：底部弹层多选，确认后持久化并重建索引
 * - 横屏且漫游中：右侧常驻播放列表栏（可折叠）；竖屏由播放栏按钮呼出弹层
 */
export default () => {
  const theme = useTheme()
  const t = useI18n()
  const status = useRoamingStatus()
  const { index } = useIndexMeta()
  const { excluded, save } = useExcludeLists()
  const allList = useMyList()
  const isHorizontal = useHorizontalMode()

  const scrollRef = useRef<ScrollView>(null)
  const filterModalRef = useRef<ModalType>(null)
  const artistsYRef = useRef(0)
  const [filterVisible, setFilterVisible] = useState(false)
  const [draft, setDraft] = useState<string[]>([])
  const [railOpen, setRailOpen] = useState(true)

  const listOptions = allList.filter(l => l.id != LIST_IDS.TEMP)

  const handleOpenFilter = useCallback(() => {
    setDraft([...excluded])
    setFilterVisible(true)
    requestAnimationFrame(() => { filterModalRef.current?.setVisible(true) })
  }, [excluded])

  const handleCloseFilter = useCallback(() => {
    filterModalRef.current?.setVisible(false)
  }, [])

  const handleToggleDraft = (id: string) => {
    setDraft(prev => prev.includes(id) ? prev.filter(x => x != id) : [...prev, id])
  }

  const handleConfirmFilter = () => {
    void save(draft)
    handleCloseFilter()
  }

  const handleArtistsLayout = (e: LayoutChangeEvent) => {
    artistsYRef.current = e.nativeEvent.layout.y
  }
  const scrollToArtists = () => {
    scrollRef.current?.scrollTo({ y: artistsYRef.current, animated: true })
  }

  const showRail = isHorizontal && status.active && railOpen

  return (
    <View style={styles.container}>
      {/* 顶部工具栏 */}
      <View style={[styles.toolbar, { borderBottomColor: theme['c-border-background'] }]}>
        <Text style={styles.toolbarTitle} size={17} numberOfLines={1} color={theme['c-button-font']}>
          {t('roaming_title')}
        </Text>
        <TouchableOpacity style={styles.toolbarBtn} activeOpacity={0.7} onPress={handleOpenFilter}>
          <Icon color={theme['c-button-font']} name="checkbox-marked" size={16} />
          <Text size={12} color={theme['c-button-font']}>{t('roaming_filter_lists')}</Text>
          {excluded.length
            ? <Text size={11} color={theme['c-font-label']} style={styles.toolbarBadge}>({excluded.length})</Text>
            : null
          }
        </TouchableOpacity>
      </View>

      {/* 主体：滚动区 + （横屏）播放列表侧栏 */}
      <View style={styles.body}>
        <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.heroSection}>
            <HeroCards status={status} index={index} onScrollToArtists={scrollToArtists} />
          </View>
          <View onLayout={handleArtistsLayout}>
            <ArtistWall status={status} index={index} />
          </View>
        </ScrollView>

        {isHorizontal && status.active ? (
          showRail
            ? (
                <View style={[styles.rail, { borderLeftColor: theme['c-border-background'] }]}>
                  <QueuePanel onClose={() => { setRailOpen(false) }} />
                </View>
              )
            : (
                <TouchableOpacity
                  style={[styles.railTab, { backgroundColor: theme['c-content-background'], borderLeftColor: theme['c-border-background'] }]}
                  activeOpacity={0.7}
                  onPress={() => { setRailOpen(true) }}
                >
                  <Icon name="chevron-left" size={16} color={theme['c-font-label']} />
                </TouchableOpacity>
              )
        ) : null}
      </View>

      {/* 排除歌单底部弹层 */}
      {filterVisible ? (
        <Modal
          ref={filterModalRef}
          bgHide={true}
          bgColor="rgba(0,0,0,0.45)"
          onHide={() => { setFilterVisible(false) }}
        >
          <View style={styles.sheetContainer}>
            <View style={[styles.sheetContent, { backgroundColor: theme['c-content-background'] }]}>
              <View style={[styles.sheetHeader, { borderBottomColor: theme['c-border-background'] }]}>
                <Icon name="checkbox-marked" size={18} color={theme['c-primary-font']} style={{ marginRight: scaleSizeW(10) }} />
                <Text size={15} numberOfLines={1} style={{ flex: 1, fontWeight: 'bold' }} color={theme['c-font']}>
                  {t('roaming_filter_sheet_title')}
                </Text>
                <TouchableOpacity style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={handleCloseFilter}>
                  <Icon name="close" size={16} color={theme['c-350']} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.sheetList} bounces={false}>
                {listOptions.map(item => {
                  const checked = draft.includes(item.id)
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.sheetItem, { borderBottomColor: theme['c-border-background'] }]}
                      activeOpacity={0.7}
                      onPress={() => { handleToggleDraft(item.id) }}
                    >
                      <Icon
                        name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={18}
                        color={checked ? theme['c-primary-font'] : theme['c-350']}
                      />
                      <Text numberOfLines={1} size={14} style={{ flex: 1, marginLeft: scaleSizeW(10) }} color={theme['c-font']}>
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>

              <View style={[styles.sheetFooter, { borderTopColor: theme['c-border-background'] }]}>
                <Text size={11} numberOfLines={1} style={{ flex: 1 }} color={theme['c-font-label']}>
                  {draft.length ? t('roaming_filter_count', { num: draft.length }) : ''}
                </Text>
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: theme['c-primary-background-active'] }]}
                  activeOpacity={0.75}
                  onPress={handleConfirmFilter}
                >
                  <Text size={13} color={theme['c-primary-font']}>{t('dialog_confirm')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  )
}

const styles = createStyle({
  container: {
    flex: 1,
    flexDirection: 'column',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: scaleSizeH(48),
    paddingLeft: scaleSizeW(15),
    borderBottomWidth: BorderWidths.normal,
  },
  toolbarTitle: {
    flex: 1,
    fontWeight: 'bold',
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: scaleSizeH(48),
    paddingHorizontal: scaleSizeW(12),
    justifyContent: 'center',
  },
  toolbarBadge: {
    marginLeft: 1,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: scaleSizeH(16),
  },
  heroSection: {
    paddingHorizontal: scaleSizeW(10),
    paddingTop: scaleSizeH(10),
  },
  // 横屏播放列表侧栏
  rail: {
    width: scaleSizeW(300),
    borderLeftWidth: BorderWidths.normal,
  },
  railTab: {
    width: scaleSizeW(24),
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: BorderWidths.normal,
  },
  // 底部弹层
  sheetContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '75%',
    paddingBottom: scaleSizeH(16),
    elevation: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scaleSizeW(16),
    paddingVertical: scaleSizeH(14),
    borderBottomWidth: 1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetList: {
    paddingHorizontal: scaleSizeW(16),
    flexGrow: 0,
    maxHeight: scaleSizeH(340),
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: scaleSizeH(12),
    borderBottomWidth: 0.5,
  },
  sheetFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scaleSizeW(16),
    paddingTop: scaleSizeH(12),
    gap: scaleSizeW(10),
    borderTopWidth: 0.5,
  },
  confirmBtn: {
    borderRadius: 16,
    paddingVertical: scaleSizeH(6),
    paddingHorizontal: scaleSizeW(20),
  },
})
