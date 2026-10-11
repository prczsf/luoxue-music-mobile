import { memo } from 'react'

import Section from '../../components/Section'
import SavePath from './SavePath'
import Quality from './Quality'
import AskQuality from './AskQuality'
import { useI18n } from '@/lang'

export default memo(() => {
  const t = useI18n()

  return (
    <Section title={t('setting_download')}>
      <SavePath />
      <Quality />
      <AskQuality />
    </Section>
  )
})

