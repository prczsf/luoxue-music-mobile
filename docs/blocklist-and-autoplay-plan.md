# 内容屏蔽（扩展「不喜欢」）+ 车载起播：实现计划

> 决策变更：原方案「新建独立黑名单」→ **扩展「不喜欢」系统**（方案 B）。
> 理由：`@dislike_list` 存的就是一个字符串，同步协议传的也是这个字符串 + md5，
> 扩语法**零协议改动**即可跨端生效；独立新建要重写一遍持久化/事件/store/同步，且会在设置页留下两张相似卡片。
>
> 状态：**P1（内核 + 4 处入口）与 P2（Tag 墙、点歌连播默认值、打开歌单起播）均已落地**；
> 静态检查干净、纯函数断言 47 条全绿（见 §8）。

---

## 0. 三条前提纠正

| 需求文档的写法 | 代码真相 | 结论 |
| --- | --- | --- |
| A「新增内容屏蔽设置页」 | 已有「不喜欢」规则系统：持久化 + 跨端同步 + 三处播放过滤 + 多入口 | 扩展它，而不是另起一套（见 §1） |
| B1「点歌放完不往后放，要新增开关」 | 开关早已存在（`list.isClickPlayList`，`config/defaultSetting.ts:64`），只是默认 `false`。关闭时在线歌单点歌走 `handlePlay(musicInfo)` → 只播这一首（`components/OnlineList/List.tsx:160`、`components/OnlineList/listAction.ts:14-20`） | 只需翻默认值，**且无需迁移代码**（§5.1） |
| B3「开机即播」 | 已有 `player.startupAutoPlay`（`core/init/player/playInfo.ts:17`） | 只缺「开机进漫游」，成本最高，放 P3 |

---

## 1. 一套规则，三种条目类型

底层仍是 `@dislike_list` 的一份行文本（同步格式不变），每条规则按写法分流：

| 写法 | 语义 | 匹配方式 | 来源 |
| --- | --- | --- | --- |
| `歌名@歌手` | 单曲 | 歌名全等 && 歌手全等 | 原有「不喜欢」入口 |
| `歌名` | 单曲 | 歌名全等 | 原有 |
| `@歌手`（≥2 字） | 歌手 | 歌手**包含** → 合唱曲 `周杰伦 / 费玉清` 一并命中 | 新增「屏蔽该歌手」 |
| `@歌手`（1 字） | 歌手 | 降级为全等（避免 `@李` 命中半个曲库） | 兼容旧规则 |
| `~关键词`（≥2 字） | 歌名关键词 | 歌名**包含** → `live` 命中 `告白气球 (Live)` | 新增 |
| `~关键词`（1 字） | 单曲 | 降级为歌名全等 | 防误伤 |

**`@` / `~` 只存在于存储文本里，界面永远不暴露**（见 §5.4）。
历史约定保持不变：名字里真的含 `@` 时写成 `#`（`SPLIT_CHAR.DISLIKE_NAME_ALIAS`）。
已知历史行为：一行里出现 2 个以上 `@` 时只取前两段（旧解析器如此，未改动，避免破坏桌面端已有数据）。

---

## 2. 数据模型与匹配

```ts
// src/types/dislike_list.d.ts
interface DislikeInfo {
  names: Set<string>          // 歌名@歌手 全等
  musicNames: Set<string>     // 歌名 全等
  singerNames: Set<string>    // 歌手 全等（1 字降级规则在此）
  singerKeywords: string[]    // 歌手 包含（新增）
  nameKeywords: string[]      // 歌名 包含（新增）
  rules: string
}
```

匹配收敛到**一处**（此前两份重复实现，是漂移隐患）：

- `src/utils/dislikeMatch.ts`（新增，纯函数）：`normalizeDislikeText` / `hasDislikeFor` / `MIN_KEYWORD_LEN = 2` / `DISLIKE_KEYWORD_PREFIX = '~'`
- 调用方：`store/dislikeList/action.ts` 的 `hasDislike`（列表/漫游菜单用）、`core/player/utils.ts` 的 `filterMusicList`（**唯一播放过滤点**）

---

## 3. 已完成（P1 内核）

| 文件 | 改动 |
| --- | --- |
| `src/utils/dislikeMatch.ts` | **新增**：归一化 + 匹配（全等三类 + 包含两类） |
| `src/types/dislike_list.d.ts` | `DislikeInfo` 增加 `singerKeywords` / `nameKeywords` |
| `src/utils/dislikeManage.ts` | 解析 `@歌手`（≥2 字转包含）、`~关键词`；过短自动降级；`for` 循环改为 trim 行 |
| `src/store/dislikeList/{state,action,hook}.ts` | 初始化/同步新字段；`hasDislike` 改调共享匹配；规则数统计含新类型 |
| `src/core/dislikeList.ts` | 新增 `addDislikeSinger(singers)`（走 `dislike_music_add`，**复用持久化与同步**） |
| `src/core/player/utils.ts` | 删掉重复的本地 `hasDislike`，改用 `hasDislikeFor`；`filterList` 传整份 `state.dislikeInfo` |
| `src/core/player/player.ts` | `playNext`/`playPrev` 空结果、漫游队尾：区分「全部命中屏蔽」与「没有可播放歌曲」给 toast（原来是静默停止） |
| `src/core/roaming/conveyor.ts` | `dropInvalidMusic` → `dropExcludedMusic`：剔除条件扩为「源失效 ∨ 命中屏蔽」，仍跳过 `playIndex`（ADR 0003 不变式） |
| `src/lang/{zh-cn,zh-tw,en-us}.json` | `player_all_music_disliked_tip` / `player_no_playable_music_tip` |

**验收（已执行）**
- `npx eslint` 9 个改动文件：0 问题
- `npx tsc --noEmit`：只剩 5 个既有错误（`timeoutExit.ts:35`、`plugins/player/hook.ts:126`、`SourceSelector.tsx:35`、`store/player/action.ts:92,93`）
- 规则引擎断言 **26/26 通过**（编译产物 + 桩，脚本在 `$PI_SCRATCH_DIR/t/check.js`）：合唱曲包含匹配、1 字规则不误伤、`~live` 大小写不敏感、精确对不跨歌手、含 `@` 名字可匹配、二次解析幂等

---

## 4. 已完成 P1-5：4 处「屏蔽该歌手」入口

共用逻辑收在 `src/core/blockSinger.ts`：

- `blockSingers(singers)`：去重 → `addDislikeSinger`（走 `dislike_music_add`，复用持久化与同步）→ toast → 当前播放歌若被命中则 `playNext(true)`
- `handleBlockSinger(musicInfo)`：确认弹窗 → `blockSingers(splitSingers(singer))`
- 合唱曲用新增 `src/utils/singer.ts` 的 `splitSingers` 拆开逐个屏蔽（用户点的是「这个歌手」，不是「这个组合」）；`SINGER_SPLIT_RXP` 同时从 `core/roaming/libraryIndex.ts` 提出来复用，避免两处拆分规则漂移

| 位置 | 落点 |
| --- | --- |
| 我的列表菜单 | `screens/Home/Views/Mylist/MusicList/ListMenu.tsx`（`dislike` 项后加 `blockSinger`）+ `screens/MylistDetail/MusicList.tsx` 传 `onBlockSinger` |
| 在线列表菜单 | `components/OnlineList/ListMenu.tsx` + `components/OnlineList/index.tsx` |
| 播放页 | 新增 `PlayDetail/Vertical/Player/components/MoreBtn/BlockSingerBtn.tsx` 与 `PlayDetail/Horizontal/MoreBtn/BlockSingerBtn.tsx`（图标 `minus-box`），插进两处 `MoreBtn/index.tsx`（原来播放页**完全没有**屏蔽入口） |
| 漫游队列 | `screens/Home/Views/Roaming/QueuePanel.tsx` 的 `handleBlock` 改三选一（取消 / 屏蔽本曲 / 屏蔽该歌手），为此在 `utils/tools.ts` 新增通用 `chooseDialog` |

菜单项在歌手为空时 `disabled`。i18n：`block_singer` / `block_singer_confirm` / `block_singer_success`（×3 语言）。

---

## 5. 已完成 P2

### 5.1 B1：点歌连播（翻默认值）

`src/config/defaultSetting.ts:64` → `'list.isClickPlayList': true`（已改）。

**不需要 `migrateSetting.ts`**：`initSetting` 以「存储值优先、缺失键才用默认值」合并（`config/setting.ts:66-77`）并在启动时回写完整配置（`:108`），
因此启动过一次的用户存储里已有 `false`，翻默认值对他们不生效——正好等于「老用户保留现值」，只有新装用户拿到 `true`。

副作用：开启后在线歌单点歌走 `onPlayList(index)` → `setTempList(整单)` + `getListDetailAll`（多页请求），比旧行为重，与「播放全部」一致。

### 5.2 B2：打开歌单立即起播

设置项 `list.playAllOnOpen: 'off' | 'list' | 'random'`，默认 `'off'`。
落点：`config/defaultSetting.ts`、`types/app_setting.d.ts:322` 后、`Setting/settings/List/PlayAllOnOpen.tsx`（仿 `AddMusicLocationType.tsx`）、`Setting/settings/List/index.tsx`、i18n ×3。

钩子 `src/utils/autoplayOnOpen.ts`：
```ts
getAutoplayStartIndex(key, total): number | null   // null = 这次不自动播；会话级 Set 保证同一目标只播一次
```
- 在线歌单：`SonglistDetail/MusicList.tsx` 的 `loadList` 接口改为 `Promise<void>`；`SonglistDetail/index.tsx` 在 `.then()` 里先校验 `songlistState.listDetailInfo` 仍是本页目标，再按策略 `handlePlay(info.id, info.source, list, startIndex)`
- 我的列表：`MylistDetail/index.tsx` 的 `getListMusics(listId)` 改 `.then()`，非空按策略 `playList(listId, startIndex)`
- 随机只决定起点，**不写** `player.togglePlayMethod`，不污染用户设置
- 全程只读列表、只改播放器状态，不写库（ADR 0006）

### 5.3 Tag 墙编辑器（已重做 `Setting/settings/Other/DislikeList.tsx`）

```
「不喜欢的歌曲」规则
规则数量：5
屏蔽的单曲        晴天 · 周杰伦 ×   演员 ×
屏蔽的歌手        [歌手名，如 周杰伦] [添加]      周杰伦 ×  费玉清 ×
屏蔽的歌名关键词  [歌名里的关键词，如 live] [添加]  live ×
[手动编辑规则]
```
- 三组共用新增 `DislikeTagWall.tsx`（可选输入框 + Tag + 点 × 删除），改动即时持久化
- **单曲组没有输入框**：单曲规则只从歌曲菜单的「不喜欢」/「屏蔽该歌手」产生，空态文案直接教用户去哪点，不需要记语法
- `@` / `~` 全由 `buildSingerRule` / `buildNameKeywordRule` 拼，界面不出现
- 增删是纯函数 `appendDislikeRule` / `removeDislikeRule`（`utils/dislikeManage.ts`）
- 规则数用 `useRuleNum()`，Tag 数据来自新增 `useDislikeInfo()`（订阅 `dislike_changed`）
- 高级文本域保留，按钮改名「手动编辑规则」

### 5.4 设置页可发现性（硬约束，实现遵守）

**原则：能不让用户记东西，就绝不让他记。**

1. 主路径零语法：歌手/关键词各有独立输入框，**输入框本身表达类型**，页面正文不出现 `@`、`~`
2. placeholder 当示例：`歌手名，如 周杰伦`、`歌名里的关键词，如 live`
3. 单曲组空态一句话：「在歌曲菜单里点「不喜欢」，歌曲就会出现在这里」
4. 出错当场 toast：`还没输入内容`、`已经在里面了`、`少于 2 个字只能精确匹配`
5. 语法说明只留在高级编辑弹窗里（`setting_dislike_list_tips`），不进设置页正文

**验收**：把手机交给没看过本计划的人，完成「屏蔽周杰伦」「屏蔽所有 Live 版」，全程不许口头提示。

---

## 6. 明确不做 / 延后（P3）

| 项 | 理由 |
| --- | --- |
| 列表里「已屏蔽」置灰标记 | 纯视觉；要做就只读匹配结果加标记，**不删行、不改数据** |
| 桌面端语法对齐 | 旧桌面端把 `@周杰伦` 按全等处理（独唱仍生效）、把 `~live` 当歌名规则（无害无效）。需要桌面端同步升级 |
| 漫游开机自启 | `conveyor.start(ruleKey, sourceLabel, sampler)` 的 sampler 是运行时对象，需持久化规则描述并与 `player.startupAutoPlay` 仲裁 |
| 自动删改用户歌单 | ADR 0006：列表即用户数据，`removeListMusics` 立即写库且不可撤销 |
| 手动点播命中屏蔽时强制跳下一首（需求文档「第二道防线」） | **刻意偏离**：用户显式点下的歌照常播放，只有自动流转才过滤。静默跳走会被当成 bug，车机上更无法解释；见 [ADR 0007](adr/0007-dislike-rule-as-blocklist.md) §5 |

---

## 7. 风险

| 风险 | 缓解 |
| --- | --- |
| 包含匹配误伤 | 只对 ≥2 字的歌手/关键词启用包含；Tag 墙显示原文，随时可删 |
| 单曲精确与歌手模糊混在一份列表 | UI 分三组呈现；`useRuleNum` 分别计数 |
| `isClickPlayList` 默认翻转 | 老用户存储值优先，不受影响 |
| 打开歌单自动起播打扰 | 默认 `off`，会话内每列表只触发一次 |
| 与「不可播放标记」叠加双层跳过 | 语义不同（用户显式 vs 自动判定），提示文案区分 |
| 每次切歌全表匹配 | 规则编译成 Set/数组后 `includes`，微秒级；规则数通常 < 50 |

---

## 8. 验证方式

仓库无测试框架（`test.js` 是临时 RSA 脚本），以静态检查 + 纯函数断言 + 手测为准。

```bash
npx eslint <改动文件>
npx tsc --noEmit     # 基线：仅 5 个既有错误
纯函数断言：把 utils 纯函数编译成 CJS + 打桩跑 node，当前 47 条全绿
```

手测清单（真机 + 车机）：
1. 「屏蔽该歌手」→ 该歌手所有歌（含合唱曲、含以后加入歌单的）都不再播放；列表数量不变
2. 关键词 `live` → `(Live)` 版本被跳过，录音室版正常
3. 整单全部命中 → 一次 toast + 停止，无连续切歌闪烁、无请求风暴
4. 漫游中屏蔽当前歌手 → 队列剔除其余命中歌，当前歌不被打断
5. 屏蔽后重启 App / 进入设置页 → 规则仍在、计数正确
6. （桌面端联调）同步后 `@歌手` 在手机端仍是包含匹配
