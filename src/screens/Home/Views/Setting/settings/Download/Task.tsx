import { memo, useCallback, useState } from 'react'

import { View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import Slider, { type SliderProps } from '../../components/Slider'
import CheckBoxItem from '../../components/CheckBoxItem'
import Text from '@/components/common/Text'
import { useSettingValue } from '@/store/setting/hook'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { updateSetting } from '@/core/common'
import { createStyle } from '@/utils/tools'

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const concurrency = useSettingValue('download.concurrency')
  const autoToggleSource = useSettingValue('download.autoToggleSource')
  const [sliderValue, setSliderValue] = useState(concurrency)
  const [isSliding, setSliding] = useState(false)

  const handleSlidingStart = useCallback<NonNullable<SliderProps['onSlidingStart']>>(() => {
    setSliding(true)
  }, [])
  const handleValueChange = useCallback<NonNullable<SliderProps['onValueChange']>>(value => {
    setSliderValue(value)
  }, [])
  const handleSlidingComplete = useCallback<NonNullable<SliderProps['onSlidingComplete']>>(value => {
    setSliding(false)
    if (concurrency == value) return
    updateSetting({ 'download.concurrency': value })
  }, [concurrency])

  return (
    <SubTitle title={t('setting_download_task_group')}>
      <View style={styles.row}>
        <Text style={styles.label} color={theme['c-600']}>{t('setting_download_concurrency')}</Text>
        <Text style={styles.value} color={theme['c-primary-font']}>{isSliding ? sliderValue : concurrency}</Text>
        <Slider
          minimumValue={1}
          maximumValue={6}
          onSlidingComplete={handleSlidingComplete}
          onValueChange={handleValueChange}
          onSlidingStart={handleSlidingStart}
          step={1}
          value={concurrency}
        />
      </View>
      <View style={styles.tip}>
        <Text size={12}>{t('setting_download_concurrency_tip')}</Text>
      </View>
      <View style={styles.checkBox}>
        <CheckBoxItem
          check={autoToggleSource}
          label={t('setting_download_auto_toggle_source')}
          onChange={val => { updateSetting({ 'download.autoToggleSource': val }) }}
        />
      </View>
      <View style={styles.tip}>
        <Text size={12}>{t('setting_download_auto_toggle_source_tip')}</Text>
      </View>
    </SubTitle>
  )
})

const styles = createStyle({
  row: {
    flexGrow: 0,
    flexShrink: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginLeft: -25,
    paddingLeft: 25,
  },
  label: {
    marginRight: 8,
  },
  value: {
    marginRight: 8,
  },
  checkBox: {
    marginLeft: -25,
    marginTop: 10,
  },
  tip: {
    paddingLeft: 30,
    opacity: 0.7,
  },
})
