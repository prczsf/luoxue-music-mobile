import { TouchableOpacity, View } from 'react-native'

import { HEADER_HEIGHT as _HEADER_HEIGHT } from '@/config/constant'
import { scaleSizeH, scaleSizeW } from '@/utils/pixelRatio'
import { BorderWidths } from '@/theme'
import { createStyle } from '@/utils/tools'
import { useStatusbarHeight } from '@/store/common/hook'
import { useTheme } from '@/store/theme/hook'
import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import StatusBar from '@/components/common/StatusBar'

// 与 Home 顶部栏同尺寸（src/screens/Home/Vertical/Header.tsx）
const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)
const BTN_WIDTH = scaleSizeH(48)

interface Props {
  /** 标题 */
  title: string
  /** 返回回调，不传则不显示返回按钮（左侧留占位，标题仍从左侧起） */
  onBack?: () => void
  /** 右侧操作区，不传则占位 */
  right?: React.ReactNode
}

/**
 * 独立页面（RNN push screen）统一顶部栏
 * - 高度把状态栏高度算进去（height = HEADER_HEIGHT + statusBarHeight，paddingTop = statusBarHeight）
 * - 页面不要再手写 header，避免漏算状态栏高度导致内容带被压扁、标题被裁掉
 */
export default ({ title, onBack, right }: Props) => {
  const theme = useTheme()
  const statusBarHeight = useStatusbarHeight()

  return (
    <View style={[styles.container, {
      height: HEADER_HEIGHT + statusBarHeight,
      paddingTop: statusBarHeight,
      borderBottomColor: theme['c-border-background'],
    }]}>
      <StatusBar />
      <View style={styles.bar}>
        {
          onBack
            ? <TouchableOpacity style={styles.btn} onPress={onBack}>
                <Icon name="chevron-left" size={22} color={theme['c-button-font']} />
              </TouchableOpacity>
            : <View style={styles.btn} />
        }
        <Text style={styles.title} size={17} color={theme['c-button-font']} numberOfLines={1}>{title}</Text>
        {right ?? <View style={styles.btn} />}
      </View>
    </View>
  )
}

const styles = createStyle({
  container: {
    flexDirection: 'column',
    borderBottomWidth: BorderWidths.normal,
  },
  bar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  btn: {
    width: BTN_WIDTH,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    fontWeight: 'bold',
    paddingLeft: scaleSizeW(4),
  },
})
