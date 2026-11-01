import { memo, useMemo, useRef } from 'react'
import { StyleSheet, View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import Button from '../../components/Button'
import Text from '@/components/common/Text'
import { toast } from '@/utils/tools'
import { useI18n } from '@/lang'
import { state, useDislikeInfo, useRuleNum } from '@/store/dislikeList'
import { overwirteDislikeInfo } from '@/core/dislikeList'
import { appendDislikeRule, buildNameKeywordRule, buildSingerRule, removeDislikeRule } from '@/utils/dislikeManage'
import { MIN_KEYWORD_LEN, normalizeDislikeText } from '@/utils/dislikeMatch'
import { SPLIT_CHAR } from '@/config/constant'
import DislikeEditModal, { type DislikeEditModalType } from './DislikeEditModal'
import DislikeTagWall from './DislikeTagWall'

/**
 * 「不想听的内容」规则。
 *
 * 界面分三组 Tag：单曲（来自歌曲菜单的「不喜欢」）、歌手、歌名关键词。
 * 主路径零语法：分组标题 + 输入框占位符就说明了要填什么，
 * 内部写法（`@歌手` / `~关键词`）只在「手动编辑规则」里出现。
 */
export default memo(() => {
  const t = useI18n()
  const modalRef = useRef<DislikeEditModalType>(null)
  const ruleNum = useRuleNum()
  const info = useDislikeInfo()

  const musicTags = useMemo(() => [
    ...[...info.musicNames].map(rule => ({ rule, label: rule })),
    ...[...info.names].map(rule => ({ rule, label: rule.replace(SPLIT_CHAR.DISLIKE_NAME, ' · ') })),
  ], [info])
  const singerTags = useMemo(() => [
    ...info.singerKeywords.map(singer => ({ rule: buildSingerRule(singer), label: singer })),
    ...[...info.singerNames].map(singer => ({ rule: buildSingerRule(singer), label: singer })),
  ], [info])
  const keywordTags = useMemo(() => info.nameKeywords.map(keyword => ({ rule: buildNameKeywordRule(keyword), label: keyword })), [info])

  const saveRules = async(rules: string) => {
    if (rules.trim() == state.dislikeInfo.rawRules.trim()) return
    await overwirteDislikeInfo(rules)
    toast(t('setting__other_dislike_list_saved_tip'))
  }

  const handleShow = () => {
    modalRef.current?.show(state.dislikeInfo.rawRules)
  }

  const handleSave = (rules: string) => {
    void saveRules(rules)
  }

  const handleAddRule = async(text: string, build: (text: string) => string) => {
    const value = text.trim()
    if (!value) {
      toast(t('setting_dislike_rule_empty_tip'))
      return false
    }
    if (normalizeDislikeText(value).length < MIN_KEYWORD_LEN) toast(t('setting_dislike_rule_short_tip'))
    const nextRules = appendDislikeRule(state.dislikeInfo.rawRules, build(value))
    if (nextRules == state.dislikeInfo.rawRules.trim()) {
      toast(t('setting_dislike_rule_exists_tip'))
      return true
    }
    await saveRules(nextRules)
    return true
  }

  const handleRemoveRule = (rule: string) => {
    void saveRules(removeDislikeRule(state.dislikeInfo.rawRules, rule))
  }

  return (
    <SubTitle title={t('setting__other_dislike_list')}>
      <View style={styles.ruleNum}>
        <Text size={13}>{t('setting__other_dislike_list_label', { num: ruleNum })}</Text>
      </View>
      <DislikeTagWall
        title={t('setting__other_dislike_music_title')}
        tags={musicTags}
        emptyTip={t('setting__other_dislike_music_empty')}
        onRemove={handleRemoveRule}
      />
      <DislikeTagWall
        title={t('setting__other_dislike_singer_title')}
        tags={singerTags}
        placeholder={t('setting__other_dislike_singer_placeholder')}
        onAdd={async text => handleAddRule(text, buildSingerRule)}
        onRemove={handleRemoveRule}
      />
      <DislikeTagWall
        title={t('setting__other_dislike_keyword_title')}
        tags={keywordTags}
        placeholder={t('setting__other_dislike_keyword_placeholder')}
        onAdd={async text => handleAddRule(text, buildNameKeywordRule)}
        onRemove={handleRemoveRule}
      />
      <View style={styles.btn}>
        <Button onPress={handleShow}>{t('setting_other_dislike_list_show_btn')}</Button>
      </View>
      <DislikeEditModal ref={modalRef} onSave={handleSave} />
    </SubTitle>
  )
})

const styles = StyleSheet.create({
  ruleNum: {
    marginBottom: 5,
  },
  btn: {
    flexDirection: 'row',
  },
})
