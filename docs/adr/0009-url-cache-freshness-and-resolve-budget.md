# ADR 0009: URL 缓存加新鲜期，并把「取址最坏耗时」收进预算

## Status

Accepted

## Context

用户反馈「有些歌要等很久、加载失败后才自动跳下一首」。排查后这条慢路径由四个因素**相乘**，而不是相加：

1. **播放地址缓存没有时效概念**：`saveMusicUrl` 只存一个字符串，读取时只要非空就直接交给播放器，既不校验也不看写入时间。音源直链带防盗链签名，有效期通常只有几十分钟到几小时，而缓存是持久化的——隔一段时间再播，喂给播放器的就是死链。
2. **校验能力两端不对等**：预取侧做了 `isCached || checkUrl` 探活并允许强制刷新（`src/core/init/player/preloadNextMusic.ts:61-68`），播放侧什么都没做（`src/core/music/online.ts:56-57`）。于是「本来能在取址阶段发现」的失效，被拖到播放器里以网络超时的形式暴露。
3. **缓存键与预取结果错配**：缓存键是 `id_音质`。预取走音质阶梯降级成功时（ADR 0008）写入的是**实际拿到的档位**（如 `id_320k`），而播放侧按用户设定算首选档位（如 `flac`）去查，**必然落空**。等于"越需要降级的歌、预取成果越用不上"。
4. **失败预算相乘**：播放器加载超时 25s × 报错强刷 2 次 × 整链重跑 1 次（`src/core/player/player.ts:144`）× 音质阶梯 ≤4 次加换源 ≤6 次 × 单次脚本请求最长 20s ≈ 分钟级。且整链重跑对「换遍所有音源」这种确定性失败也会再跑一遍，纯属浪费。

## Decision

四件事，全部在 JS 层，不改原生：

1. **URL 缓存结构化 + 新鲜期**：缓存值从 `string` 改为 `{ url, quality, time }`，新增 `MUSIC_URL_FRESH_TIME = 10 分钟`。读取只在新鲜期内命中，超期视为未命中并回到取址链路。旧版本纯字符串缓存按"写入时间未知"处理，一律视为过期，下次取到地址时自动改写为新结构，无需单独迁移代码。
2. **缓存读取按音质阶梯回退**：`getMusicUrl(musicInfo, qualitys[])` 按候选顺序批量读取，返回第一个新鲜命中项并带上它自己的 `quality`。首选 flac 没命中时，用上次降级拿到的 320k 起播，而不是重新请求一遍。
3. **取址总预算 + 单请求上限**：`URL_RESOLVE_BUDGET = 12s`（同源阶梯、跨源搜索、跨源重试共享同一份预算）、`URL_REQUEST_TIMEOUT = 8s`（单请求等待上限，超时用 `requestMsg.timeout` 上报）。预算耗尽立即失败，把"无限等待"变成"可预期的失败"。
4. **播放侧超时与重试收敛**：起播超时 25s → 8s；报错后的强刷次数 2 → 1（强刷本身就是重跑整链）；失败后切歌等待 5s → 2s；整链重跑只对"非死路"的失败做（`!isSourceExhaustedError`）——`toggle_source_failed` 是确定性结论，再跑一遍只会把失败路径翻倍。

纯逻辑抽到 `src/core/music/urlCache.ts`（`pickFreshMusicUrl` / `isFreshMusicUrl` / `toMusicUrlCacheItem`），与 `playQuality.ts` 同一思路，便于单独断言。

## Invariants

- **显式传 `quality` 的调用方只读该档缓存、只试该档**：下载任务（`src/core/download/task.ts:161-200`）自己管 128k 兜底与 `isQualityFallback` 上报，阶梯回退不得介入。
- **缓存只用于加速，永不作为「歌曲是否可播放」的判定依据**：未命中或超期必须回到取址链路，绝不能因此 `markMusicInvalid`（参见 ADR 0006）。
- **超时属于临时故障**：`requestMsg.timeout` 在 `isTransientUrlError` 的集合内，因此超时既不会给歌曲打"不可播放"标记，也不会被当作换源穷尽。
- **预算只约束等待时长，不改变候选顺序与换源语义**：`retryedSource` 仍然生效，同源阶梯与跨源候选顺序不变。
- **预算耗尽不再整链重跑**：`getMusicPlayUrl` 只在"非死路且非超时"时重跑一次（`!isSourceExhaustedError && != requestMsg.timeout`）。否则 12s 预算会被外层重跑变成 24s。这依赖一个事实：`withTimeout` 超时后底层请求无法取消（用户脚本请求没有可用的 cancel），重跑多半只是把同一个慢请求再发一遍。
- **搜源超时与取址超时同源**：`getOtherSource` 的超时曾抛裸字符串 `'find music timeout'`，不在 `isTransientUrlError` 集合内，会被当成"非临时故障"进而 `markMusicInvalid` —— 网络慢会被误判成歌不能播。现统一抛 `requestMsg.timeout`。
- **新鲜期内不做任何探测**：命中即起播，切歌零额外请求。

## Consequences

- 降级场景下的预取不再白做：切歌时最多省掉一整轮"音质阶梯 + 跨源换源"。
- 超期缓存不再被直接喂给播放器，慢路径从分钟级压到十几秒级。
- 代价一：超过 10 分钟的缓存会被重新取址，长播歌单的请求数略增（每首歌切下一首时一次，且多数情况预取已写入新地址）。
- 代价二：可能出现「用户选 flac、实际播 320k」——命中的是上次降级写入的档位。ADR 0008 已接受同类降级，这里只是让它更快生效。
- 代价三：8s 起播超时对弱网 + 无损大码率有误判风险；但超时只会导致"刷新一次地址"，不会跳过歌曲，最坏是多花几秒。
- 单首歌的最坏路径从分钟级收敛到「取址 12s + 起播 8s + 刷新取址 12s + 起播 8s + 切歌 2s ≈ 42s」。要再往下压，需要把"每首歌一个 deadline"贯穿 `setMusicUrl` / `handleError`，与起播超时共用同一份预算，留作后续。
- 已知限制：`withTimeout` 只放弃等待、不取消底层请求（`UserApiModule` 的 `canceleFn` 是空实现，`userApiRequestCancel` 被注释掉）。因此一次失败最多留下 4~6 个在途请求，随后各自自然超时，不影响后续状态。
- 未覆盖：真正的音频预下载（`TrackPlayer.add` 预热下一首、靠播放器 HTTP 缓存实现秒开）仍留作后续。
