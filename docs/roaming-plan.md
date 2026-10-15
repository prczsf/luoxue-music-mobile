# 随心漫游（Roaming）实施计划

架构决策见 [ADR 0003](adr/0003-roaming-virtual-list-injection.md)；领域词汇见 [CONTEXT.md](../CONTEXT.md)。本文是工程实施的唯一计划载体，含模块规格、算法细节、分期与验收。

## 0. 范围与分期

- **P1（纯本地，约 5 人日）**：漫游页面 + 全库/单艺人/多选混播规则 + 履带队列 + LRU + 队列弹层。零网络依赖。
- **P2（在线扩展，约 4 人日）**：风格盲盒 + 真随机 + 艺人在线补搜 + 熟歌热歌 Hero + URL 预检。P1 验收通过后启动。

## 1. 文件与改动清单

### 新增

```
src/core/roaming/
├── index.ts            # 对外门面：start(ruleKey) / stop() / 状态订阅
├── libraryIndex.ts     # 全库指纹去重池 + 歌手倒排表 + 软缓存
├── conveyor.ts         # 履带队列引擎（窗口注入/续杯/修剪/剔除补位）
├── lruStore.ts         # 防复读窗口（持久化 FIFO，写节流）
└── samplers/
    ├── index.ts        # Sampler 接口：refill(count): Promise<MusicInfo[]>
    ├── library.ts      # P1 全库
    ├── artist.ts       # P1 艺人（多选=多坐标合并）
    ├── genre.ts        # P2 风格盲盒（含真随机，Tag 置随机）
    └── hotMix.ts       # P2 熟歌热歌

src/screens/Home/Views/Roaming/
├── index.tsx           # 页面容器 + 排除歌单弹层 + 空态引导
├── HeroCards.tsx       # 全库漫游 Hero；熟歌热歌 Hero（P2）
├── ArtistWall.tsx      # Top 9 + 多选混播格，内联点亮模式
├── GenreWall.tsx       # P2 风格色块墙
├── QueuePanel.tsx      # 队列面板（竖屏弹层 / 横屏侧栏共用内容组件）
└── state.ts            # 页面态：激活规则、多选态、索引元数据订阅

docs/adr/0003-roaming-virtual-list-injection.md
CONTEXT.md
docs/roaming-plan.md（本文）
```

### 修改（全部为小改动）

| 文件 | 改动 |
| --- | --- |
| `src/config/constant.ts` | `LIST_IDS` 增 `ROAMING: 'lxm_roaming'`；`NAV_MENUS` 在 `nav_love` 后插入 `{ id: 'nav_roaming', icon: '<图标集内挑选>' }` |
| `src/core/player/player.ts` | `getNextPlayMusicInfo()` 模式 switch 增加漫游顺序播分支（唯一播放器侵入点，见 ADR） |
| `src/screens/Home/Vertical/DrawerNav.tsx` | 抽屉菜单项（图标+文案+i18n） |
| `src/screens/Home/Horizontal/Aside.tsx` | 横屏侧栏菜单项 |
| `src/lang/zh-cn.json` `zh-tw.json` `en-us.json` | 全部文案三语 key |
| 播放栏组件 | 漫游态下歌曲名下方加一行来源小字（`漫游 · <来源名>`），非漫游态零变化 |
| 播放详情页列表名展示 | `playerListId === ROAMING` 时显示漫游来源名而非 `lxm_roaming` |

## 2. 模块规格

### 2.1 libraryIndex — 本地曲库索引

**数据结构**（均为内存，索引本身不复制 MusicInfo）：

```ts
// 指纹 = hash(标准化(name) + '|' + 标准化(singer))
// 标准化：trim → 小写 → 全角转半角 → 去空白与标点
interface RoamingIndex {
  fingerprintToCoord: Map<string, { listId: string, songId: string }>
  artistInverted: Map<string, string[]>   // 歌手名 -> 指纹数组
  topArtists: Array<{ name: string, count: number }>  // 已排除歌单过滤、已排序
  totalSongs: number      // 去重后总数（Hero 副标题 Y）
  participatingLists: number  // 参与漫游的歌单数（Hero 副标题 X，已排除的不计）
  builtAt: number
}
```

**行为**：
- 构建：遍历 `allMusicList`，跳过排除名单内歌单与 `lxm_roaming` 自身；每首歌算指纹，重复指纹丢弃（保留首个坐标）。合唱拆分正则：`[/、&;，,]`，拆出的每个歌手名都挂该指纹。
- 软缓存：整包序列化后经 `plugins/storage` 存储（key 带 schema 版本号）；启动时读缓存即时可用，后台校验新鲜度。
- 失效：订阅 `global.list_event` 的歌单增删改/歌曲增删改事件，置 `dirty`；下次进漫游页时重建（后台重建 + 完成后替换，重建期间用旧索引）。
- 性能目标：3000 首 < 1s；超时则分片（每 500 首让出一次事件循环）。
- 排除名单：`Array<listId>`，存 `plugins/storage`；UI 入口在页面右上角弹层。
- 取歌：`getMusicByCoord(coord)` 回查 `allMusicList`；查不到（歌被删）视为失效坐标，丢弃并计数，重建时自愈。

### 2.2 conveyor — 履带队列引擎

**契约参数**（详见 ADR §3）：窗口 18、续杯水位 <5、续杯量 5、修剪阈值 >10、修剪量 5。

```ts
type RoamingStatus = {
  active: boolean
  ruleKey: string | null       // 如 'library' / 'artist:陈奕迅' / 'genre:轻音'
  sourceLabel: string          // 播放栏/队列面板展示名
  queue: MusicInfo[]           // 当前窗口（供 UI 直接订阅渲染）
  playedRecent: MusicInfo[]    // 窗口内已播段（供队列面板置灰区）
}
```

**核心流程**：
- `start(rule, sourceLabel)`：`removeMusicList(ROAMING)`（清理旧漫游）→ `sampler.refill(18)` → `setMusicList(ROAMING, list)` → `playList(ROAMING, 0)` → 广播状态。本地池不足 18 首时有多少注入多少（<1 首按空态处理）。
- 切歌驱动：订阅 `global.app_event.musicToggled`，判断 `playerListId === ROAMING` 时：
  1. **续杯**：窗口内剩余可播 <5 → `refill(5)` 追加尾部（失败：重试 1 次 → 仍失败则 Toast + 停止续杯，不打断当前播放）。
  2. **修剪**：窗口内已播 >10 → `splice(0, 5)` → `updatePlayIndex()`（现成函数，按当前歌 id 重算下标）。
  3. **LRU 登记**：当前歌指纹入 LRU 窗口（节流持久化）。
  4. **剔除补位**（队列面板"不想听"触发）：移除目标（不得移除当前播放歌，UI 层禁用该按钮）→ 追加 1 首补位。
- `stop()`：停续杯 → `removeMusicList(ROAMING)` → 广播状态。当前歌由播放器自然播完（用户显式停止时调 `pause()`，二选一在实现时按体验定，默认播完不打断）。
- 会话内跳过集：`Set<指纹>`，P2 预检失败歌标记于此；重启丢失（刻意）。

**播放器分支**（伪码）：

```
// getNextPlayMusicInfo() 的 switch 之前
if (currentListId == LIST_IDS.ROAMING) {
  return playerIndex + 1 < currentList.length
    ? { musicInfo: currentList[playerIndex + 1], listId: currentListId, isTempPlay: false }
    : null   // 尾部无歌=续杯失败，停在当前歌，不报错
}
```

### 2.3 lruStore — 防复读窗口

- FIFO `string[]`（指纹），容量 300；`has(fp)` 判断放行。
- 动态缩窗：当前规则可用池总指纹数 < 500 时，窗口有效容量 = `池大小 × 0.6`。
- 兜底：抽样 3 次仍全部撞窗 → 无视 LRU 放行（软约束，永不阻塞）。
- 持久化：`plugins/storage`，写入按 5 秒合并节流；App 启动时加载。
- 属于"所有漫游规则共享"的单例，不随规则切换清空。

### 2.4 samplers — 抽样器

```ts
interface Sampler {
  refill(count: number): Promise<LX.Music.MusicInfo[]>
}
```

- **library**：从去重坐标池随机取 `count` 个未在 LRU 的坐标 → 取歌。
- **artist（含多选）**：艺人倒排表取该艺人（或多艺人合并去重）的指纹数组 → 过滤 LRU → 随机取 → 取歌。P2 追加在线补搜（见 2.5）。
- **genre（P2）**：见 §4。
- **hotMix（P2）**：见 §4。

抽样统一在**指纹层**做 LRU 过滤与去重，保证本地/在线混合池行为一致。

## 3. UI 规格

### 3.0 用户可见文案用词原则

代码内部术语（履带队列、指纹、蓄水池、LRU 等）**永不出现**在 UI 上。用户文案一律用生活化词汇，对照表：

| 内部概念 | 用户看到的词 |
| --- | --- |
| 履带队列 / 窗口 | （不展示；面板叫"播放列表"） |
| 指纹去重 | （不展示，副标题只说"共 Y 首"） |
| LRU 防复读 | （不展示） |
| 蓄水池 | （不展示） |
| 全库 / 本地曲库 | **全部歌曲** |
| 歌手池 / Top9 歌手 | **常听歌手** |
| 索引 / 缓存 / 倒排表 | （不展示） |
| 多歌手混播 | **一起听** |
| 即将漫游区 | **接下来播放** |
| 已播区 | **最近听过** |
| 永久屏蔽 | **不再播放**（这首） |
| 不想听 | **不想听**（剔除当前列表这首） |
| 结束漫游 | **结束漫游** |
| 垫刀 / 在线补搜 | （不展示） |
| URL 预检 | （不展示） |

**文案自检规则**（P1-5 验收项）：逐条过所有 i18n value 与硬编码 UI 字符串——凡是需要"懂点技术"
才能理解的词（曲库、索引、缓存、去重、队列、采样、LRU、预检……）一律换成生活用语或直接不展示；
i18n 的 key 用技术词没关系，用户永远看不到 key。

### 3.1 导航

- `NAV_MENUS` 第 5 位（`nav_love` 与 `nav_setting` 之间），文案"随心漫游"，图标从现有图标集挑选（无 emoji）。

### 3.2 页面布局（`index.tsx`）

- 纵向滚动三区块：HeroCards → ArtistWall → GenreWall（P1 中 GenreWall 不渲染，空态引导文案改为"歌单里还没有歌"）。
- 右上角：排除歌单按钮 → 底部弹层多选（歌单名 + checkbox，标题"不参与漫游的歌单"，确认后持久化并触发索引重建）。
- 横屏/平板（`Home/Horizontal` 结构）：漫游页占主区，队列面板右侧常驻（可折叠）。

### 3.3 HeroCards

- 全部歌曲漫游（Hero 主标题就叫"全部歌曲"）：动态副标题"来自 X 个歌单 · 共 Y 首"（口径见 2.1，不出现"去重"字样）；激活态：主题色高亮边框 + 音频频谱小图标动画 +「重新洗牌」按钮（与再点卡片等价）；右上角常驻过滤歌单入口（与工具栏同一弹层）。再点 = 换一批（`start` 同规则重抽）。
- 熟歌热歌（P2）：副标题"70% 常听的老歌 + 30% 榜单新歌"（随档位联动）；底部三档胶囊（保守 8:2 / 均衡 7:3 [默认] / 探索 5:5），点击阻断冒泡、只改后续续杯比例不重播。
- 空态（总歌 <5）：半透明遮罩 + 引导文案，点击滚动到下方区块。

### 3.4 ArtistWall（区块标题"常听歌手"）
- `FlatList`/Grid，`grid-template-columns` 等价布局：`repeat(auto-fill, minmax(110px,1fr))`，Top 11 + 第 12 格（格子文案"一起听"）。
- 磁贴：歌手名 + "本地 N 首"角标；有缓存封面取第一张高斯模糊背景。
- 点击 = 单艺人起播；激活态同 Hero（高亮+频谱，再点换一批）。
- 多选混播入口（文案"一起听"）：点击第 12 格 → 前 11 格右上角出现勾选态 → 连点点亮 → 浮出"一起听 (n)"按钮（n=0 时禁用）；起播后退出点亮态。

### 3.5 QueuePanel（P1）
### 3.5 播放列表弹层（QueuePanel，P1）
- 竖屏：播放栏列表按钮呼出底部弹层；横屏：右侧常驻栏；内容组件共用。
- 弹层标题：`播放列表 · 3/18`（当前第几首/共几首）；结构自上而下：**"结束漫游"按钮**（Q19）→ "最近听过"区（置灰，已播段，最多 10 条）→ 当前播放（高亮）→ "接下来播放"区（剩余段）。
- "接下来播放"条目：悬停/长按出操作——"不想听"（剔出+自动补一首）；长按菜单另有"不再播放"（写 `dislikeList`，Toast 确认）。
- 当前播放条目的"不想听"按钮禁用。

### 3.6 播放栏与详情页

- 漫游态播放栏：歌曲名下方小字 `漫游 · <sourceLabel>`；非漫游态不渲染该行（零布局变化）。
- 播放详情页：列表名位置显示 `sourceLabel` 而非 `lxm_roaming`。

### 3.7 通用

- 所有图标走 Icon 组件，全 UI 无 emoji 字符（与仓库现状一致）。
- 动效：激活态呼吸边框 + 频谱条动画；加载态旋转 Icon；失败态色块轻抖（`LayoutAnimation`/`Animated` 实现）。
- 文案三语：`zh-cn` / `zh-tw` / `en-us` 全量 key，不允许裸 key 显示。

## 4. P2 在线规格

### 4.1 风格盲盒（genre sampler）

- 8 预设块（写死）：摇滚现场 / 轻音写代码 / 华语怀旧 / ACG 二次元 / 民谣故事 / 欧美流行 / 爵士R&B / 全网真随机。
- **Tag 别名映射表**：内置 `预设 → [各源别名数组]`；实现前先实跑三源 `getTags()` 核对实际 Tag 名定表。
- 流程：点击 → 色块呼吸灯+旋转 → 取当前选中源 `getTags()` 匹配 tagId → `getList` 随机翻 2 个不同歌单（先读 `allPage` 再随机页码）拉详情 → 合并 Fisher-Yates → 前 10 入队起播、其余入**蓄水池** → 蓄水池 <20 时后台换歌单续满。
- **真随机**：同流程，歌单广场列表本身随机排序取 2 个（不限 Tag）。

### 4.2 在线源与降级（Q11）

- 请求走用户当前选中源；超时 3 秒 → 按运行时已启用源列表顺序逐个降级；全部失败 → 色块轻抖 + Toast + 自动回退全库漫游（绝不卡死）。
- 不并发 `all` 源（风控）；单源单发。

### 4.3 艺人在线补搜（垫刀）

- 起播后本地坐标抽 3 首即播；后台 `search(name, 1, 当前源)` 拉第 1 页（30 首），洗牌、指纹去重后混入续杯池，本地:在线 ≈ 6:4。失败静默（Toast 一次），不影响本地续杯。
- 多选混播自动追加：对每个选中艺人各拉一页，合并去重混入（UI 零改）。

### 4.4 熟歌热歌 Hero

- 榜单池：`core/leaderboard` 各源推荐榜/热歌榜前 50，进页面时后台预取并缓存。
- 混排：本地池 : 榜单池按当前档位（默认 7:3）续杯混合；档位切换只影响后续续杯。

### 4.5 URL 预检

- 触发：订阅进度事件，当前歌**剩余时长 <60 秒**且下一首为在线歌 → 调 `getMusicUrl({ musicInfo, quality: 播放音质, isRefresh: false })`（命中现有 URL 缓存则零成本）。
- 成功：URL 缓存已写入，切歌自动秒播。
- 失败：该歌指纹入**会话内跳过集** → 从窗口移除（非当前歌）→ 蓄水池/抽样器补位 1 首。全程无 Toast、无播放中断。
- 预检并发限 1（只预检紧邻下一首）。

## 5. 验收标准

### P1（Q21 口径）

1. 导航入口（抽屉+横屏侧栏）可见可进，三区块（Hero/艺人墙/空位）正常渲染。
2. 全库 / 单艺人 / 多选混播点击即起播（本地 <200ms 出声）；连续播放/切歌 ≥50 首无卡顿、无重复（LRU 生效）。
3. 队列弹层：已播置灰可回溯、当前高亮、"不想听"剔除后自动补位、"结束漫游"生效。
4. 回归：退出漫游后，普通列表的随机/列表循环/顺序/单曲循环、稍后播放优先级、上一首回溯全部行为不变。
5. 空态：本地总歌 <5 时 Hero/艺人墙引导文案生效。
- 6. 三语文案无裸 key；全 UI 无 emoji；文案走查：按 §3.0 对照表逐条检查用户可见字符串，无技术黑话（曲库/索引/缓存/去重/队列/LRU 等一律不出现）。

### P2（P1 通过后细化）

1. 三源各实测盲盒全流程（含 Tag 别名命中、随机翻页、蓄水池续满）。
2. 断网/超时场景：降级链路、全失败回退全库、无卡死。
3. 艺人补搜混入且指纹去重生效（本地在线撞车不复读）。
4. 预检：死链歌在用户无感下被剔除补位；URL 缓存命中秒播。

## 6. 风险与对策

| 风险 | 对策 |
| --- | --- |
| 索引构建阻塞 JS 线程 | 分片让出 + 软缓存先用旧索引；实测 3000 首耗时 |
| 在线源风控（补搜/盲盒高频请求） | 单源单发、不并发 all、蓄水池减少请求频率、预检并发限 1 |
| Tag 别名与各源实际不符 | P2 开工第一步实跑 `getTags()` 定表 |
| 播放器分支误伤现有模式 | 分支前置条件 `playerListId === ROAMING`，回归测试覆盖四种播放模式 |
| 小曲库 LRU 抽干 | 缩窗至 60% + 3 次兜底放行，永不阻塞 |

## 7. 工期

| 阶段 | 内容 | 估时 |
| --- | --- | --- |
| P1-0 | 常量/导航/i18n/入口 | 0.5d |
| P1-1 | libraryIndex | 1d |
| P1-2 | conveyor + lruStore + 播放器分支 | 1.5d |
| P1-3 | library/artist 抽样器 | 1d |
| P1-4 | UI（页面/Hero/艺人墙/队列面板/播放栏） | 1.5d |
| P1-5 | 验收与回归 | 0.5d |
| P2-1 | genre 抽样器 + 别名表 + 源降级 | 1.5d |
| P2-2 | 艺人补搜 + hotMix Hero | 1d |
| P2-3 | URL 预检 | 0.5d |
| P2-4 | 验收与回归 | 1d |
