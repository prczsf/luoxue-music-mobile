# ADR 0008: 单音源下靠「音质阶梯 + 换源候选放宽」提升可播率

## Status

Accepted

## Context

用户反馈自定义源「只有部分歌曲能播放」。排查后发现不是设置项缺失，而是整条音源体系是单槽位架构：

- 设置：`common.apiSource` 是单个字符串（`src/core/apiSource.ts:37-41`）
- 运行时：`global.lx.apis` / `global.lx.qualityList` 各是一个对象，只有 `id === common.apiSource` 的脚本才会写入（`src/core/init/userApi/index.ts:177-178`）
- 原生：`UserApiModule` 只有一个 `javaScriptThread` 字段，`loadScript()` 会先 `destroy()` 旧实例（`android/.../UserApiModule.java:56-59`）

并且本仓库把内置音源掏空了：`src/utils/musicSdk/api-source-info.ts` 是空数组，`apiList` 全被注释，各源的 `getMusicUrl` 只做转发（`kw/index.js:62-64` → `apis('kw')`）。**搜索、歌单、榜单、歌词、封面仍是内置 HTTP 实现，只有「取播放地址」100% 依赖当前那一个脚本。**

于是能播的只剩「脚本实现了该平台 + 该音质恰好存在 + 或此前缓存过 URL」的歌曲。而在取地址这一环，旧代码有两处把「未知」当成「不支持」：

1. `getPlayQuality`：`qualityList[source]` 缺失时一律退 `128k`，即使歌曲有 320k；
2. 换源候选（`getOnlineOtherSourceMusicUrl`）先过 `assertApiSupport`（只看 `qualityList`），再过 `!_qualitys[itemQuality] -> continue`，两条闸把能播的候选整条丢掉；
3. 选定音质失败后立刻跨平台整首重搜，从不尝试同源更低音质——VIP 限制下高价音质请求失败会把本来有 128k 的歌判死。

## Decision

在**不改原生**的前提下，把单脚本的利用率吃满，分三处：

1. **音质候选收敛到一处纯函数**：`src/core/music/playQuality.ts` 的 `getTryQualitys(highQuality, musicInfo, qualityList)` 返回按优先级排列的候选阶梯（flac24bit → flac → 320k → 128k）。规则：脚本明确不支持的音质排除；脚本未声明时只保留歌曲自身声明有的音质（不盲试）；全部被排除时退回用户设定值，保证不劣于旧实现。`getPlayQuality` 退化为取候选首位。
2. **同源音质降级**：`handleGetOnlineMusicUrl` 按阶梯逐个请求，全部失败才跨源换源。
3. **换源候选放宽**：`assertApiSupport` 改为「实现了 `getMusicUrl` 或声明了音质」；候选不再因缺 `_qualitys` 被跳过，改为「首选音质 + 128k 兜底」，并限制换源阶段最多 6 次取址请求。

## Invariants

- **调用方显式传 `quality` 时只试那一档**，不擅自降级——下载任务（`src/core/download/task.ts:164-200`）自己负责 128k 兜底并上报 `isQualityFallback`，这里再降级会让它汇报的音质与实际不符。
- ~~**缓存只用于首选音质**，降级档位一律取新地址，避免把过期链接当救命稻草。~~ 已被 ADR 0009 取代：缓存改为按音质阶梯顺序读取（首选档没命中时允许用降级档位的地址起播），"过期链接"改由「新鲜期 + 取址预算」控制。
- 换源仍遵守 `retryedSource`，同一平台不重复试。
- 失败路径长度受控：同源阶梯 ≤ 4 次、换源 ≤ 6 次，低于播放侧 100s 的 `addLoadTimeout` 兜底（`player.ts:74`）。

## Consequences

- 最多 4 次取址请求换回「原本直接判死」的歌；请求数增加只发生在失败路径上。
- 音质可能出现「用户选 flac、实际播 320k」——这是既有行为（旧代码同样会降 128k），但降级更准，且降级档位不再用缓存，避免误报。
- 真正的「多脚本并存」需要原生改多实例池 + JS provider 链，本 ADR 不涉及，留作后续。
