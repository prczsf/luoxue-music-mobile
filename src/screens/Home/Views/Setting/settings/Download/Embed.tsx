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
  const embedPic = useSettingValue('download.embedPic')
  const embedLyric = useSettingValue('download.embedLyric')
  const embedTlrc = useSettingValue('download.embedTlrc')
  const embedRlrc = useSettingValue('download.embedRlrc')
  const embedAwlrc = useSettingValue('download.embedAwlrc')

  return (
    <SubTitle title={t('setting_download_embed_group')}>
      <View style={styles.checkBox}>
        <CheckBoxItem
          check={embedPic}
          label={t('setting_download_embed_pic')}
          onChange={val => { updateSetting({ 'download.embedPic': val }) }}
        />
        <CheckBoxItem
          check={embedLyric}
          label={t('setting_download_embed_lyric')}
          onChange={val => { updateSetting({ 'download.embedLyric': val }) }}
        />
        <View style={styles.children}>
          <CheckBoxItem
            check={embedTlrc}
            disabled={!embedLyric}
            label={t('setting_download_embed_tlrc')}
            onChange={val => { updateSetting({ 'download.embedTlrc': val }) }}
          />
          <CheckBoxItem
            check={embedRlrc}
            disabled={!embedLyric}
            label={t('setting_download_embed_rlrc')}
            onChange={val => { updateSetting({ 'download.embedRlrc': val }) }}
          />
          <CheckBoxItem
            check={embedAwlrc}
            disabled={!embedLyric}
            label={t('setting_download_embed_awlrc')}
            onChange={val => { updateSetting({ 'download.embedAwlrc': val }) }}
          />
        </View>
      </View>
      <View style={styles.tip}>
        <Text size={12}>{t('setting_download_embed_tip')}</Text>
      </View>
    </SubTitle>
  )
})

const styles = createStyle({
  checkBox: {
    marginLeft: -25,
    paddingBottom: 15,
  },
  children: {
    paddingLeft: 22,
  },
  tip: {
    paddingLeft: 30,
    opacity: 0.7,
  },
})
