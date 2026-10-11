import { memo, useRef } from 'react'

import { StyleSheet, View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import Button from '../../components/Button'
import Text from '@/components/common/Text'
import ChoosePath, { type ChoosePathType } from '@/components/common/ChoosePath'
import { useSettingValue } from '@/store/setting/hook'
import { useI18n } from '@/lang'
import { updateSetting } from '@/core/common'
import { DEFAULT_DOWNLOAD_DIR_NAME } from '@/core/downloadPath'

export default memo(() => {
  const t = useI18n()
  const savePath = useSettingValue('download.savePath')
  const choosePathRef = useRef<ChoosePathType>(null)

  const handlePick = () => {
    choosePathRef.current?.show({ title: t('setting_download_save_path_pick'), dirOnly: true })
  }

  const handleConfirm = (path: string) => {
    updateSetting({ 'download.savePath': path })
  }

  const handleReset = () => {
    updateSetting({ 'download.savePath': '' })
  }

  return (
    <SubTitle title={t('setting_download_save_path')}>
      <View style={styles.path}>
        <Text size={13} numberOfLines={2}>
          {savePath || t('setting_download_save_path_default', { dir: DEFAULT_DOWNLOAD_DIR_NAME })}
        </Text>
      </View>
      <View style={styles.btns}>
        <Button onPress={handlePick}>{t('setting_download_save_path_change')}</Button>
        {savePath ? <Button onPress={handleReset}>{t('setting_download_save_path_reset')}</Button> : null}
      </View>
      <View style={styles.tip}>
        <Text size={12}>{t('setting_download_save_path_tip')}</Text>
      </View>
      <ChoosePath ref={choosePathRef} onConfirm={handleConfirm} />
    </SubTitle>
  )
})

const styles = StyleSheet.create({
  path: {
    marginBottom: 8,
  },
  btns: {
    flexDirection: 'row',
  },
  tip: {
    marginTop: 8,
    opacity: 0.7,
  },
})
