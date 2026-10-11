import { memo, useMemo, useRef } from 'react'

import { View, StyleSheet, TouchableOpacity } from 'react-native'

import { pop, navigations } from '@/navigation'
import StatusBar from '@/components/common/StatusBar'
import { useTheme } from '@/store/theme/hook'
import { usePlayerMusicInfo, usePlayMusicInfo } from '@/store/player/hook'
import { useMyList } from '@/store/list/hook'
import { useI18n } from '@/lang'
import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import { scaleSizeH, scaleSizeW } from '@/utils/pixelRatio'
import { HEADER_HEIGHT as _HEADER_HEIGHT, LIST_IDS, NAV_SHEAR_NATIVE_IDS } from '@/config/constant'
import { BorderWidths } from '@/theme'
import commonState from '@/store/common/state'
import listState from '@/store/list/state'
import SettingPopup, { type SettingPopupType } from '../../components/SettingPopup'
import { useStatusbarHeight } from '@/store/common/hook'
import Btn from './Btn'
import TimeoutExitBtn from './TimeoutExitBtn'
import DownloadBtn from '../../components/DownloadBtn'

export const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)



const Title = () => {
  const theme = useTheme()
  const musicInfo = usePlayerMusicInfo()
  const playMusicInfo = usePlayMusicInfo()
  const allList = useMyList()
  const t = useI18n()

  const listId = playMusicInfo.listId
  const listName = useMemo(() => {
    if (!listId || listId === LIST_IDS.DOWNLOAD || listId === LIST_IDS.TEMP) return ''
    if (listId === LIST_IDS.DEFAULT) return t('list_name_default')
    if (listId === LIST_IDS.LOVE) return t('list_name_love')
    return allList.find(l => l.id === listId)?.name ?? ''
  }, [listId, allList, t])

  const handleGoPlaylist = () => {
    if (!listId || !listName) return
    const isMylist = listId === LIST_IDS.DEFAULT || listId === LIST_IDS.LOVE || allList.some(l => l.id === listId)
    if (!isMylist) return

    // 1. 关闭 PlayDetail 页面
    const playDetailId = commonState.componentIds.playDetail
    if (playDetailId) {
      void pop(playDetailId)
    }

    // 2. 检查底层是否已经是 MylistDetail 且正是该歌单，若是则直接触发定位
    if (commonState.componentIds.mylistDetail && listState.activeListId === listId) {
      requestAnimationFrame(() => {
        global.app_event.jumpListPosition()
      })
      return
    }

    // 3. 底层不是该歌单详情，则安全推入该歌单详情页
    if (commonState.componentIds.home) {
      global.lx.jumpMyListPosition = true
      navigations.pushMylistDetailScreen(commonState.componentIds.home, listId)
    }
  }

  return (
    <View style={styles.titleContent}>
      <Text numberOfLines={1} style={styles.title} size={15} color={theme['c-font']}>
        {musicInfo.name}
      </Text>
      <View style={styles.subRow}>
        <Text numberOfLines={1} style={styles.singerText} size={11} color={theme['c-font-label']}>
          {musicInfo.singer || '—'}
        </Text>
        {listName ? (
          <TouchableOpacity
            style={[
              styles.capsule,
              {
                backgroundColor: theme['c-button-background'],
                borderColor: theme['c-border-background'],
              },
            ]}
            onPress={handleGoPlaylist}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Icon name="album" size={11} color={theme['c-primary-font-active']} />
            <Text numberOfLines={1} size={11} style={styles.capsuleText} color={theme['c-button-font']}>
              {listName}
            </Text>
            <Icon name="chevron-right" size={10} color={theme['c-button-font']} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  )
}

export default memo(() => {
  const popupRef = useRef<SettingPopupType>(null)
  const statusBarHeight = useStatusbarHeight()

  const back = () => {
    void pop(commonState.componentIds.playDetail!)
  }
  const showSetting = () => {
    popupRef.current?.show()
  }

  return (
    <View style={{ height: HEADER_HEIGHT + statusBarHeight, paddingTop: statusBarHeight }} nativeID={NAV_SHEAR_NATIVE_IDS.playDetail_header}>
      <StatusBar />
      <View style={styles.container}>
        <Btn icon="chevron-left" onPress={back} />
        <Title />
        <DownloadBtn />
        <TimeoutExitBtn />
        <Btn icon="slider" onPress={showSetting} />
      </View>
      <SettingPopup ref={popupRef} direction="vertical" />
    </View>
  )
})


const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: '100%',
  },
  titleContent: {
    flex: 1,
    paddingHorizontal: scaleSizeW(5),
    justifyContent: 'center',
  },
  title: {
    fontWeight: 'bold',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 6,
  },
  singerText: {
    flexShrink: 1,
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scaleSizeW(6),
    paddingVertical: scaleSizeH(1.5),
    borderRadius: 10,
    borderWidth: BorderWidths.normal,
    maxWidth: '55%',
    gap: 3,
  },
  capsuleText: {
    maxWidth: scaleSizeW(100),
  },
  icon: {
    paddingLeft: 4,
    paddingRight: 4,
  },
})
