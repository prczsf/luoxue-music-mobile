# 随心漫游 P2（在线扩展）进度追踪

> 主计划与规格见 [roaming-plan.md](./roaming-plan.md)（§4 P2 在线规格、§5 验收标准、§6 风险）。
> 本文档用于逐任务勾选追踪；完成后在「状态总览」改状态并注明 commit。

## 状态总览

| 任务 | 内容 | 状态 | 备注 |
| --- | --- | --- | --- |
| P2-1 | 风格盲盒（genre 抽样器 + 别名表 + 源降级 + GenreWall UI） | ✅ 完成 | commit `1966501`，已编译装机，启动日志干净 |
| P2-2 | 艺人在线补搜 + 熟歌热歌 Hero（hotMix） | ✅ 完成 | commit `83d9cf7`，编译装机 + 真机验证（Hero 起播 / 档位胶囊 / 冷启动起播修复）；详见「真机验证结果」「缺陷修复」 |
| P2-3 | URL 预检（死链无感剔除） | ⬜ 未开始 | 规格见主计划 §4.5 |
| P2-4 | P2 验收与回归 + 文档收尾 | ⬜ 未开始 | 验收清单见下方 |

---

## 开工前必读（代码审查结论）

> 审查对象：P1 + P2-1 已提交后的工作树（`c5bdbee`、`1966501`）。结论：**P2 可以继续**，但下面 4 个缺口要在 P2-2/P2-3 里一并处理，否则 P2-4 的验收项过不了。

### 已核对通过的实现前提（照文档写即可，不必重查）

- **榜单**：`getLeaderboardSetting()` → `{ source, boardId }`（默认 `kw__16`，`src/config/constant.ts:140`）；`getBoardsList(source)`（`src/core/leaderboard.ts:35`）返回的 `BoardItem.id` 已是 `kw__16` 形态，可直接喂给 `getListDetail`。**注意有同名函数**：榜单是 `core/leaderboard.getListDetail(id, page)`（`:108`），歌单广场是 `core/songlist.getListDetail(id, source, page)`（`:173`），别引错。
- **榜单命名**：kw/kg/tx/wy/mg 每源都有「热歌榜 / 飙升榜 / 新歌榜」，§4.4 的 `热歌|飙升|新歌|hot|new` 正则各源都能命中，命中优先、否则取 `boards[0]` 的兜底有效。
- **在线源能力**：5 个在线源都具备 `leaderboard` / `songList` / `musicSearch`；`xm` 不在 `music.sources` 里，不会进降级链。
- **搜索补搜**：`musicSdk[src].musicSearch.search(str, page, limit)` 返回 `{ list, allPage, total, limit, source }`，**list 是旧格式**（`songmid`/`_types`，见 `kw/musicSearch.js:81-105`），必须 `toNewMusicInfo`（`src/utils/index.ts:28`）；`searchMusicState.sources` = 5 源 + 末尾 `'all'`（`src/store/search/music/state.ts:43-56`），取「第一个非 all」的策略成立。
- **履带注入前提成立**：`setMusicList` 存的就是同一数组引用（`src/utils/listManage.ts:22`），`window_` 原地 push/splice 即可驱动播放器。
- **风格盲盒前提成立**：`getSortList` 由模块加载时静态填充（`src/store/songlist/state.ts:116`），冷启动不为空；空 tagId 是歌单页首屏的合法路径（`:96`）。
- **URL 缓存零成本**：`src/core/music/online.ts:55-57` 命中 `getStoreMusicUrl` 即返回、不发网络，与 §4.5 一致。

### 必须处理的缺口

1. **窗口去重只按 `id`** — `src/core/roaming/conveyor.ts:84` 用 `window_.map(m => m.id)` 判重。P2-2/P2-3 会混入「本地 + 在线同一首歌（不同 id）」，届时会重复入窗，直接对应验收项「艺人补搜混入且指纹去重生效（本地在线撞车不复读）」。→ 窗口改用指纹 Set（复用 `getMusicFingerprint`），`start` / `backfill` / `removeAt` 全走指纹判重。
2. **P2-3 预检必须传 `allowToggleSource: false`** — `src/core/music/utils.ts:312-327`：失败且允许换源时会走 `getOtherSource()` 跨源搜索（12 秒超时），并返回**另一个源 MusicInfo 的 URL**，死链会被伪装成"预检成功"（漏判），同时违反 §6「单源单发」风控。§4.5 的 `getMusicUrl(...)` 调用需补此参数。
3. **进度不是事件源** — 没有每 tick 的进度事件：`src/core/init/player/playProgress.ts:64-71` 用 BackgroundTimer 每 1000ms 轮询 `getPosition()` 写 `playerState.progress.nowPlayTime/maxPlayTime`（单位秒）；`app_event.setProgress` 只在拖动进度条 / 远程 seek 时触发（`components/player/Progress.tsx:116`、`plugins/player/service.ts:76`）。预检应订阅 store 字段或自建 1s 轻量 tick，不要去等不存在的事件。
4. **续杯失败即永久停续杯，且不回退全库** — `conveyor.ts:90-93` 置 `refillFailed` 后永久 return：P2 在线抽样下一次 3 秒超时就会让会话在窗口播完后静默结束，只满足「不卡死」、不满足 PRD「全部失败自动回退本地全库漫游」。需明确取舍（接受则写进文档，否则补回退）。

### P2-1 遗留的验证缺口

`src/core/roaming/samplers/genre.ts:49-56` 的**标签别名表是推测写死的**，而 §6 要求「P2 开工第一步实跑 `getTags()` 定表」；P2-1 只做了编译 + 装机 + 启动日志干净（真机从未点过色块，该验证挂在 P2-4 第一项）。建议开 P2-2 前先真机点一遍 8 个色块、核对各源 Tag 命中，免得两类 bug 混在一起。

### 静态健康度（审查时实测）

- `npx eslint src/core/roaming src/screens/Home/Views/Roaming` → 0 问题
- `npx tsc --noEmit` → 5 个错误，全在漫游两个 commit 未碰过的文件里（`src/core/player/timeoutExit.ts`、`src/plugins/player/hook.ts`、`src/screens/Home/Views/SongList/HeaderBar/SourceSelector.tsx`、`src/store/player/action.ts`），属既有错误
- 三语 `roaming_*` key 各 32 个，数量一致

---

## P2-1 风格盲盒 ✅（commit `1966501`）

- [x] `src/core/roaming/samplers/genre.ts`：8 个风格预设、`GenreNameKey` 字面量联合类型、标签别名匹配（精确→包含）、单源 3s 超时逐级降级、蓄水池续满
- [x] `src/core/roaming/index.ts`：`startGenre(genreId)` 门面 + `GENRE_PRESETS` 导出
- [x] `src/screens/Home/Views/Roaming/GenreWall.tsx`：两列色块墙、加载态/激活态、失败色块轻抖 + Toast + 回退全库
- [x] `Roaming/index.tsx` 区块顺序 Hero → ArtistWall → GenreWall；空态点击滚到风格盲盒
- [x] `HeroCards.tsx` / `ArtistWall.tsx`：重新洗牌按钮、过滤齿轮、Top11 + 第 12 格、磁贴模糊封面、`onScrollToGenre`
- [x] 三语 i18n 新增风格盲盒等 key；`libraryIndex.ts` Top 9→11
- [x] 验证：lint / tsc（仅剩 5 个既有无关错误）/ JSON 三语 → `pack:android` → adb 安装 + 启动日志干净

---

## P2-2 艺人补搜 + 熟歌热歌 Hero 🔄

### 任务拆解

- [x] 前置）`src/core/roaming/conveyor.ts` 窗口改指纹判重（本地/在线同曲不重复入窗，见「开工前必读」缺口 1）
- [x] a) 艺人在线补搜：`src/core/roaming/samplers/library.ts` 的 `createArtistSampler` 增强（首次纯本地垫刀 → 后台顺序补搜 → 6:4 混入）
- [x] b) 新建 `src/core/roaming/samplers/hotMix.ts`：榜单池预取 + 混排抽样器 + 档位比例
- [x] c) `src/core/roaming/index.ts` 门面导出：`startHotMix` / `prewarmHotMix` / `getHotMixRatio` / `setHotMixRatio` / `getHotMixPercent` / `HOT_MIX_RATIOS`
- [x] d) `HeroCards.tsx` 第二张卡（熟歌热歌）：副标题随档位联动 + 底部三档胶囊（stopPropagation）
- [x] e) `Roaming/index.tsx`：进页面后台预取榜单（`prewarmHotMix` fire-and-forget）
- [x] f) 三语 i18n 新 key（标题/副标题/三档位/补搜失败 Toast）
- [x] g) 验证：lint + tsc + JSON ✅（eslint 0 问题、tsc 仅既有 5 错、三语各 609 key 对齐）→ `pack:android` ✅ → adb 装机 ✅ → 真机预取/胶囊/起播 ✅（见「真机验证结果」）

### 实现记录（P2-2，代码已落地）

- **前置 · conveyor 指纹判重**：新增 `windowFingerprints` + `dedupeByFingerprint` / `syncWindowFingerprints`；`start()` 起播前去重、`backfill()` 入窗前与窗口比对、`trimIfNeeded()` / `removeAt()` / `stop()` 同步集合 —— 本地/在线同一首歌（不同 id）只保留一首。
- **a) 艺人补搜**（`samplers/library.ts`）：首次 refill 纯本地（0 延迟出声）+ `void fetchOnline()`；`fetchOnline` 单飞（`onlineFetching`），按 `names` 顺序逐个 `musicSdk[src].musicSearch.search(name, 1, 30)`；结果 `toNewMusicInfo` 后与本地倒排 / 在线池 / LRU 三重指纹比对才入池；续杯按 `ONLINE_RATIO = 0.4` 混入（`count = 5` → 3 本地 + 2 在线），失败每会话最多一次 Toast `roaming_artist_search_failed`，永不阻塞本地续杯。
- **b) hotMix**（`samplers/hotMix.ts`）：榜单源取 `getLeaderboardSetting().source`（无 `leaderboard` 实现则直接返回）；`getBoardsList(source)` 后按 `热歌|飙升|新歌|hot|new` 各取首个命中榜（最多 3 榜），全不命中取 `boards[0]`；每榜 `getListDetail(board.id, 1..2)` **顺序**拉取（单榜失败 `break` 换榜，不并发），入池前指纹去重；三档 `HOT_MIX_RATIOS`（conservative 0.8 / balanced 0.7 默认 / explore 0.5，值为本地占比），比例在 `refill` 时才读，切换只影响后续续杯；线上混入数 `max(1, count - round(count * ratio))`。
- **预取语义**：`prewarmHotMix()` 单飞 + `prewarmed` 标记 —— 同一次运行只成功预取一次，池用尽后纯本地降级、不再重复拉榜（风控）；失败/空结果不置标记，下次进页面或续杯时自愈重试；全程静默。
- **降级链**：榜单池空 → 纯本地（本地也空时 `conveyor.start` 返回 false → Toast `roaming_start_failed`）；热歌卡无空态遮罩（本地 <5 但榜单可用仍可播）、无过滤齿轮。
- **c) 门面**（`core/roaming/index.ts`）：新增 `startHotMix`（`ruleKey = 'hotmix'`，label = `roaming_hero_hotmix`）及 `prewarmHotMix` / `getHotMixRatio` / `setHotMixRatio` / `getHotMixPercent` / `HOT_MIX_RATIOS` / 类型导出；UI 仍只依赖本文件。
- **d) HeroCards**：两卡纵向堆叠通栏（`heroWrap` gap 10，P1 通栏布局不回退）；热歌卡图标 `leaderboard`；副标题 `roaming_hotmix_desc` 插值 `{local}` / `{hot}` 随档位联动；底部三档胶囊 `onPress` 内 `e.stopPropagation?.()` 只改比例；激活态高亮 + 频谱；点击未激活 `startHotMix()`、已激活 `refresh()`。
- **e) 页面**：`Roaming/index.tsx` 挂载 `useEffect(() => { void prewarmHotMix() }, [])`。
- **f) i18n**：新增 `roaming_hero_hotmix` / `roaming_hotmix_desc` / `roaming_hotmix_conservative` / `roaming_hotmix_balanced` / `roaming_hotmix_explore` / `roaming_artist_search_failed`，三语各 +6，均 609 key。
- **有意未做**：URL 预检（P2-3）、真机全流程验收（P2-4）。

### 真机验证结果（P2-2）

- **构建装机**：`npm run pack:android` → `BUILD SUCCESSFUL in 2m 34s`；`adb install -r ...arm64-v8a.apk` → Success；`monkey` 启动 → `Running "lxm.HomeScreen`，logcat 无 JS 报错。
- **页面挂载预取**：进入漫游页后启动初期出现 3 次 `wbd.kuwo.cn/api/bd/bang/bang_info`（kw 榜单详情）→ `prewarmHotMix` fire-and-forget 生效；单飞 + `prewarmed` 让同次运行未重复拉榜。
- **静态渲染**：dump 确认 `全部歌曲 / 来自 17 个歌单 · 共 1107 首`、`熟歌热歌`、`70% 常听的老歌 + 30% 榜单新歌`（默认均衡档）、`保守 / 均衡 / 探索` 三档胶囊在场。
- **档位胶囊**：点「探索」→ 副标题实时变为 `50% 常听的老歌 + 50% 榜单新歌`；同一时刻 dump 仍能取到 idle、播放栏曲目与进度未变 → 胶囊只改比例、`stopPropagation` 有效（未误触发卡片起播）。
- **卡片起播**：点热歌卡 → `uiautomator dump` 报 `could not get idle state`（`SpectrumBars` 的 `Animated.loop` 挂载 = 会话激活）；`dumpsys media_session` 显示 `state=PLAYING(3)`、position 前进且曲目换为新歌（`待秋风过山岗 (我陪月亮醉一场) - 刘阳阳`）→ 起播链路通。
- **在线混入**：起播曲目为 kw 源在线歌（`mlyric.kuwo.cn` 歌词请求，kuwo rid），与「榜单池混入」行为一致；**精确混入比例未做定量归因**，属 P2-4 验收项。
- **观测未定性**：某次启动初期「不参与漫游的歌单」过滤弹层自动打开，fresh 启动未复现，留待 P2-4 回归观察。
- 测试期间临时置 0 的设备动画缩放（`animator_duration_scale` / `window_animation_scale` / `transition_animation_scale`）已还原为 1。

### 缺陷修复：冷启动不打开歌单页时无法起播（已修复）

- **现象**：App 冷启动后直接进随心漫游（未进「我的歌单」），点「全部歌曲」或「常听歌手」都弹「歌单里没有可播放的歌曲，无法开始漫游」。
- **根因**：本地歌单的**歌曲**是懒加载的 —— `src/core/init/dataInit.ts` 启动时只 `setUserList(await getUserLists())` 取列表信息，歌曲要等「我的歌单」页 `getListMusics(listId)` 才读进 `allMusicList`。而漫游索引构建与取歌都依赖内存 `allMusicList`：索引命中 storage 缓存（所以 Hero 仍显示「来自 17 个歌单 · 共 1107 首」），但 `getMusicByCoord` 回查不到任何歌 → 抽样器返回空 → `conveyor.start` 返回 false → 起播失败 Toast。旧版还会把这种「空库状态下构建的索引」写进缓存自我固化。
- **修复**（`src/core/roaming/libraryIndex.ts`）：
  1. 新增 `ensureLibraryLoaded()`：构建索引前主动把参与漫游的歌单（`LIST_IDS.DEFAULT` + `LIST_IDS.LOVE` + 全部用户歌单，命中排除名单的跳过）用 `getListMusics(listId)` 读进内存；已加载的歌单直接返回不读库，单个歌单读库失败不影响其它歌单。
  2. `getRoamingIndex()` 的构建路径开头 `await ensureLibraryLoaded()`（首次调用必经，缓存路径绕不过去）。
  3. `INDEX_SCHEMA_VERSION` 1 → 2 作废旧缓存（含被空库固化的缓存），并补「`totalSongs == 0` 的缓存视为无效」兜底。
- **验证**（force-stop 冷启动、全程不进「我的歌单」、APK 重新构建装机）：
  - 索引为**重建**而非命中缓存：旧 v1 缓存已按版本号作废，重建后仍是 `来自 17 个歌单 · 共 1107 首`。
  - 点「全部歌曲」→ `dumpsys media_session` = `PLAYING(3)`、position 前进、曲目换为 `慕夏 - 邓寓君(等什么君)`，随后出现 kw 歌词/封面请求 → 起播成功，无失败 Toast。
  - 点「常听歌手」谭晶 → 曲目换为 `晚秋赋 - 谭晶`、`PLAYING(3)` → 艺人漫游同样恢复。
  - logcat 无 JS 报错；`npx eslint src/core/roaming` 0 问题、`npx tsc --noEmit` 仅既有 5 错。
- 备注：本地曲库真为空时仍应弹该文案，属正常空态（P2-4 回归项）。
### 已定设计（调研结论，动手前不必重查）

**艺人补搜（主计划 §4.3）**

- 直接调 `musicSdk[source].musicSearch.search(name, 1, 30)`，**绕过** `core/search/music.search()`（后者会改写搜索 store）
- source 取 `searchMusicState.source`；若为 `'all'` 则从 `searchMusicState.sources` 取第一个非 `'all'`（`sources` 末尾 push 了 `'all'`）
- 原始结果需 `toNewMusicInfo`（`@/utils`）映射后才是 `LX.Music.MusicInfoOnline`
- 去重：与本地 `fingerprintSet` + LRU 比对；每艺人各拉一页，顺序逐个拉（单源单发，不并发）
- 混入比例：本地:在线 ≈ 6:4，只影响后续续杯；**首次起播仍纯本地**（快出声）
- 失败静默：最多一次 Toast（plain 文案，如「联网找歌没成功，继续播已有的歌」），永不阻塞本地续杯

**熟歌热歌 hotMix（主计划 §3.3/§4.4）**

- 榜单池：`getLeaderboardSetting()`（`@/utils/data`）拿 `{source, boardId}`；`getBoardsList(source)` 拿 `BoardItem[]`，按名称正则 `热歌|飙升|新歌|hot|new` 选榜（否则取 `boards[0]`）
- `getListDetail(id, page)` 拉榜单详情，**id 格式 `${source}__${bangid}`**（如 `kw__16` 热歌榜），拉 page 1+2 取前 50；该函数纯读模块缓存，不污染榜单 store
- 模块级缓存 + `prewarmHotMix()` 页面挂载时后台预取（fire-and-forget）
- 混排：本地池 : 榜单池按档位比例（保守 8:2 / 均衡 7:3 默认 / 探索 5:5），比例是模块状态、refill 时读取，切换只影响后续续杯不重播
- `ruleKey = 'hotmix'`；榜单池空 → 纯本地降级（照样能播）；两池都空才 `start` 失败 → Toast `roaming_start_failed`
- 热歌卡**不做**空态遮罩（本地 <5 但榜单可用时仍可播）；无过滤齿轮

**HeroCards 布局**

- 两张卡**纵向堆叠、通栏**（并排会把副标题/胶囊挤到 ~170px；P1 通栏卡已真机验收，不回退）

### 验证命令

```powershell
npx eslint src/core/roaming src/screens/Home/Views/Roaming --fix   # 后跑 lint 复查
npx tsc --noEmit        # 仅允许既有 5 个无关错误
node -e "JSON.parse(require('fs').readFileSync('src/lang/zh-cn.json','utf8'))"  # ×3 语言
npm run pack:android    # BUILD SUCCESSFUL 即成功（npm warn 可致 exit 1，看 APK 时间戳）
adb install -r android\app\build\outputs\apk\release\lx-music-mobile-v1.9.1-arm64-v8a.apk
adb shell monkey -p cn.luoxue.music.mobile -c android.intent.category.LAUNCHER 1
adb logcat -d -s ReactNativeJS:V   # 设备掉线先 adb reconnect offline
```

---

## P2-3 URL 预检 ⬜（主计划 §4.5）

- [ ] 进度来源：`playerState.progress.nowPlayTime/maxPlayTime`（秒，`playProgress.ts` 每 1s 轮询写入，无每 tick 事件）→ 当前歌剩余 <60s 且下一首为在线歌 → `getMusicUrl({ musicInfo, quality, isRefresh: false, allowToggleSource: false })`（**必须关换源**，否则死链被换源结果掩盖，见「开工前必读」缺口 2）
- [ ] 失败：指纹入会话级跳过集 → 窗口移除该首（非当前歌）→ 蓄水池/抽样器补位 1 首
- [ ] 全程无 Toast、无播放中断；预检并发限 1（只预检紧邻下一首）
- [ ] 验证：死链歌用户无感剔除；URL 缓存命中秒播

---

## P2-4 验收与回归 ⬜（主计划 §5 P2 口径）

- [ ] 三源各实测盲盒全流程（Tag 别名命中、随机翻页、蓄水池续满）
- [ ] 断网/超时：降级链路、全失败回退全库、无卡死
- [ ] 艺人补搜混入且指纹去重生效（本地在线撞车不复读）
- [ ] 熟歌热歌：档位胶囊切换生效（后续续杯比例变化）、起播/换一批正常
- [ ] 预检：死链无感剔除补位；URL 缓存命中秒播
- [ ] 文案走查：三语无裸 key、全 UI 无 emoji、用户可见文案无技术黑话（对照主计划 §3.0）
- [ ] 回归：普通列表四种播放模式、稍后播放、上一首回溯行为不变
- [ ] 最终构建装机 + 文档收尾（本文档状态表、roaming-plan §4/§7、ADR 0003、CONTEXT.md）

---

## 变更记录

| 日期 | 内容 |
| --- | --- |
| — | P2-1 完成并提交 `1966501`，装机验证通过；P2-2 调研完成待动手 |
| — | 代码审查：P2 可继续；结论、已核对 API 与 4 个缺口写入「开工前必读」，P2-2 开工 |
| — | P2-2 代码落地：conveyor 指纹判重、艺人补搜、hotMix 抽样器、门面导出、熟歌热歌 Hero 卡、三语 key；eslint 0 问题、tsc 仅既有 5 错、三语各 609 key 对齐 |
| — | P2-2 真机验证通过：装机 + 榜单预取 + 档位胶囊联动 + 热歌卡起播（新增「真机验证结果」小节） |
| — | 修复「冷启动未打开歌单页 → 漫游无法起播」：索引构建前主动加载本地歌单歌曲（`ensureLibraryLoaded`）+ 索引缓存版本升 2；真机冷启动复测「全部歌曲」「常听歌手」均正常起播 |
| — | P2-2 提交 `83d9cf7`（含冷启动无法起播的修复）；状态表更新为已提交 |
