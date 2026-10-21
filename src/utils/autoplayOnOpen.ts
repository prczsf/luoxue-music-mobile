import settingState from '@/store/setting/state'

/**
 * 本次运行里已经自动起播过的目标。
 * 只存在内存里：重启应用重新计一次，不写任何配置，也不碰用户歌单。
 */
const triggered = new Set<string>()

/**
 * 打开歌单是否自动起播（车载场景，设置项 `list.playAllOnOpen`）。
 *
 * 返回起始下标；返回 `null` 表示这次不该自动播放。
 * 同一个目标在一次运行里只自动起播一次，避免来回切换页面时反复打断当前播放。
 */
export const getAutoplayStartIndex = (key: string, total: number): number | null => {
  const mode = settingState.setting['list.playAllOnOpen']
  if (mode == 'off' || total <= 0) return null
  if (triggered.has(key)) return null
  triggered.add(key)
  return mode == 'random' ? Math.floor(Math.random() * total) : 0
}
