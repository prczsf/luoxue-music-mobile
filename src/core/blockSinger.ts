import { addDislikeSinger, hasDislike } from '@/core/dislikeList'
import { playNext } from '@/core/player/player'
import playerState from '@/store/player/state'
import { splitSingers } from '@/utils/singer'
import { confirmDialog, toast } from '@/utils/tools'

/**
 * 屏蔽歌手：把歌手写进「不喜欢」规则（内部存成 `@歌手`，走包含匹配，合唱曲一并屏蔽）。
 *
 * 两条硬约束：
 * 1. 只写规则，绝不动任何歌单/用户数据（ADR 0006）
 * 2. 当前正在播放的歌被命中时自动切下一首，否则用户会停在「已屏蔽但还在播」的状态
 */
export const blockSingers = async(singers: string[]) => {
  const targets = [...new Set(singers.map(s => s.trim()).filter(s => s.length > 0))]
  if (!targets.length) return false
  await addDislikeSinger(targets)
  toast(global.i18n.t('block_singer_success', { singer: targets.join('、') }))
  if (hasDislike(playerState.playMusicInfo.musicInfo)) void playNext(true)
  return true
}

/**
 * 带确认弹窗的「屏蔽该歌手」，列表菜单 / 播放页共用。
 * 合唱曲会拆出每个歌手分别屏蔽（用户点的是「这个歌手」，不是「这个组合」）。
 */
export const handleBlockSinger = async(musicInfo?: { name?: string, singer?: string } | null) => {
  const singers = splitSingers(musicInfo?.singer)
  if (!singers.length) return
  const confirm = await confirmDialog({
    title: global.i18n.t('block_singer'),
    message: global.i18n.t('block_singer_confirm', { singer: singers.join('、') }),
    cancelButtonText: global.i18n.t('cancel_button_text_2'),
    confirmButtonText: global.i18n.t('confirm_button_text'),
    bgClose: false,
  })
  if (!confirm) return
  await blockSingers(singers)
}
