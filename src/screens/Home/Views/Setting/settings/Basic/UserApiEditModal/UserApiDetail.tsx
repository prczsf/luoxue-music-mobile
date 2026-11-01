import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { View, TouchableOpacity } from 'react-native'

import Dialog, { type DialogType } from '@/components/common/Dialog'
import Button from '@/components/common/Button'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { clipboardWriteText, createStyle, openUrl, toast } from '@/utils/tools'

export interface UserApiDetailType {
  show: (info: LX.UserApi.UserApiInfo) => void
}

export interface UserApiDetailProps {
  onSetUrl: (info: LX.UserApi.UserApiInfo) => void
}

const ellipsis = (str: string) => {
  if (str.length <= 56) return str
  return `${str.substring(0, 32)}…${str.substring(str.length - 16)}`
}

const InfoRow = ({ label, value, onPress }: {
  label: string
  value: string
  onPress?: () => void
}) => {
  const theme = useTheme()
  if (!value) return null
  return (
    <View style={styles.row}>
      <Text size={12} color={theme['c-font-label']} style={styles.rowLabel}>{label}</Text>
      {
        onPress
          ? <TouchableOpacity style={styles.rowValue} onPress={onPress}>
              <Text size={13} color={theme['c-primary-font']} numberOfLines={1}>{value}</Text>
            </TouchableOpacity>
          : <Text size={13} style={styles.rowValue}>{value}</Text>
      }
    </View>
  )
}

export default forwardRef<UserApiDetailType, UserApiDetailProps>(({ onSetUrl }, ref) => {
  const dialogRef = useRef<DialogType>(null)
  const [visible, setVisible] = useState(false)
  const [info, setInfo] = useState<LX.UserApi.UserApiInfo | null>(null)
  const theme = useTheme()
  const t = useI18n()

  useImperativeHandle(ref, () => ({
    show(info) {
      setInfo({ ...info })
      if (visible) {
        dialogRef.current?.setVisible(true)
      } else {
        setVisible(true)
        requestAnimationFrame(() => {
          dialogRef.current?.setVisible(true)
        })
      }
    },
  }), [visible])

  const handleClose = () => {
    dialogRef.current?.setVisible(false)
  }

  const handleCopyUrl = () => {
    if (!info?.url) return
    clipboardWriteText(info.url)
    toast(t('user_api_copy_url_success'))
  }

  const handleSetUrl = () => {
    if (!info) return
    dialogRef.current?.setVisible(false)
    onSetUrl(info)
  }

  const importTypeText = info?.importType === 'online'
    ? t('user_api_import_type_online')
    : info?.importType === 'local'
      ? t('user_api_import_type_local')
      : t('user_api_import_type_unknown')

  return (
    visible && info
      ? (
          <Dialog ref={dialogRef} bgHide={false}>
            <View style={styles.content}>
              <Text size={16} style={styles.title}>{info.name}</Text>
              <InfoRow label={t('user_api_detail_source')} value={info.url ? ellipsis(info.url) : t('user_api_source_unknown')} />
              {
                info.url
                  ? <TouchableOpacity onPress={handleCopyUrl} style={styles.copyBtn}>
                      <Text size={12} color={theme['c-primary-font']}>{t('user_api_copy_url')}</Text>
                    </TouchableOpacity>
                  : <Text size={12} color={theme['c-font-label']} style={styles.tipText}>{t('user_api_source_unknown_tip')}</Text>
              }
              <InfoRow label={t('user_api_detail_import_type')} value={importTypeText} />
              <InfoRow label={t('user_api_detail_imported_at')} value={info.importedAt ? new Date(info.importedAt).toLocaleString() : ''} />
              <InfoRow label={t('user_api_homepage')} value={info.homepage} onPress={() => { void openUrl(info.homepage) }} />
              {
                info.description
                  ? <Text size={12} color={theme['c-font-label']} style={styles.desc}>{info.description}</Text>
                  : null
              }
            </View>
            <View style={styles.btns}>
              {
                info.url
                  ? null
                  : <Button style={{ ...styles.btn, backgroundColor: theme['c-button-background'] }} onPress={handleSetUrl}>
                      <Text size={14} color={theme['c-button-font']}>{t('user_api_set_url')}</Text>
                    </Button>
              }
              <Button style={{ ...styles.btn, backgroundColor: theme['c-button-background'] }} onPress={handleClose}>
                <Text size={14} color={theme['c-button-font']}>{t('close')}</Text>
              </Button>
            </View>
          </Dialog>
        )
      : null
  )
})

const styles = createStyle({
  content: {
    flexShrink: 1,
    paddingHorizontal: 8,
    paddingTop: 15,
    paddingBottom: 10,
    flexDirection: 'column',
  },
  title: {
    marginBottom: 12,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  rowLabel: {
    width: 72,
    flexGrow: 0,
    flexShrink: 0,
  },
  rowValue: {
    flexGrow: 1,
    flexShrink: 1,
  },
  copyBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingLeft: 72,
  },
  tipText: {
    marginTop: 2,
    marginBottom: 4,
    paddingLeft: 72,
  },
  desc: {
    marginTop: 8,
  },
  btns: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingBottom: 15,
    paddingLeft: 15,
  },
  btn: {
    flex: 1,
    padding: 10,
    alignItems: 'center',
    borderRadius: 4,
    marginRight: 15,
  },
})
