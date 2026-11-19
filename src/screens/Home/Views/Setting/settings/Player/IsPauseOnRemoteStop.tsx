import { updateSetting } from '@/core/common'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { memo } from 'react'
import { View } from 'react-native'
import { useSettingValue } from '@/store/setting/hook'

import CheckBoxItem from '../../components/CheckBoxItem'

export default memo(() => {
  const t = useI18n()
  const isPauseOnRemoteStop = useSettingValue('player.isPauseOnRemoteStop')
  const setPauseOnRemoteStop = (val: boolean) => {
    updateSetting({ 'player.isPauseOnRemoteStop': val })
  }

  return (
    <View style={styles.content}>
      <CheckBoxItem
        check={isPauseOnRemoteStop}
        onChange={setPauseOnRemoteStop}
        label={t('setting_play_pause_on_remote_stop')}
        helpDesc={t('setting_play_pause_on_remote_stop_tip')}
      />
    </View>
  )
})

const styles = createStyle({
  content: {
    marginTop: 5,
  },
})
