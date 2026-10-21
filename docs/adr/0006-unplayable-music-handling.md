# ADR 0006: 不可播放歌曲只做运行时标记，不从播放列表移除

## Status

Accepted

## Context

一首歌换遍所有音源仍拿不到播放地址时，当前实现只是"跳过"：`setMusicUrl` 的 catch 显示错误并 `addDelayNextTimeout()`（5 秒后 `playNext(true)`），播放列表完全不动（`src/core/player/player.ts`）。

需求侧希望这类死歌别再反复尝试，最直接的想法是"从播放列表里移除"。这在两种播放形态下后果完全不同：

- **列表播放**：`getList(listId)` 返回的就是用户保存的列表本体（`allMusicMap` 里的数组，与持久化层共用引用）。走 `core/list.removeListMusics` 会经 `list_event.list_music_remove` → `checkUpdateList` → `saveListMusics` **立即写库**，不可撤销。风控限流（`requestMsg.tooManyRequests`）、接口抖动、暂时离线的存储卡，都会被固化成"这首歌没了"。此外删除还会让 `playerPlayIndex` 漂移（当前歌被删时 `getPlayIndex` 走 `playIndex < 0` 分支把下标减一），并与"换源改写列表"（先 remove 再 add 再 `updateListMusicPosition`）争夺下标。
- **随心漫游**：`LIST_IDS.ROAMING` 是履带队列注入的虚拟列表（ADR 0003），本就不持久化、退出即丢，"放不了就扔"在语义上成立。但也不能走 `core/list.removeListMusics`——那会把虚拟窗口写进数据库，且绕开 conveyor 的指纹集同步与续杯，造成重复抽歌与窗口只减不补。

同时，现有"不喜欢"（dislike）已经给出了同一类问题的既有答案：`filterMusicList` 在播放时按名单过滤，从不改动用户列表。

## Decision

### 1. 不可播放 = 运行时标记，不是删除

新增 `src/core/player/invalidMusic.ts`：一个内存 `Set<string>`（歌曲 id），仅本次运行有效，App 重启即清空。

- 打标记时机：`setMusicUrl` 的 catch，且必须是**源已穷尽**（`getOnlineOtherSourceMusicUrl` 抛出的 `toggle_source_failed`）或**非临时故障**。
- 不打标记的错误：网络类（`requestMsg.fail / unachievable / timeout / notConnectNetwork`）、限流（`tooManyRequests`）、请求取消、`source init failed`。这些只说明"这次没拿到"。
- 解除时机：重新取到可用地址时（`setMusicUrl` 成功分支），因此误判会自愈。

用户列表在此机制下**一个元素都不少**，用户随时能手动点播、换源、重新收藏。

### 2. 列表播放：过滤，而不是删除

`filterMusicList`（`src/core/player/utils.ts`）把不可播放与"不喜欢"合并到同一分支处理：不在名单里的歌照常参与；当前播放歌保留在列表内以保证下标计算，随后由既有分支把它从候选里剔除。

`playNext` 追加一条：当前歌已被判定不可播放时，即使播放模式是 `singleLoop / list / none`，也一律按 `listLoop` 顺序推进——否则"单曲循环"会把播放卡在死歌上反复重试。

### 3. 随心漫游：conveyor 内存剔除

`conveyor.dropInvalidMusic()` 在每次 `musicToggled` 时把窗口内已标记、且**不是当前播放歌**的歌曲剔除，随后 `syncWindowFingerprints()` + `updatePlayIndex()` + `backfill(removed)` + `notify()`。

- 不剔除当前播放歌：遵守 ADR 0003 的不变式"当前播放歌永远在窗口内"。死歌先被跳过（漫游的下一首逻辑同时跳过 `hasDislike` 与 `isMusicInvalid`），下一次切歌时它已退到播放位之前，才被清掉。
- 不写库：虚拟列表只在 `allMusicMap` 里，`stop()` 时整体丢弃。
- 补位走既有 `backfill`，窗口容量契约不变。

### 4. 预取链路同步加固

`preloadNextMusic.ts` 原本只预取一首、只缓存 URL，但失败处理有三个洞：`info` 一旦落位就不再重试（本首歌剩余时间窗内彻底放弃）、`getMusicUrl`/`isCached` 抛错时 `isLoading` 不会复位（预取被永久锁死）、URL 缓存无 TTL（地址过期后只能等播放期报错）。现在的约定：

| 情形 | 处理 |
| --- | --- |
| 拿不到可用地址（含拿到但 HEAD 探测失效且刷新失败） | 3 秒后重试，最多 3 次；切歌/切播放模式立即取消 |
| 任一环节抛错 | `finally` 复位 `isLoading`，只有本次预取受影响 |
| 切歌时上一首的请求仍在路上 | `session` 代际号比对，过期结果直接丢弃，不污染新状态 |
| 错误为 `toggle_source_failed`（源穷尽） | 立即打"不可播放"标记，切歌时跳过，省掉播放期的报错与 5 秒等待 |
| 临时故障（断网/限流/取消/接口未初始化） | 只重试，绝不标记 |
| 本地文件 / 已下载 | 不再发 HEAD 探测（对 file 路径无意义），直接算预取成功 |

## Consequences

- 列表数据安全：任何播放失败都不会再改动用户列表；代价是死歌在列表里仍然可见，会话内点它会被跳过（但手动点播时仍会真实重试，成功即解除标记）。
- 误判可自愈、可丢弃：标记是会话级的，重启即清空，不存在"永久拉黑一首本来能播的歌"。
- 漫游窗口会少歌：剔除后立即续杯，若续杯也失败则由既有 `roaming_refill_failed` 提示兜底。
- 未做持久化"坏歌表"：跨会话的失败统计与永久屏蔽仍由既有"不喜欢 / 永久屏蔽（Block）"承担，本 ADR 不引入第二套持久黑名单。
- URL 缓存仍无 TTL：地址过期靠"预取探活 + 播放期强制刷新"兜底，没有引入过期时间字段（改存储格式的收益不抵风险）。
- 已知继承行为：随机模式下当前歌已被计入 `playedList`，会走 dislike 分支里 `currentMusicIndex == -1` 的老路径，导致该次挑选少一个候选。属上游既有行为，本次未改动。
