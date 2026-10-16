import { memo } from 'react'

import { View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import CheckBoxItem from '../../components/CheckBoxItem'
import Text from '@/components/common/Text'
import { useSettingValue } from '@/store/setting/hook'
import { useI18n } from '@/lang'
import { updateSetting } from '@/core/common'
import { createStyle } from '@/utils/tools'

export default memo(() => {
  const t = useI18n()
  const saveLrcFile = useSettingValue('download.saveLrcFile')
  const savePicFile = useSettingValue('download.savePicFile')

  return (
    <SubTitle title={t('setting_download_extra_file_group')}>
      <View style={styles.checkBox}>
        <CheckBoxItem
          check={saveLrcFile}
          label={t('setting_download_save_lrc')}
          onChange={val => { updateSetting({ 'download.saveLrcFile': val }) }}
        />
      </View>
      <View style={styles.tip}>
        <Text size={12}>{t('setting_download_save_lrc_tip')}</Text>
      </View>
      <View style={styles.checkBox}>
        <CheckBoxItem
          check={savePicFile}
          label={t('setting_download_save_pic')}
          onChange={val => { updateSetting({ 'download.savePicFile': val }) }}
        />
      </View>
      <View style={styles.tip}>
        <Text size={12}>{t('setting_download_save_pic_tip')}</Text>
      </View>
    </SubTitle>
  )
})

const styles = createStyle({
  checkBox: {
    marginLeft: -25,
  },
  tip: {
    paddingLeft: 30,
    marginBottom: 15,
    opacity: 0.7,
  },
})
