import { memo, useMemo } from 'react'

import { StyleSheet, View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import CheckBox from '@/components/common/CheckBox'
import Text from '@/components/common/Text'
import { useSettingValue } from '@/store/setting/hook'
import { useI18n } from '@/lang'
import { updateSetting } from '@/core/common'

type PlayAllOnOpenType = LX.AppSetting['list.playAllOnOpen']

const setPlayAllOnOpen = (type: PlayAllOnOpenType) => {
  updateSetting({ 'list.playAllOnOpen': type })
}

const useActive = (id: PlayAllOnOpenType) => {
  const type = useSettingValue('list.playAllOnOpen')
  return useMemo(() => type == id, [type, id])
}

const Item = ({ id, name }: {
  id: PlayAllOnOpenType
  name: string
}) => {
  const isActive = useActive(id)
  return <CheckBox marginRight={8} check={isActive} label={name} onChange={() => { setPlayAllOnOpen(id) }} need />
}

export default memo(() => {
  const t = useI18n()

  return (
    <SubTitle title={t('setting_list_play_all_on_open')}>
      <View style={styles.list}>
        <Item id="off" name={t('setting_list_play_all_on_open_off')} />
        <Item id="list" name={t('setting_list_play_all_on_open_list')} />
        <Item id="random" name={t('setting_list_play_all_on_open_random')} />
      </View>
      <View style={styles.tip}>
        <Text size={12}>{t('setting_list_play_all_on_open_tip')}</Text>
      </View>
    </SubTitle>
  )
})

const styles = StyleSheet.create({
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tip: {
    marginTop: 6,
    opacity: 0.7,
  },
})
