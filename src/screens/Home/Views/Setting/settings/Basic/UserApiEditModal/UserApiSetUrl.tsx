import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { View } from 'react-native'

import ConfirmAlert, { type ConfirmAlertType } from '@/components/common/ConfirmAlert'
import Input from '@/components/common/Input'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'

export interface UserApiSetUrlType {
  show: (info: LX.UserApi.UserApiInfo) => void
}

export interface UserApiSetUrlProps {
  onSave: (info: LX.UserApi.UserApiInfo, url: string) => void
}

export default forwardRef<UserApiSetUrlType, UserApiSetUrlProps>((props, ref) => {
  const [visible, setVisible] = useState(false)
  const [text, setText] = useState('')
  const alertRef = useRef<ConfirmAlertType>(null)
  const infoRef = useRef<LX.UserApi.UserApiInfo | null>(null)
  const theme = useTheme()
  const t = useI18n()

  useImperativeHandle(ref, () => ({
    show(info) {
      infoRef.current = info
      setText(info.url ?? '')
      if (visible) {
        alertRef.current?.setVisible(true)
      } else {
        setVisible(true)
        requestAnimationFrame(() => {
          alertRef.current?.setVisible(true)
        })
      }
    },
  }), [visible])

  const handleConfirm = () => {
    const url = text.trim()
    if (!/^https?:\/\//i.test(url)) {
      toast(t('user_api_url_invalid'), 'long')
      return
    }
    const info = infoRef.current
    alertRef.current?.setVisible(false)
    if (info) props.onSave(info, url)
  }

  return (
    visible
      ? <ConfirmAlert
          ref={alertRef}
          onConfirm={handleConfirm}
          confirmText={t('dialog_confirm')}
          cancelText={t('dialog_cancel')}
        >
          <View style={styles.content}>
            <Text size={13} style={styles.tip}>{t('user_api_set_url_tip')}</Text>
            <Input
              value={text}
              onChangeText={setText}
              placeholder={'https://'}
              style={{ ...styles.input, backgroundColor: theme['c-primary-input-background'] }}
            />
          </View>
        </ConfirmAlert>
      : null
  )
})

const styles = createStyle({
  content: {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: 'column',
  },
  tip: {
    marginBottom: 10,
  },
  input: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 260,
    borderRadius: 4,
  },
})
