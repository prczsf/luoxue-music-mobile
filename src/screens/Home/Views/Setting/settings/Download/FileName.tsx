import { memo } from 'react'

import { StyleSheet, View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import CheckBox from '@/components/common/CheckBox'
import { useSettingValue } from '@/store/setting/hook'
import { useI18n } from '@/lang'
import { updateSetting } from '@/core/common'

export default memo(() => {
  const t = useI18n()
  const fileName = useSettingValue('download.fileName')

  const setFileName = (val: LX.AppSetting['download.fileName']) => {
    if (fileName == val) return
    updateSetting({ 'download.fileName': val })
  }

  return (
    <SubTitle title={t('setting_download_file_name')}>
      <View style={styles.list}>
        <CheckBox marginRight={8} check={fileName == '歌名 - 歌手'} label={t('setting_download_file_name_name_singer')} onChange={() => { setFileName('歌名 - 歌手') }} need />
        <CheckBox marginRight={8} check={fileName == '歌手 - 歌名'} label={t('setting_download_file_name_singer_name')} onChange={() => { setFileName('歌手 - 歌名') }} need />
        <CheckBox marginRight={8} check={fileName == '歌名'} label={t('setting_download_file_name_name')} onChange={() => { setFileName('歌名') }} need />
      </View>
    </SubTitle>
  )
})

const styles = StyleSheet.create({
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
})
