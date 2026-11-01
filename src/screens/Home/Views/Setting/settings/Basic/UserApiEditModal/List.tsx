import { useCallback, useRef } from 'react'
import Text from '@/components/common/Text'
import { View, TouchableOpacity, ScrollView } from 'react-native'
import { confirmDialog, createStyle, clipboardWriteText, toast } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { useUserApiList, state as userApiState } from '@/store/userApi'
import { useSettingValue } from '@/store/setting/hook'
import { removeUserApi, refreshUserApi, restorePrevUserApi, setUserApiAllowShowUpdateAlert, setUserApiUrl } from '@/core/userApi'
import { BorderRadius } from '@/theme'
import CheckBox from '@/components/common/CheckBox'
import { Icon } from '@/components/common/Icon'
import settingState from '@/store/setting/state'
import apiSourceInfo from '@/utils/musicSdk/api-source-info'
import { setApiSource } from '@/core/apiSource'
import type { Position } from '@/components/common/Menu'
import UserApiMenu, { type UserApiMenuType } from './UserApiMenu'
import UserApiDetail, { type UserApiDetailType } from './UserApiDetail'
import UserApiSetUrl, { type UserApiSetUrlType } from './UserApiSetUrl'

const formatVersionName = (version: string) => {
  return /^\d/.test(version) ? `v${version}` : version
}
const getHost = (url: string) => /^https?:\/\/([^/?#]+)/i.exec(url)?.[1] ?? url

const ListItem = ({ item, activeId, onRemove, onChangeAllowShowUpdateAlert, onShowMenu }: {
  item: LX.UserApi.UserApiInfo
  activeId: string
  onRemove: (id: string, name: string) => void
  onChangeAllowShowUpdateAlert: (id: string, enabled: boolean) => void
  onShowMenu: (item: LX.UserApi.UserApiInfo, position: Position) => void
}) => {
  const theme = useTheme()
  const t = useI18n()
  const moreButtonRef = useRef<TouchableOpacity>(null)
  const changeAllowShowUpdateAlert = (check: boolean) => {
    onChangeAllowShowUpdateAlert(item.id, check)
  }
  const handleRemove = () => {
    onRemove(item.id, item.name)
  }
  const handleShowMenu = () => {
    moreButtonRef.current?.measure((fx, fy, width, height, px, py) => {
      onShowMenu(item, { x: Math.ceil(px), y: Math.ceil(py), w: Math.ceil(width), h: Math.ceil(height) })
    })
  }

  return (
    <View style={{ ...styles.listItem, backgroundColor: activeId == item.id ? theme['c-primary-background-active'] : 'transparent' }}>
      <View style={styles.listItemLeft}>
        <Text size={14}>
          {item.name}
          {
            item.version ? (
              <Text size={12} color={theme['c-font-label']}>{ '   ' + formatVersionName(item.version) }</Text>
            ) : null
          }
          {
            item.author ? (
              <Text size={12} color={theme['c-font-label']}>{ '   ' + item.author }</Text>
            ) : null
          }
        </Text>
        {
          item.description ? (
            <Text size={12} color={theme['c-font-label']}>{item.description}</Text>
          ) : null
        }
        <CheckBox check={item.allowShowUpdateAlert} label={t('user_api_allow_show_update_alert')} onChange={changeAllowShowUpdateAlert} size={0.86} />
      </View>
      <View style={styles.listItemRight}>
        <TouchableOpacity style={styles.btn} onPress={handleShowMenu} ref={moreButtonRef}>
          <Icon name="dots-vertical" color={theme['c-button-font']} size={12} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={handleRemove}>
          <Icon name="close" color={theme['c-button-font']} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

export default () => {
  const userApiList = useUserApiList()
  const apiSource = useSettingValue('common.apiSource')
  const theme = useTheme()
  const t = useI18n()
  const menuRef = useRef<UserApiMenuType>(null)
  const detailRef = useRef<UserApiDetailType>(null)
  const setUrlRef = useRef<UserApiSetUrlType>(null)

  const handleRemove = useCallback(async(id: string, name: string) => {
    const confirm = await confirmDialog({
      message: global.i18n.t('user_api_remove_tip', { name }),
      cancelButtonText: global.i18n.t('cancel_button_text_2'),
      confirmButtonText: global.i18n.t('confirm_button_text'),
      bgClose: false,
    })
    if (!confirm) return
    void removeUserApi([id]).finally(() => {
      if (settingState.setting['common.apiSource'] == id) {
        let backApiId = apiSourceInfo.find(api => !api.disabled)?.id
        if (!backApiId) backApiId = userApiState.list[0]?.id
        setApiSource(backApiId ?? '')
      }
    })
  }, [])
  const handleChangeAllowShowUpdateAlert = useCallback((id: string, enabled: boolean) => {
    void setUserApiAllowShowUpdateAlert(id, enabled)
  }, [])
  const handleShowMenu = useCallback((item: LX.UserApi.UserApiInfo, position: Position) => {
    menuRef.current?.show(item, position)
  }, [])
  const handleCopyUrl = useCallback((item: LX.UserApi.UserApiInfo) => {
    if (!item.url) return
    clipboardWriteText(item.url)
    toast(t('user_api_copy_url_success'))
  }, [t])
  const handleRefresh = useCallback(async(item: LX.UserApi.UserApiInfo) => {
    if (!item.url) return
    const confirm = await confirmDialog({
      message: t('user_api_refresh_confirm', { host: getHost(item.url), name: item.name }),
      cancelButtonText: t('dialog_cancel'),
      confirmButtonText: t('dialog_confirm'),
      bgClose: false,
    })
    if (!confirm) return
    toast(t('user_api_refreshing'))
    try {
      const result = await refreshUserApi(item.id)
      toast(t(result.applied ? 'user_api_refresh_success' : 'user_api_refresh_success_pending', {
        version: result.info.version ? formatVersionName(result.info.version) : '',
      }))
    } catch (error: any) {
      toast(t('user_api_refresh_failed', { message: error?.message ?? '' }), 'long')
    }
  }, [t])
  const handleDetail = useCallback((item: LX.UserApi.UserApiInfo) => {
    detailRef.current?.show(item)
  }, [])
  const handleSetUrl = useCallback((item: LX.UserApi.UserApiInfo) => {
    setUrlRef.current?.show(item)
  }, [])
  const handleSaveUrl = useCallback(async(item: LX.UserApi.UserApiInfo, url: string) => {
    await setUserApiUrl(item.id, url)
    toast(t('user_api_set_url_success'))
  }, [t])
  const handleRestorePrev = useCallback(async(item: LX.UserApi.UserApiInfo) => {
    const confirm = await confirmDialog({
      message: `${t('user_api_restore_prev')}「${item.name}」`,
      cancelButtonText: t('dialog_cancel'),
      confirmButtonText: t('dialog_confirm'),
      bgClose: false,
    })
    if (!confirm) return
    try {
      await restorePrevUserApi(item.id)
      toast(t('user_api_restore_prev_success'))
    } catch (error: unknown) {
      toast((error as Error)?.message ?? t('user_api_restore_prev_failed'), 'long')
    }
  }, [t])

  return (
    <>
      <ScrollView style={styles.scrollView} keyboardShouldPersistTaps={'always'}>
        <View onStartShouldSetResponder={() => true}>
          {
            userApiList.length
              ? userApiList.map((item) => {
                return (
                <ListItem
                  key={item.id}
                  item={item}
                  activeId={apiSource}
                  onRemove={handleRemove}
                  onChangeAllowShowUpdateAlert={handleChangeAllowShowUpdateAlert}
                  onShowMenu={handleShowMenu}
                />
                )
              })
              : <Text style={styles.tipText} color={theme['c-font-label']}>{t('user_api_empty')}</Text>
          }
        </View>
      </ScrollView>
      <UserApiMenu
        ref={menuRef}
        onCopyUrl={handleCopyUrl}
        onRefresh={handleRefresh}
        onDetail={handleDetail}
        onSetUrl={handleSetUrl}
        onRestorePrev={handleRestorePrev}
        onRemove={(item) => { void handleRemove(item.id, item.name) }}
      />
      <UserApiDetail ref={detailRef} onSetUrl={handleSetUrl} />
      <UserApiSetUrl ref={setUrlRef} onSave={handleSaveUrl} />
    </>
  )
}


const styles = createStyle({
  scrollView: {
    paddingHorizontal: 7,
    flexGrow: 0,
  },
  list: {
    paddingBottom: 15,
    flexDirection: 'column',
  },
  listItem: {
    padding: 10,
    borderRadius: BorderRadius.normal,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listItemLeft: {
    paddingRight: 10,
    flex: 1,
    gap: 2,
  },
  listItemRight: {
    flex: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  btn: {
    padding: 10,
  },
  tipText: {
    textAlign: 'center',
    marginTop: 25,
    marginBottom: 15,
  },
})
