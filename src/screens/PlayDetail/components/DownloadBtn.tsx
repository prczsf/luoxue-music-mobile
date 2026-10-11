import { memo, useRef } from 'react'
import { TouchableOpacity, StyleSheet } from 'react-native'

import { Icon } from '@/components/common/Icon'
import { usePlayerMusicInfo } from '@/store/player/hook'
import { checkStoragePermissions, requestStoragePermission, toast } from '@/utils/tools'
import { getDownloadDir } from '@/core/downloadPath'
import { downloadMusicFile } from '@/core/downloadMusic'
import DownloadQualityModal, { type DownloadQualityModalType } from '@/components/DownloadQualityModal'
import settingState from '@/store/setting/state'
import { scaleSizeH } from '@/utils/pixelRatio'
import { HEADER_HEIGHT as _HEADER_HEIGHT } from '@/config/constant'
import { useI18n } from '@/lang'

export const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)

export default memo(() => {
  const t = useI18n()
  const musicInfo = usePlayerMusicInfo()

  const modalRef = useRef<DownloadQualityModalType<LX.Music.MusicInfoOnline>>(null)

  const onlineMusic = musicInfo as unknown as LX.Music.MusicInfoOnline
  if (!onlineMusic?.id || (onlineMusic as any).source == 'local') return null

  const runDownload = async(quality?: LX.Quality) => {
    const granted = await checkStoragePermissions() || await requestStoragePermission()
    if (!granted) {
      toast(global.i18n.t('storage_permission_tip_disagree'), 'long')
      return
    }
    const dir = await getDownloadDir()
    void downloadMusicFile(onlineMusic, dir, quality)
  }

  const handlePress = async() => {
    if (settingState.setting['download.askQuality']) {
      modalRef.current?.show(onlineMusic)
    } else {
      await runDownload()
    }
  }

  const handleConfirmQuality = (_target: LX.Music.MusicInfoOnline, quality: LX.Quality) => {
    void runDownload(quality)
  }


  return (
    <>
      <TouchableOpacity
        onPress={handlePress}
        accessibilityLabel={t('play_detail_download')}
        style={{ ...styles.button, width: HEADER_HEIGHT }}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Icon name="download-2" size={18} />
      </TouchableOpacity>

      <DownloadQualityModal ref={modalRef} onConfirm={handleConfirmQuality} />
    </>
  )
})

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    flex: 0,
  },
})
