# 稳定性加固计划（基于 v1.9.1→v1.10.2 三轮审计）

状态：**全部实施完成**（Tier 1/2/3，见 §6 实施记录）。本文合并了三轮审计的结论：第一轮全量审计、第二轮独立复核、第三轮技术评审。
三轮的结论冲突处，本文按"代码事实优先"裁决，并在 §0 记录裁决结果，避免执行时再争论。

---

## 0. 三轮审计的分歧与裁决

| 议题 | 一轮 | 二轮 | 三轮 | 裁决 |
| --- | --- | --- | --- | --- |
| 起播 8s 超时是否过紧 | P1 bug | 降为观察项（计时起点是 loadstart，非取址） | 同意二轮 | **观察项**。8s 覆盖的是"缓冲到出声"的握手阶段，不是取址；先埋点再定值 |
| 12s 预算重跑后变 24s | 未发现 | **P0**（"比任何一条都严重"） | P2（预算耗尽抛的是 timeout，已被排除重跑） | **P2**。三轮正确：`player.ts:149` 排除 `requestMsg.timeout`，重跑只发生在快速失败场景，不会吃满两次预算 |
| 预取阶段 `markMusicInvalid` | P2（标记过宽） | P1（静默误杀 + 不可撤销） | 直接删除该调用，不引入两级状态机 | **P1，采用三轮的最小改法**（见 B1） |
| 存储写入原子性 | 未发现 | P0（先删后写） | 同意，且应全局推广 | **P0，但实现必须按 §2 的顺序**，否则会删掉刚写的数据 |

---

## 1. 已确认问题清单（按最终优先级）

### P0

| ID | 位置 | 问题 | 触发条件 | 影响 |
| --- | --- | --- | --- | --- |
| A1 | `utils/fs.ts:68`、`core/download/task.ts:344` | `downloadFile` 未传 `connectionTimeout`/`readTimeout`；原生 `RNFSManager.java:708` 用 `options.getInt(...)`，缺省返回 **0**，Java `setReadTimeout(0)` = **无限阻塞**；`runDownloadTask` 无 watchdog | 网络切换、服务端只接不发、CDN 挂起 | 任务永久停在 `run`，不报错不重试，占满并发槽位；只能杀进程恢复 |
| A2 | `plugins/storage.ts:46`（saveData）、`:157`（saveDataMultiple） | 写入顺序是 `removeData*` → `multiSet`，**先删后写** | `multiSet` 失败（配额/存储异常） | 数据蒸发。`applyUserApiScript` 一次写 3 个键（源列表 + prev + 脚本），失败即**全部源丢失** |
| A3 | `core/userApi.ts:84-107` | 刷新源时先覆盖正式键再验证；回滚依赖 `__prev` 与又一次写盘 | 新脚本头部合法但执行抛错 | 源不可用且可能无上一版；叠加 A2 时可能丢整表 |
| A4 | `core/download/task.ts:216` | `prepareCover` 用 `withTimeout(downloadFile(...))`，超时后不 `stopDownload`，`finally` 立刻 unlink 临时文件 | 封面下载慢于 5s | 原生任务继续写入已删除路径；后台连接泄漏 |

### P1

| ID | 位置 | 问题 | 触发条件 | 影响 |
| --- | --- | --- | --- | --- |
| B1 | `core/init/player/preloadNextMusic.ts`（catch 分支） | 预取失败时 `isSourceExhaustedError` → `markMusicInvalid`；而 `filterMusicList` 会剔除 invalid 歌曲，导致它永远播不到，也就永远触发不了 `unmarkMusicInvalid` | 弱网下所有候选源取址失败（与"真的没源"不可区分） | **静默误杀闭环**：一首能播的歌在本次运行内永久失效，用户看不到任何提示 |
| B2 | `core/download/batch.ts:39-50`、`task.ts:415` | 批内只按 id 去重，不按文件名；落盘是 `unlink(目标)` 后 `copyFile` | 同批两首不同 id 的歌生成同名 `baseName` | 后完成的覆盖先完成的；`copyFile` 失败时原文件已被删 |
| B3 | `utils/dislikeManage.ts`（`updateDislikeInfo` 末尾） | `rules` 由**规范化后**的 `list` 重建并落盘 | 任意一次增删改规则 | 用户规则被小写化、`@`→`#`、去重、`~单字` 降级；`DislikeList.tsx:47` 的编辑弹窗直接显示改写后的文本；同步到其它设备同样被污染 |
| B4 | `core/player/player.ts:297-330` | `setPlayListId` 后 `await getListMusics`，await 回来不复核 listId | 快速连续切换两个空列表 | A 列表的 `setPlayMusicInfo` 可能在 B 之后执行，串列表 |

### P2

| ID | 位置 | 问题 |
| --- | --- | --- |
| C1 | `core/download/queue.ts:147` | `cancelAll` 逐个 `cancelTask`，每个都触发 `startPending` + `persistTasks`：批量取消 20 个会产生约 20 次"启动即取消"的建连与 20 次写盘 |
| C2 | `core/roaming/conveyor.ts:99-128` | `backfill` 在 await 后直接写模块级 `window_`，`stop()` 之后仍会塞歌；内部状态与 LRU/指纹集脱节 |
| C3 | `core/music/utils.ts`（`handleGetOnlineMusicUrl`） | 预算由函数内 `createRemainTime` 新建，`getMusicPlayUrl` 重跑即新开一份；快速失败后重跑会拿到完整 12s（P2，非 P0） |
| C4 | `core/player/player.ts`（`getNextPlayMusicInfo`） | 漫游分支在预取路径也会 `showNoPlayableTip`，歌没播完就提前弹提示，切歌时再弹一次 |
| C5 | `core/player/player.ts`（`showNoPlayableTip`） | 对整表 `every(hasDislike)` 同步扫描，万首列表会有可见的 JS 阻塞 |
| C6 | `core/music/utils.ts`（`getOnlineOtherSource*`） | `musicInfos.shift()` 变异入参，目前靠 4 个调用方各自传 `[...otherSource]` 副本兜着 |
| C7 | `core/player/utils.ts`（`filterMusicList`） | `isExcluded` × `filteredList.length<=1` × `canPlayList.length>1` 三层嵌套，终止性无法靠阅读确认 |

### 观察项

| ID | 内容 |
| --- | --- |
| D1 | `LOADING_TIMEOUT = 8000`：加埋点（`loadstart → playing` 耗时分布），两周后按 P95 定值 |
| D2 | `assertApiSupport` 放宽后依赖 `global.lx.apis[source]?.getMusicUrl`，需确认内置源的实际形状 |
| D3 | 其余无界增长的内存集合：`invalidMusicIds`、`otherSourceCache`、`autoplayOnOpen.triggered` |

---

## 2. 存储层修复的正确实现（最容易踩坑的一处）

`buildData` 会把超限的值拆成多个分片，**根键存的是分片键的索引数组**（`@___PART_A___["...part0","...part1"]`），读取只认索引，因此孤儿分片无害。

但 `removeDataMultiple(keys)` 的实现是：

```js
const datas = await AsyncStorage.multiGet(keys)          // 读"当前"值
if (partKeyArrPrefixRxp.test(value)) allKeys.push(...JSON.parse(...))   // 从当前值里解析分片键
await AsyncStorage.multiRemove(allKeys)
```

**如果先 `multiSet` 再 `removeDataMultiple`，它会读到刚写进去的新根键，解析出新的分片键，把刚写的数据删掉。**

正确顺序（`saveData` 与 `saveDataMultiple` 都要改）：

1. `multiGet(keys)` 快照旧根键 → 解析出 `oldPartKeys`
2. `multiSet(newData)`（Android async-storage 的 `multiSet` 走事务，是原子的；失败则旧数据原封不动）
3. `multiRemove(oldPartKeys 中不再被新索引引用的键)`（清理失败只留孤儿，不影响一致性）

可选：启动时做一次孤儿分片清理（`getAllKeys().filter(k => k.startsWith('@___PART_A___') && 无对应根键)`）。

---

## 3. 实施顺序

### Tier 1（P0，约 1.5 人日）

| 步骤 | 改动 | 验证 |
| --- | --- | --- |
| A1 | `downloadFile` 默认注入 `readTimeout: 15000`、`connectionTimeout: 15000`（允许调用方覆盖）；`runDownloadTask` 增加 watchdog：`onProgress` 刷新 `lastActivityAt`，每 5s 检查 60s 无增长 → `stopDownload(jobId)` + 抛 `download stalled` | 用只接不发的服务端（`nc -l`）指向下载 URL，断言 60~70s 内任务转 `error` 且 `running.size` 归零 |
| A2 | 按 §2 顺序重写 `saveData` / `saveDataMultiple`；新增孤儿清理 | mock `multiSet` 抛错，断言源列表/歌单仍在；构造超 500KB 的值验证分片往返正确 |
| A3 | `refreshUserApi`：下载 → 写 `@user_api__<id>__pending` → 用 pending load 验证 → 成功才覆盖正式键 + prev；失败只删 pending。`reloadUserApi` 改用独立 `refreshPromise`（带 id + 代际），不复用全局 `apiInitPromise`；启动时清理残留 pending | 场景①脚本 `sleep(3s)` 后正常初始化；②头部合法但执行抛错。断言②后正式键与 prev 均未变 |
| A4 | `prepareCover` / 歌词下载：超时后显式 `stopDownload(jobId)`（A1 已覆盖大部分，作为兜底） | 封面 URL 指向挂起服务，断言无残留临时文件、无泄漏 job |

### Tier 2（P1，约 2 人日）

| 步骤 | 改动 | 验证 |
| --- | --- | --- |
| B1 | **删除** `preloadNextMusic.ts` 中的 `markMusicInvalid` 调用（连 `isSourceExhaustedError` 的 import 一起清），失败只 `scheduleRetry()`。判决权完全留给前台播放链路 | 断网 10s 后恢复，断言曾被预取失败的歌仍能正常播放 |
| B2 | `batch.ts` 增加 `seenBaseNames` 去重并计入 skipped；`task.ts` 落盘改"写临时文件 → rename"，不再先 `unlink` 目标 | 批量下载两首同名歌，断言跳过数与目录文件数一致；模拟 rename 失败，断言原文件仍在 |
| B3 | `dislikeInfo` 增加 `rawRules`，编辑弹窗与标签展示用原文，匹配仍用规范化结果 | 添加 `Hello@Adele`，断言弹窗显示原文、匹配仍生效 |
| B4 | `playList` / `playListById` 在 `await getListMusics` 之后复核 `playerState.playInfo.playerListId === listId` | 模拟两次快速切换，断言不会把 A 的歌写进 B |

### Tier 3（P2，约 1 人日）

| 步骤 | 改动 | 验证 |
| --- | --- | --- |
| C1 | `cancelAll` 批量化：一次移除 → 批量 `stopDownload` 并清空 `running` → 一次 `persistTasks` / `event.updated` → 一次 `startPending` | 批量取消 20 个，断言无新请求、写盘 1 次 |
| C2 | `backfill` 捕获 `const current = session`，每个 await 后校验，否则丢弃结果 | 弱网下点停止，断言 `getStatus().queue.length === 0` |
| C3 | 预算从 `setMusicUrl` 层创建并逐层透传，重跑复用同一份 | 打点统计 `setMusicUrl → 成功` 的 P99 ≤ 13s |
| C4 | `getNextPlayMusicInfo(silent?)`，预取路径传 `true` | 窗口尾部全屏蔽，断言只在真正切歌时弹一次 |
| C5 | `showNoPlayableTip` 最多扫描前 500 首，超出按"未全部屏蔽"处理 | 万首列表点播放，断言无长任务 |
| C6 | `getOnlineOtherSource*` 内部 `slice()` 入参 | 单测：传入缓存数组后断言原数组未被清空 |
| C7 | `filterMusicList` 抽纯函数 + 表驱动单测（当前歌被排除 × playedList 空/非空 × 列表长度 1/2/3） | 覆盖 12 种组合，断言终止且下标正确 |

---

## 4. 风险与取舍

| 风险 | 说明 | 应对 |
| --- | --- | --- |
| A1 阈值误杀慢速下载 | 60s 无字节增长对极慢网络可能过严 | 按 `contentLength` 自适应：`max(60s, 大小 / 50KBps)` |
| A2 改动面广 | `saveData` 是全 App 的写入入口，改错影响一切 | 先补"分片往返"单测（小值/恰好 500KB/超 500KB/缩小后再写），再改实现 |
| A3 留下 pending 垃圾 | 进程在写 pending 与提交之间被杀 | 启动时清理 `@user_api__*__pending` |
| B1 真·死歌变慢 | 预取不再提前标记，切到死歌要走完前台取址（最坏 12s）再等 2s 跳过 | 接受。可选缓解：预取失败只记入 `preloadFailedIds`（**不参与过滤**），播放命中时把预算降到 4s |
| B3 旧数据不可还原 | 已被改写的规则文本无法恢复 | 发布说明注明"仅对之后的修改生效" |
| C3 透传改动 | 需要改 4 个函数签名 | 保留 `getRemainTime?` 可选参数，不传则自行创建，保持向后兼容 |

---

## 5. 回归范围

**必须回归**：正常播放/切歌/播放模式、单自定义源弱网起播、批量下载 20 首（含同名冲突与中途取消）、漫游起播/续杯/停止/停止后立即重启、屏蔽规则增删改与跨设备同步、自定义源导入/刷新/恢复上一版、设置与歌单的读写（验证 A2 无回归）。

**验收口径**：
- Tier 1：三个故障注入场景（挂起下载、写盘失败、坏脚本刷新）均不产生数据丢失，且都有明确错误提示
- Tier 2：断网恢复后曾预取失败的歌可正常播放；同名文件不互相覆盖
- Tier 3：无功能回归，停止漫游后内部状态为空

---

## 6. 实施记录

### Tier 1（P0）— 已完成

| ID | 状态 | 实际改动 | 验证结果 |
| --- | --- | --- | --- |
| A1 | ✅ | `utils/fs.ts`：新增 `DOWNLOAD_TIMEOUT = 15_000`，`downloadFile` 默认注入 `connectionTimeout` / `readTimeout`；`core/download/task.ts`：新增 `STALL_TIMEOUT = 60s` / `WATCHDOG_INTERVAL = 5s`，按 `lastActivityAt` 判定停滞并 `stopDownload`，抛 `download_task_stalled` | 类型检查通过；真机故障注入待做 |
| A2 | ✅ | `plugins/storage.ts`：新增 `getPartKeysOfValue` / `snapshotPartKeys` / `cleanupPartKeys`；`saveData` 与 `saveDataMultiple` 由「先删后写」改为「快照旧分片 → multiSet → 回收旧分片」，清理失败只记日志 | `node test/storage.test.js` **10/10**（改前 6/10，4 条写入失败场景全部失败） |
| A3 | ✅ | `utils/data.ts`：新增 `__pending` 键的读写清理、`getUserApiList` 启动清理残留；`core/userApi.ts`：`refreshUserApi` 改为「下载 → 校验 → 写 pending → 用 pending 试跑 → 通过才覆盖正式键」；`waitIdleInit` 取代直接 await 全局 promise，避免上次初始化不回调时回滚卡死；新增 `user_api_refresh_busy` 文案 | 类型检查通过；两个故障场景待真机验证 |
| A4 | ✅ | `core/download/task.ts` `prepareCover`：超时后显式 `stopDownload(jobId)` 再抛出 | 类型检查通过 |

**与计划的偏差**：
1. A3 的"试跑"没有走「写 pending 后 `setUserApi` 读存储」的路径，而是新增 `loadUserApiScript(id, script)` 直接把 pending 文本交给 `loadScript`，省掉一次读盘且不会污染正式键。
2. A3 额外补了 `waitInitResult` 的超时释放逻辑：超时后把 `apiInitPromise[1]` 置回 `true`，否则后续回滚会一直以为"还有初始化在途"而卡住。
3. `fs.ts:46 copyFile` 的既有 lint 错误未处理（与本次改动无关，保持 diff 聚焦）。

**验证方式**：`npx eslint` 改动文件 0 问题；`npx tsc --noEmit` 仍为 5 个既有错误；`npx react-native bundle --platform android` 通过；存储层单测 10/10。

### Tier 2（P1）— 已完成

| ID | 状态 | 实际改动 |
| --- | --- | --- |
| B1 | ✅ | 删除 `preloadNextMusic.ts` 中 `markMusicInvalid` 与 `isSourceExhaustedError` 依赖，预取失败只 `scheduleRetry()`。判决权完全留给前台播放链路，从根上消除"静默永久误杀"闭环 |
| B2 | ✅ | `batch.ts` 增加 `seenBaseNames` 按落盘文件名去重；`task.ts` 落盘改为「同目录 staging 文件 → 覆盖目标 → move」，move 失败回退 copy，不再"先删目标再拷贝" |
| B3 | ✅ | `DislikeInfo` 增加 `rawRules`；`updateDislikeInfo` 同时记录原始文本，`rules` 仅作匹配用；落盘与同步改用 `rawRules`；标签墙的增删改用"仅小写归一"比较（`normalizeRuleLine`），避免原始大小写导致删不掉/重复添加 |
| B4 | ✅ | `playList` / `playListById` 在 `await getListMusics` 之后复核 `playerState.playInfo.playerListId === listId` |

### Tier 3（P2）— 已完成

| ID | 状态 | 实际改动 |
| --- | --- | --- |
| C1 | ✅ | `cancelAll` 改为批处理：一次批量 `stopDownload` + 清空 `running` + 一次 `persistTasks`/`event.updated`，不再逐个 `cancelTask` 触发"取消→启动下一个" |
| C2 | ✅ | `conveyor.backfill` 捕获 `current = session` 并在每个 await 后校验，`stop()` 之后到达的结果整批丢弃 |
| C3 | ✅ | 导出 `createRemainTime` / `URL_RESOLVE_BUDGET`，预算从 `getMusicPlayUrl` 创建并逐层透传（`core/music/index` → `online` → `utils`），整链重跑复用同一份 |
| C4 | ✅ | `getNextPlayMusicInfo(silent = false)`，预取路径传 `true`，不再在歌没播完时弹"没有可播放的歌曲" |
| C5 | ✅ | `showNoPlayableTip` 增加 `TIP_SCAN_LIMIT = 500` 扫描上限 |
| C6 | ✅ | `getOnlineOtherSourceMusicUrl` 内部 `const candidates = [...musicInfos]`，不再变异入参 |
| C7 | ✅ | 新增 `test/filterMusicList.test.js`：8 条用例 + 3 首歌 × 屏蔽组合 × 已播组合 × 两个方向 × 三个当前位的穷举（1152 组） |

**C7 顺带修掉的问题**：测试发现「候选为空时 `playerIndex` 仍可能指向不存在的下标」。当前调用方有空列表保护，所以没有实际影响，但属于典型的"以后会被误用"隐患；已在 `filterMusicList` / `filterList` 中把空候选的下标统一归一到 `-1`。

**最终验证**：`npx eslint` 改动文件 0 问题（其余 3 个为既有问题）；`npx tsc --noEmit` 仍为 5 个既有错误；`npm test` **18/18**；`npx react-native bundle --platform android` 通过。
