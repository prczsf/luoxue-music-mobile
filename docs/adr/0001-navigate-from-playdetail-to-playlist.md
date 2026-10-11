# ADR 0001: 全屏播放页直达所属歌单交互与导航架构

## 状态 (Status)
已采纳 (Accepted)

## 背景与问题 (Context)
在原有交互设计中，用户从歌曲全屏播放页（`PlayDetail`）无法直观得知当前歌曲来自哪个歌单，更无法一键返回或跳转至该歌单详情；
原有唯一隐藏逻辑是主页迷你播放条（`PlayerBar`）上的“长按标题”，极其隐蔽且反直觉；而在全屏播放页，左上角返回键仅简单出栈（`pop`）返回上一级来源页（如搜索结果页、设置页），导致用户在沉浸播放音乐时想要浏览或管理整张歌单时路径严重受阻。

同时，若直接在全屏播放器上粗暴 `push` 歌单详情页，会导致 `Home -> MylistDetail -> PlayDetail -> MylistDetail -> PlayDetail` 的导航栈无线嵌套与内存膨胀。

## 决策方案 (Decision)

### 1. 视觉与排布（优雅双行融合）
- 位于竖屏 `PlayDetail/Vertical/components/Header.tsx` 与横屏 `PlayDetail/Horizontal/components/Header.tsx` 中的 `Title` 区域。
- **第一行**：歌曲名（粗体、单行截断）。
- **第二行**：
  - 左侧：歌手名（`musicInfo.singer`，自然占据剩余宽度）；
  - 右侧：轻量半透明药丸胶囊（Capsule），形态为 `[图标: album/folder] [歌单名] [图标: chevron-right]`，背景带有与主题色融合的半透明微底色；
  - 严禁使用任何 emoji 图标，统一使用项目矢量图标 `<Icon name="..." />`。

### 2. 来源智能识别与国际化
- 读取 `playerState.playMusicInfo.listId`：
  - 若为 `LIST_IDS.DEFAULT` -> 显示对应多语言「默认列表」；
  - 若为 `LIST_IDS.LOVE` -> 显示对应多语言「我的喜爱」；
  - 若为用户自建歌单（`userlist_xxx`） -> 从 `allList` 中匹配其实际名称；
  - 若为下载列表、临时列表、单曲搜索试听等无归属歌单 -> 不显示胶囊或仅展示来源但不提供无效跳转。

### 3. 导航出栈复用与定位联动（Anti-Stack-Overflow）
- 用户点击歌单胶囊时触发：
  1. 检查当前导航栈：
     - 若 `commonState.componentIds.mylistDetail` 存在且其关联的正是该歌单，则调用 `pop(playDetailComponentId)` 关闭播放页，并向全局触发 `global.app_event.jumpListPosition()`，自动高亮并平滑居中滚动到该歌曲。
     - 若底层并非该歌单（如来自首页搜索页进入），则先安全出栈关闭 `PlayDetail`，随后调用 `navigations.pushMylistDetailScreen(homeComponentId, listId)` 打开该歌单详情，同时内部携带定位标记 `waitJumpListPosition`，确保进入新详情页时丝滑直达当前歌曲位置。

## 影响与收益 (Consequences)
- **正面收益**：
  - 用户从单曲播放到歌单消费与管理的链路从“不可达”变为“0 认知门槛、一键直达”。
  - 杜绝重复页面推栈，导航栈状态始终保持干净可控。
- **代价与权衡**：
  - Header 第二行需要合理设定歌手名与胶囊的宽度分配（`maxWidth` + `numberOfLines={1}`），确保超长歌名与超长歌单名并存时无文字溢出与变形。
