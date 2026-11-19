# 车机三问（v2）：失效源自动跳歌 / 不可播放清理 / 方向盘下一首失效

状态：**v2 已定稿并落地实施**（核心 JS 修复、持久化失败台账与清理 UI、RNTP 原生补丁与单测均已合入）。

适用形态：直接把 APK 装进安卓车机（非 CarPlay / Android Auto 投屏），播放核心为 `react-native-track-player`（`github:lyswhut/react-native-track-player#bfe3393`）+ ExoPlayer(media3)。

---

## 0. 结论摘要

| # | 问题 | 核查结论 | 代码事实依据 | 已落地处理 |
| --- | --- | --- | --- | --- |
| 1 | 源缺失/失效/错误时自动跳下一首 | **部分存在但有 4 个真实漏洞** | 见 §1 洞 A/B/D/E | 全部修复 + 连续临时失败熔断保护 |
| 2 | 把“多次无法播放”的歌清理出歌单 | **原功能不存在**（ADR 0006 禁播时自动删） | `invalidMusic.ts` 仅内存 Set | 新增 `@play_failure_stats` 持久化台账 + 歌单清理预览弹窗 |
| 3 | 无法播放时方向盘“下一首”失效 | **真实存在，与音源无关** | 见 §3 证据链 E0–E10 | JS 状态同步/防呆 + RNTP 原生补丁（`dependencies-patch.js`） |

---

## 0.1 修正记录（v1 → v2）

| 项目 | 依据 | 裁决 |
| --- | --- | --- |
| 原 J6（用 `pause()+seekTo(0)` 替代 `setStop()`） | `ExoPlayback.java:168` `stop()` 将 `lastKnownWindow` 置 `UNSET`，是 `PlaybackTrackChanged` 中 `info.track == null` 早退（`service.ts:116`）的唯一来源；不 `stop()` 就 `skipToNext()` 会误发 `playerEnded()` 导致**连跳两首**，不 `skipToNext()` 则 `isEmpty()` 为 `false` 导致点播放时**播回上一首老歌** | **驳回**：保留 `setStop()` 队列归位语义，改由原生 `MetadataManager.updatePlaybackState` 拦截 `STATE_NONE` |
| 原 E0（`FLAG_HANDLES_QUEUE_COMMANDS` 覆盖） | `minSdkVersion=21`（`android/build.gradle`），API 21+ 设置 `setCallback()` 即支持媒体键，且正常播放时按键可用 | **降级**：保留 N1 补全 Flags 作低版本兼容防御，不作主因 |
| 原 E3/E4（冷启动丢键 / `stopSelf()`） | `MusicService.java:74` 仅在无前台 Activity 时 `stopSelf()`，无法解释前台界面开着仍失效 | **降级**：归为后台/冷启动受限次因 |
| 原洞 C 与 F1-C（临时故障直接标 `invalid`） | `player.ts:160` 仅 `tooManyRequests` 走 `delayRetry`；地库断网时把临时故障标进 `invalidMusicIds` 会把整张歌单标黑停播 | **驳回**：不将临时故障标黑，改为“连续 5 首临时故障熔断暂停并提示” |
| 问题二“必须跨 1 天”门槛 | 当天导入的失效歌单无法当天清理 | **驳回**：改为“60s 内去重防连加，累计失败 ≥3 次”即可预览清理 |
| 原 J5（`RemoteStop` 全改暂停） | `MetadataManager.java:106` 通知删除也是 `ACTION_STOP` | **修正**：仅在非定时退出时暂停，保持车机切音源后按键不哑 |
| 新增 E9 / E10 | `MetadataManager.updateOptions` 未调 `setPlaybackState`；`playStatus.ts:39` `if (!buttons.play) return` 阻塞后续元数据刷新 | **纳入 P1/P3 修复** |

---

## 1. 问题一：失效源自动跳下一首

### 1.1 已识别并修复的 4 个漏洞
1. **洞 A（起播超时守卫失效）**：`handlePlay()` 先将 `playerState.isPlay` 置 `false`，导致随后的 `playerLoadstart` 被 `playerEvent.ts` 的 `!playerState.isPlay` 守卫直接拦截，8 秒 `LOADING_TIMEOUT` 从未启动。**已移除 `!playerState.isPlay` 守卫，改为判断 `playerState.musicInfo.id && !isEmpty()`。**
2. **洞 B（双 2 秒定时器抢跑）**：`player.ts` 与 `playerEvent.ts` 原各维护一个 2 秒 `delayNextTimeout`，手动切歌时 `await filterList` 间隙旧定时器可能抢跑。**已抽离单一带代际号的 `src/core/player/delayNext.ts`，并在手动 `playNext`/`playPrev` 与 `RemoteNext`/`RemotePrevious` 入口第一时间取消。**
3. **洞 D（播放期 `PlaybackError`/超时未标失效）**：`handleError` 与 `startLoadingTimeout` 二次放弃时未调 `markMusicInvalid`，导致 `singleLoop` 无限重播坏歌、`none` 停死。**已补齐 `markMusicInvalid`、`clearMusicUrlByMusic` 与持久化失败计数。**
4. **洞 E（自定义源返回空 `url` 静默僵死）**：`music/utils.ts` 与 `player.ts` 未校验空字符串 `url`。**已增加 `extractValidMusicUrl` 校验、阻止缓存空 `url`，并在 `getMusicPlayUrl` 区分 `null`（取消）与空串（报错跳转）。**
5. **连续临时故障熔断**：连续 5 首发生网络/限流等临时故障时暂停自动切歌并提示（不污染 `invalidMusicIds`）。

---

## 2. 问题二：清理多次无法播放的歌曲

- **方案（不违背 ADR 0006）**：
  - 新增纯逻辑模块 `src/core/player/playFailureStatsCore.ts` 与持久化封装 `src/core/player/playFailureStats.ts`（storage key `@play_failure_stats`，LRU 上限 500 条，60 秒去重窗口）。
  - **仅真实播放路径且非临时故障**时累加次数（预取链路绝不计数）；歌曲一旦进入 `TPState.Playing` 自动清除该曲失败记录。
  - 在歌单菜单（[ListMenu.tsx](file:///d:/WorkSpace/lx-music-mobile/src/screens/Home/Views/Mylist/MyList/ListMenu.tsx)）增加「清理失效歌曲」入口，打开预览弹窗 [FailureMusicModal.tsx](file:///d:/WorkSpace/lx-music-mobile/src/screens/Home/Views/Mylist/MyList/FailureMusicModal.tsx)（默认排除当前在播曲目、允许逐首取消勾选），确认后调用 `removeListMusics` 批量删除并清理台账。

---

## 3. 问题三：无法播放时方向盘“下一首”失效

### 3.1 证据链与证据等级

| ID | 位置 | 性质 | 代码事实 / 机制 |
| --- | --- | --- | --- |
| E8（主因） | `player.ts` → `ExoPlayback.java:167,246` → `MetadataManager.java:357` | **[事实]** | 切歌/报错调 `setStop()` 把 ExoPlayer 置 `STATE_IDLE`，`MetadataManager.updatePlaybackState` 把 `STATE_NONE(0)` 写入系统会话；**[推断]** 车机据此判定无播放中媒体而屏蔽方向盘下一首 |
| E9（主因） | `MetadataManager.java:120-173` | **[事实]** | `updateOptions()` 只写 `actions` 字段从未调 `session.setPlaybackState()` |
| E1 | `MusicBinder.java:55-60` ← `playList.ts:122` | **[事实]** | `setActive(true)` 仅在 `updateNowPlayingMetadata` 调用；未起播过或 `trackInfo` 为空时直接跳过 |
| E10 | `playStatus.ts:39` | **[事实]** | `if (!buttons.play) return` 导致首次失败后连续失败循环里不再推送元数据 |
| E5 | `player.ts:349,487` | **[事实]** | 全表不可播放时 `handleToggleStop` 清空 `playMusicInfo`，按下一首直接 return |
| E6 | `service.ts:51` | **[事实]** | `RemoteStop` 直接 `exitApp()` 销毁会话 |
| E0/E3/E4 | `MetadataManager.java:80` / `MusicService.java:61,97` | **[事实/受限]** | 低版本 Flags 覆盖及后台/冷启动时服务自杀 |

### 3.2 已落地修复
- **JS 层（P0 + P1）**：
  - `service.ts` 增加 `[media]` 日志、入口立即取消在途重试并 `try/catch` 包裹 `playNext`/`playPrev`、`RemoteStop` 非定时退出时改为 `pause()`。
  - `utils.ts` `setStop()` 增加 `.catch(() => {})` 防 `queue_exhausted` 竞态中断。
  - `playList.ts` `updateMetaData(..., force=true)` 不再因 `trackInfo` 未就绪而跳过；`playStatus.ts` 移除 `if (!buttons.play) return` 阻塞并在 `musicToggled`/`error` 强制同步元数据。
  - `player.ts` `handleToggleStop(false)` 保留 `playMusicInfo` 与列表位置，且手动 `playNext`/`playPrev` 在全表因会话失效标记而为空时允许清空会话标记重试。
- **原生层（P3，固化于 `dependencies-patch.js` + `postinstall`）**：
  - `MetadataManager.java`：补全 Flags（N1）；`updateOptions()` 后同步初始化 `updatePlaybackState`（N6a）；`updatePlaybackState()` 公开并在存在 `prevMetadata` 或非空队列时将 `STATE_NONE` 映射为 `STATE_PAUSED`（N6b）。
  - `MusicManager.java`：`onStateChange` 在 `session.isActive()` 时无条件调用 `metadata.updatePlaybackState(playback)`（N4）。

---

## 4. 验证方式

1. **自动化单测与类型检查**：`npm test`、`npx tsc --noEmit`、ESLint 校验。
2. **车机 / ADB 实机验证**：
   - `adb shell dumpsys media_session | grep -A 25 -i luoxue`（确认未出声/失败窗口下 `active=true`、`state=2(PAUSED)`、`actions` 含 `SKIP_TO_NEXT`）。
   - `adb shell input keyevent 87` / `adb shell cmd media_session dispatch next` + `adb logcat -s ReactNativeJS:* | grep "\[media\]"`。
