import { useState, useRef, useImperativeHandle, forwardRef, useMemo } from 'react'
import { View } from 'react-native'

import ConfirmAlert, { type ConfirmAlertType } from '@/components/common/ConfirmAlert'
import Text from '@/components/common/Text'
import CheckBox from '@/components/common/CheckBox'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import settingState from '@/store/setting/state'
import { TRY_QUALITYS_LIST } from '@/core/music/utils'

export interface DownloadQualityModalType<T = any> {
  show: (info: T) => void
}

export interface DownloadQualityModalProps<T = any> {
  onConfirm: (info: T, quality: LX.Quality) => void
}

const DownloadQualityModal = <T = any>({ onConfirm }: DownloadQualityModalProps<T>, ref: any) => {
  const t = useI18n()
  const alertRef = useRef<ConfirmAlertType>(null)
  const infoRef = useRef<T | null>(null)
  const [visible, setVisible] = useState(false)
  const [quality, setQuality] = useState<LX.Quality>('128k')

  const qualityList = useMemo(() => [...TRY_QUALITYS_LIST, '128k'].reverse() as LX.Quality[], [])

  useImperativeHandle(ref, () => ({
    show(info: T) {
      infoRef.current = info
      setQuality(settingState.setting['download.quality'] ?? '128k')
      if (visible) alertRef.current?.setVisible(true)
      else {
        setVisible(true)
        requestAnimationFrame(() => {
          alertRef.current?.setVisible(true)
        })
      }
    },
  }))

  const handleConfirm = () => {
    const info = infoRef.current
    if (!info) return
    alertRef.current?.setVisible(false)
    onConfirm(info, quality)
  }

  return (
    visible
      ? <ConfirmAlert
          ref={alertRef}
          onConfirm={handleConfirm}
        >
        <View style={styles.content}>
          <Text style={{ marginBottom: 10 }}>{t('list_download_quality_pick')}</Text>
          <View style={styles.list}>
            {qualityList.map((q) => (
              <CheckBox key={q} marginRight={8} check={quality == q} label={q} onChange={() => { setQuality(q) }} need />
            ))}
          </View>
        </View>
      </ConfirmAlert>
      : null
  )
}

export default forwardRef(DownloadQualityModal) as <T = any>(
  props: DownloadQualityModalProps<T> & { ref?: React.Ref<DownloadQualityModalType<T>> }
) => React.ReactElement | null

const styles = createStyle({
  content: {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: 'column',
  },
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
})
