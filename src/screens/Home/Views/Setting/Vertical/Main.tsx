import { memo } from 'react'
import { ScrollView } from 'react-native'

import Basic from '../settings/Basic'
import Player from '../settings/Player'
import LyricDesktop from '../settings/LyricDesktop'
import Search from '../settings/Search'
import List from '../settings/List'
import Download from '../settings/Download'
import Sync from '../settings/Sync'
import Backup from '../settings/Backup'
import Other from '../settings/Other'
import Version from '../settings/Version'
import About from '../settings/About'
import { createStyle } from '@/utils/tools'
import { SETTING_SCREENS, type SettingScreenIds } from '../Main'

// 注意：这里刻意使用 ScrollView 一次性渲染全部设置分区，不要改回 FlatList。
// 每个分区（cell）高度约等于一屏，而本页挂载在 PagerView 的懒创建页里；
// 首帧拿不到有效布局尺寸时，VirtualizedList 会一直命中 `visibleLength <= 0` 的早退分支，
// 渲染窗口被冻结在 initialNumToRender 上（历史配置为 1），表现为首次进入设置页只显示「基本设置」，
// 且因为内容刚好一屏、无法滚动，后续分区永远不会挂载（退出重进才恢复）。
// 本页只有 11 个静态分区、无长列表，虚拟化收益远小于该风险；横屏模式同样使用 ScrollView。

const styles = createStyle({
  content: {
    paddingLeft: 15,
    paddingRight: 15,
    paddingTop: 15,
    paddingBottom: 15,
  },
})

const SectionItem = memo(({
  id,
}: { id: SettingScreenIds }) => {
  switch (id) {
    case 'player': return <Player />
    case 'lyric_desktop': return <LyricDesktop />
    case 'search': return <Search />
    case 'list': return <List />
    case 'download': return <Download />
    case 'sync': return <Sync />
    case 'backup': return <Backup />
    case 'other': return <Other />
    case 'version': return <Version />
    case 'about': return <About />
    case 'basic': return <Basic />
  }
})

export default () => {
  return (
    <ScrollView
      keyboardShouldPersistTaps={'always'}
      contentContainerStyle={styles.content}
    >
      {SETTING_SCREENS.map(id => <SectionItem key={id} id={id} />)}
    </ScrollView>
  )
}
