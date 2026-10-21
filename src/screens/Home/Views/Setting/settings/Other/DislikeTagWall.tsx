import { useState } from 'react'
import { TouchableOpacity, View } from 'react-native'

import Text from '@/components/common/Text'
import Input from '@/components/common/Input'
import Button from '@/components/common/Button'
import { Icon } from '@/components/common/Icon'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'

export interface DislikeTag {
  /** 写进规则文本的原始行，删除时按它精确匹配 */
  rule: string
  /** 展示给用户的文字（永远不含 `@` / `~` 这些内部写法） */
  label: string
}

export interface DislikeTagWallProps {
  title: string
  tags: DislikeTag[]
  /** 有值才显示输入框；输入框本身表达「这里要填什么」，占位符即示例 */
  placeholder?: string
  /** 没有规则时的引导文案（可选，只在需要教用户从哪来时给） */
  emptyTip?: string
  onAdd?: (text: string) => boolean | Promise<boolean>
  onRemove: (rule: string) => void
}

/** 一组规则的 Tag 墙：单曲 / 歌手 / 歌名关键词共用 */
export default ({ title, tags, placeholder, emptyTip, onAdd, onRemove }: DislikeTagWallProps) => {
  const theme = useTheme()
  const t = useI18n()
  const [text, setText] = useState('')

  const handleAdd = async() => {
    if (!onAdd) return
    if (await onAdd(text)) setText('')
  }

  return (
    <View style={styles.container}>
      <Text size={13} style={styles.title} color={theme['c-font']}>{title}</Text>
      {onAdd
        ? (
            <View style={styles.inputRow}>
              <View style={[styles.inputWrap, { backgroundColor: theme['c-primary-input-background'] }]}>
                <Input
                  value={text}
                  onChangeText={setText}
                  placeholder={placeholder}
                  size={13}
                  onSubmitEditing={() => { void handleAdd() }}
                />
              </View>
              <Button style={{ ...styles.addBtn, backgroundColor: theme['c-button-background'] }} onPress={() => { void handleAdd() }}>
                <Text size={12} color={theme['c-button-font']}>{t('setting_dislike_add_btn')}</Text>
              </Button>
            </View>
          )
        : null}
      {tags.length
        ? (
            <View style={styles.tags}>
              {tags.map(({ rule, label }) => (
                <View key={rule} style={[styles.tag, { backgroundColor: theme['c-primary-background-active'] }]}>
                  <Text size={12} numberOfLines={1} color={theme['c-font']}>{label}</Text>
                  <TouchableOpacity
                    style={styles.tagClose}
                    activeOpacity={0.6}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() => { onRemove(rule) }}
                  >
                    <Icon name="close" size={9} color={theme['c-font-label']} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )
        : emptyTip
          ? <Text size={12} color={theme['c-font-label']}>{emptyTip}</Text>
          : null}
    </View>
  )
}

const styles = createStyle({
  container: {
    marginBottom: 12,
  },
  title: {
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputWrap: {
    flexGrow: 1,
    flexShrink: 1,
    borderRadius: 2,
    marginRight: 8,
  },
  addBtn: {
    flexGrow: 0,
    flexShrink: 0,
    paddingLeft: 14,
    paddingRight: 14,
    paddingTop: 7,
    paddingBottom: 7,
    borderRadius: 2,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
    paddingLeft: 8,
    paddingRight: 6,
    paddingTop: 4,
    paddingBottom: 4,
    borderRadius: 10,
  },
  tagClose: {
    marginLeft: 4,
  },
})
