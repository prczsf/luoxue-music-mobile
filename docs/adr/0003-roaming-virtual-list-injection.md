# ADR 0003: 随心漫游采用虚拟列表注入而非改写播放器

## Status
Accepted

## Context
随心漫游需要"无限播放 + 可回溯最近听过的歌"。播放链路强依赖 `列表ID + 下标`（`playList` / `playNext` / `getNextPlayMusicInfo`），且下一首选择逻辑直接读取用户全局播放模式（`player.togglePlayMethod`）。若为漫游重写播放器，需同时触碰原生音频服务（react-native-track-player）的状态同步，风险高。

完整实施计划见 [docs/roaming-plan.md](../roaming-plan.md)；本文只记录架构决策及其理由。

## Decision

漫游不新增独立播放通道，而是**伪装成一个普通列表注入播放器**。

### 1. 注入点

播放器取列表的唯一入口 `getListMusicSync()`（`src/utils/listManage.ts`）读取内存 Map `allMusicList`。漫游以专用 listId `LIST_IDS.ROAMING`（`lxm_roaming`）将一个固定容量的滑动窗口注入该 Map，播放器零感知地把它当普通列表按顺序播放。

- 注入操作：`setMusicList(LIST_IDS.ROAMING, window)`
- 起播：`playList(LIST_IDS.ROAMING, 0)`
- 清理：`removeMusicList(LIST_IDS.ROAMING)`（退出漫游时）
- 该 id 不加入 `userLists/allList`，因此不会出现在任何列表管理 UI 中（已核实列表管理页均遍历这两个结构而非 Map 的未知 key）。

### 2. 播放器侵入点（两处分支）
`src/core/player/player.ts` 中有两处需要感知漫游列表，均为**当前 `playerListId` 为漫游列表时，下一首下标恒为 `playerIndex + 1`** 的纯增量分支，不读取、不修改用户全局播放模式设置：

1. `playNext()` —— 实际切歌入口（自动连播 `playerEnded → playNext(true)` 与用户手点下一曲都走这里）。放在 playedList 处理之前，跳过 `hasDislike` 歌曲；越界即到尾部，停在当前歌（续杯失败已由履带 toast 提示）。
2. `getNextPlayMusicInfo()` —— 预加载入口（`preloadNextMusic.ts`）。同一顺序逻辑，保证预加载的下一首与实际播放一致。

若不做这两个分支：`playNext` 在用户全局模式为 `random` 时会在窗口内随机跳，履带的"头出尾进"顺序假设被打破，修剪后下标语义全部失效；`getNextPlayMusicInfo` 则会预载一首与实际播放不同的歌。两处都放在 playedList 回溯块之前，普通列表的回溯逻辑不受影响。

### 3. 履带队列契约（Conveyor Contract）

| 参数 | 值 | 理由 |
| --- | --- | --- |
| 窗口容量 | 18 首 | 15~20 区间取中；覆盖一次续杯失败的最坏情况 |
| 续杯水位 | 剩余可播 < 5 首 | 留 2 首以上余量吸收续杯（本地抽样毫秒级 / 在线 P2 秒级）的延迟 |
| 单次续杯量 | 5 首 | 与水位一致，摊薄抽样固定开销 |
| 头部修剪阈值 | 已播（窗口内）> 10 首 | 修剪后保留最近 ~5 首在窗口内；更早的历史由 playedList 承担 |
| 单次修剪量 | 5 首 | 均摊 `updatePlayIndex()` 调用，避免每次切歌都修剪 |
| 下标修正 | 修剪后调用现有 `updatePlayIndex()` | 它按当前歌曲 id 在列表中 `findIndex` 重算并对越界 `Math.min` 钳制，比手工"下标减 N"更稳，免边界 bug |

不变式：**窗口永不含当前播放歌以外的已播歌曲**（修剪只发生在当前歌之前的段）；**当前播放歌永远在窗口内**（修剪、剔除都不得移除下标指向的元素）。

### 4. 回溯

"上一首/回溯最近听过的歌"复用现有 `playerState.playedList` 历史栈（`playPrev` 走该栈，与列表数组解耦）。头部修剪只删窗口内的老歌，不影响 playedList，因此回溯能力零成本获得。代价：回溯到已出窗的歌时，播放器按"歌不在当前列表"处理，属可接受边界。

### 5. 生命周期

- 进入漫游（任意磁贴点击）：若上一次漫游仍在进行，先清理旧窗口再注入新窗口；`playList` 现有逻辑会自然清空 tempPlayList 与 playedList。
- 退出漫游 = （a）显式"结束漫游"按钮（停续杯、停当前歌之后的一切自动行为）或（b）用户切到其他列表播放（现有逻辑天然接管）。两者都最终 `removeMusicList(ROAMING)`。
- 不恢复退出前的播放列表状态：恢复复杂且用户预期不明，退出即停在当前歌。

## Considered Options

- **tempPlayList（稍后播放）模拟履带**：拒绝。稍后播放是用户真实功能（`playNext` 开头优先消费），混入漫游歌曲会污染用户排队，两个队列语义互相干扰。
- **完全重写播放器支持漫游模式**：拒绝。改动面大、涉及原生层状态同步，收益不成比例。

## Consequences

- 普通列表的随机/循环/顺序/稍后播放链路完全不受影响；回归测试面收敛在"漫游列表分支"这一处。
- 播放详情页等显示"当前列表"的界面会看到 `lxm_roaming`；已确认不泄漏进列表管理 UI，但播放页顶部列表名展示需处理（显示漫游来源名而非 id）。
- 若未来播放器取列表逻辑改走数据库（而非内存 Map），注入点需同步调整——本决策与 `getListMusicSync` 的内存 Map 实现强耦合。
- 履带的全部状态（窗口、水位、会话内跳过标记）在内存中，App 重启即丢失；这是刻意的（漫游本就是即兴会话，不做断点续播）。
