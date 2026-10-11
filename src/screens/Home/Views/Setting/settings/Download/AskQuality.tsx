import { memo } from 'react'
import { StyleSheet, View } from 'react-native'

import CheckBoxItem from '../../components/CheckBoxItem'
import Text from '@/components/common/Text'
import { useSettingValue } from '@/store/setting/hook'
import { useI18n } from '@/lang'
import { updateSetting } from '@/core/common'

export default memo(() => {
  const t = useI18n()
  const askQuality = useSettingValue('download.askQuality')

  const setAskQuality = (val: boolean) => {
    updateSetting({ 'download.askQuality': val })
  }

  return (
    <View style={styles.container}>
      <CheckBoxItem
        check={askQuality}
        label={t('setting_download_ask_quality')}
        onChange={setAskQuality}
      />
      <View style={styles.tip}>
        <Text size={12}>{t('setting_download_ask_quality_tip')}</Text>
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
  },
  tip: {
    marginTop: 6,
    paddingLeft: 30,
    opacity: 0.7,
  },
})
