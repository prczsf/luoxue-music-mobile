# ADR 0002: 我的下载页面与本地音乐播放架构

## Status
Accepted

## Context
随着上一版本增加了自定义下载目录及音质配置，用户已经能够下载歌曲至本地目录。但应用内缺少一个直观查看已下载音乐、并支持本地播放的独立界面。
用户诉求：
1. 提供入口访问已下载的音乐；
2. 真实反映下载目录中的歌曲；
3. 支持「全部播放」以及「点击单曲后按顺序播放」；
4. 支持单曲管理（添加到自建歌单、删除本地音频文件）。

## Decision

### 1. 导航与入口
- 在侧边栏抽屉菜单（`DrawerNav.tsx`）增加「我的下载」入口（ID: `nav_download`，图标: `download-2`），点击时关闭抽屉并 push 进入独立页面 `DOWNLOAD_SCREEN`。
- 注册 Navigation 组件：`COMPONENT_IDS.download` 与 `navigations.pushDownloadScreen(fromComponentId)`。

### 2. 数据源与扫描机制
- 数据驱动源为当前生效的下载路径（`getDownloadDir()`）。
- 利用现有 `scanAudioFiles` 模块扫描下载目录下的音频文件（.mp3, .flac, .wav, .m4a, .ogg 等）。
- 使用 `buildLocalMusicInfoByFilePath` 构造 `LX.Music.MusicInfoLocal` 对象，快速呈现列表；同时后台异步增量解析 `readMetadata` 获取精确歌曲名、歌手与封面。
- 提供手动刷新（下拉刷新/顶部刷新按钮），若外部文件变更可即时同步。

### 3. 播放链路
- 播放复用已有针对本地音频（`source: 'local'`）的原生支持：
  - 点击「播放全部」：调用 `setTempList('download__list', list)`，再调用 `playList(LIST_IDS.TEMP, 0)`；
  - 单击某首歌曲：调用 `setTempList('download__list', list)`，再调用 `playList(LIST_IDS.TEMP, index)`，播放器自动按顺序接续播放；
  - 本地音频解析器 `src/core/music/local.ts` 自动读取 `filePath` 并提取内嵌专辑封面。

### 4. 单曲操作与文件删除
- 单曲更多操作菜单支持：
  - 「添加到歌单」：唤起 `MusicAddModal`，支持加入用户自建歌单；
  - 「删除」：弹窗二次确认，调用 `unlink` 删除磁盘本地文件，成功后自动从列表中移除并 toast 提示。

## Consequences
- **Positive**: 
  - 零数据不一致风险，完全以磁盘真实音频为准；
  - 复用成熟的播放链路，支持通知栏、锁屏与后台顺畅播放本地音频；
  - 侧边栏入口结构清晰，不挤占底部主 Tab 空间。
- **Trade-offs**:
  - 大量文件首次扫描时需异步分批解析 metadata，首屏通过文件名秒级渲染保障流畅度。
