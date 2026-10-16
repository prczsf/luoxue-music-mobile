# 下载内嵌元数据（封面 / 歌词）实施计划

领域词汇见 [CONTEXT.md](../CONTEXT.md)；命名与重复下载语义见 [ADR 0004](adr/0004-download-file-naming-and-duplicate-semantics.md)，队列持久化与恢复见 [ADR 0005](adr/0005-download-queue-persistence-and-recovery.md)。本文是本次下载能力改造的唯一实施载体：决策清单、模块规格、文件改动、实施顺序与验收。

状态：**已定稿，待实施**（三轮决策已闭环，实施中不再变更范围；范围外诉求另开计划）。

---

## 0. 范围与分期

- **P1 管线与设置（约 3 人日）**：设置项与设置页、FIFO 并发队列、文件名接线、音质协商开关、容器识别、落盘与媒体扫描。
- **P2 内嵌与伴生文件（约 2 人日）**：封面压缩原生模块、三路并发采集、标签注入、伴生 `.lrc` / `.jpg`。
- **P3 可见性与恢复（约 1.5 人日）**：下载任务面板、批量下载入口、重启恢复、权限前置检查。

**非目标（本次不做）**：暂停与断点续传、已完成任务的历史持久化、歌单详情页批量入口、历史文件补写（重新嵌入元数据）、默认下载目录改动、SAF/分区存储迁移。

---

## 1. 已定决策清单

| 决策项 | 结论 |
| --- | --- |
| 内嵌封面 / 内嵌歌词（主开关） | 默认**关** |
| 内嵌 翻译 / 罗马音 / LX 逐字 | 默认**关**，随主开关置灰 |
| 伴生 `.lrc` / 伴生 `.jpg` | 默认**关**，**不受**内嵌主开关约束 |
| 并发数 | 默认 **3**（1~6），改值即时生效，不打断运行中任务 |
| 自动换源 | 默认**开**；关闭 = 严格只用请求音质，失败即报错 |
| 音质阶梯 | 开自动换源时按 `请求音质 → … → 128k` 向下找；阶梯降级与跨源兜底**共用同一开关** |
| 文件命名 | 接线既有 `download.fileName`，**不再追加 `[音质]` 后缀** |
| 封面压缩 | 长边 500px、JPEG q85；原图长边 ≤500 且 ≤300KB 则直出；伴生 `.jpg` 也用压缩图 |
| 队列形态 | FIFO，**持久化**（AsyncStorage）；重启恢复为 `waiting` 并**重新解析 URL** |
| 恢复前置检查 | 权限/目录不可写 → 整批置 `error` + 一条明确提示，不静默、不逐条刷屏 |
| 持久化范围 | 仅 `waiting / run / error`；已完成记录重启后不保留 |
| 失败语义 | 音频**永远算成功**；标签/封面/歌词失败只记日志 + 任务级短提示，绝不删文件 |
| 伴生文件 | 与音频完全同名（仅扩展名不同）、UTF-8 无 BOM + LF、内容与内嵌一致 |
| 换源后元数据 | 以实际下载成功的源为准，失败回退原曲目源；换源/降级每任务最多一条 toast |
| 重复下载 | 单曲：静默覆盖；批量：按同名文件跳过（见 3.2） |

---

## 2. 文件与改动清单

### 新增

```
src/core/download/
├── task.ts                 # 单任务流水线：命名 → 音质协商 → 三路并发 → 容器识别 → 打标签 → 落盘 → 扫描 → 伴生文件
└── queue.ts                # FIFO 并发调度 + 持久化 + 重启恢复 + 取消/重试/清空

src/utils/imageCompress.ts                        # 封面压缩 JS 门面

src/screens/Home/Views/Setting/settings/Download/
├── FileName.tsx            # 文件命名方式（三选一）
├── Embed.tsx               # 嵌入封面 / 嵌入歌词（主开关 + 三个子开关）
├── ExtraFiles.tsx          # 伴生 .lrc / .jpg
└── Task.tsx                # 同时下载数 + 自动换源

src/screens/Home/Views/Download/DownloadTaskPanel.tsx   # 下载任务面板

android/app/src/main/java/cn/luoxue/music/mobile/image/
├── ImageCompressModule.java
└── ImageCompressPackage.java

docs/download-metadata-plan.md（本文）
```

### 修改

| 文件 | 改动 |
| --- | --- |
| `src/config/defaultSetting.ts` | `download.*` 段（70-75 行区域）追加 9 个键 |
| `src/types/app_setting.d.ts` | 357-372 行区域补 9 个键的类型 |
| `src/screens/Home/Views/Setting/settings/Download/index.tsx` | 挂载 4 个新组件，顺序固定（见 3.1） |
| `src/screens/Home/Views/Download/index.tsx` | 顶部挂载下载任务面板 |
| `src/core/downloadMusic.ts` | `downloadMusicFile()` 签名不变、内部改为入队；去掉 `[音质]` 后缀与硬编码命名 |
| `src/utils/fs.ts` | 新增 `scanFile(path)`、`readFileSlice(path, length, position)` |
| `src/utils/data.ts` | 新增 `getDownloadTasks() / saveDownloadTasks()`（走既有 `getData` / `saveData`） |
| `src/core/download/batch.ts`（新增） | `startBatchDownload(list, quality?)`：确认框 → 单次上限截断 → 跳过判定 → 入队 → 汇总 toast |
| `src/components/OnlineList/index.tsx`、`src/screens/MylistDetail/MusicList.tsx` | 已有「多选后下载」路径改走 `startBatchDownload`；单曲仍走 `downloadMusicFile` |
| `src/types/download_list.d.ts` | 复用既有任务结构；如缺字段仅少量补充 |
| `android/app/src/main/java/cn/luoxue/music/mobile/MainApplication.java` | 注册 `ImageCompressPackage`（照 33-37 行写法） |
| `src/lang/zh-cn.json` `zh-tw.json` `en-us.json` | 新增文案 key（见 3.8），三语同步 |

### 复用（逻辑不动）

| 既有能力 | 位置 |
| --- | --- |
| 歌词合成（含 `awlrc` base64 封装、翻译/罗马音追加与时间戳过滤） | `src/utils/lrcTools.ts: buildLyrics` |
| 文件名格式化 | `src/utils/tools.ts: formatMusicName` |
| 文件名非法字符过滤 | `src/utils/common.ts: filterFileName` |
| 音质阶梯 | `src/core/music/utils.ts: getPlayQuality`（`TRY_QUALITYS_LIST = ['flac24bit','flac','320k']` + 兜底 `128k`） |
| 音源解析 / 封面 URL / 歌词信息 | `src/core/music/index.ts: getMusicUrl / getPicPath / getLyricInfo` |
| 原生标签写入（jaudiotagger） | `react-native-local-media-metadata: writeMetadata / writePic / writeLyric` |

---

## 3. 模块规格

### 3.1 设置项

新增键（默认值均为「关」，除注明外）：

| key | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `download.embedPic` | boolean | false | 内嵌封面 |
| `download.embedLyric` | boolean | false | 内嵌歌词（主开关） |
| `download.embedTlrc` | boolean | false | 同时内嵌翻译歌词 |
| `download.embedRlrc` | boolean | false | 同时内嵌罗马音歌词 |
| `download.embedAwlrc` | boolean | false | 同时内嵌 LX 逐字歌词（`[\|awlrc:…]` base64） |
| `download.saveLrcFile` | boolean | false | 同时保存伴生 `.lrc` |
| `download.savePicFile` | boolean | false | 同时保存伴生 `.jpg` |
| `download.concurrency` | number | **3** | 同时下载数（1~6） |
| `download.autoToggleSource` | boolean | **true** | 下载失败时自动切换音源（含阶梯降级） |

接线既有键：`download.fileName`（本次补设置项 UI）、`download.savePath`、`download.quality`、`download.askQuality`。

设置页挂载顺序（`Download/index.tsx`）：下载目录 → 默认下载音质 → 下载前总是询问音质 → **文件命名方式** → **嵌入内容** → **伴生文件** → **任务控制**。

**置灰联动**：`download.embedLyric` 为 false 时，翻译 / 罗马音 / 逐字三个子开关以 `disabled` 呈现（`@/components/common/CheckBox` 已支持 `disabled`，自带降透明度样式），点击不生效。

### 3.2 命名与重复下载语义

- 基础名 = `filterFileName(formatMusicName(setting['download.fileName'], name, singer))`；结果为空时退回 `musicInfo.id`。
- **不再追加音质后缀**（移除现有 `[320k]` 逻辑）。
- 目标文件 = `${下载目录}/${基础名}.${真实容器扩展名}`；伴生文件 = `${基础名}.lrc` / `${基础名}.jpg`（同名，仅扩展名不同）。
- **单曲下载**：目标已存在 → `unlink` 后写入（静默覆盖）。
- **批量下载**：入队前扫描一次下载目录，若存在同名基础文件（`.mp3/.flac/.m4a/.ogg/.wav/.ape` 任一）→ 跳过并计入汇总。

> 说明：因"已完成记录不持久化"，没有 `id ↔ 文件` 映射，按 `id` 判定"已下载"不可行，故批量一律按同名文件判定。副作用是"批量里想以更高音质重下同一首"会被跳过；单曲下载不受影响（覆盖）。

### 3.3 音质协商（阶梯降级 + 跨源兜底）

- **`download.autoToggleSource = true`**：`getPlayQuality(请求音质, musicInfo)` 得到该源可达的档位（阶梯 `flac24bit → flac → 320k → 128k`），`getMusicUrl({ quality, allowToggleSource: true })`；失败后依次用 `musicInfo.meta.toggleMusicInfo`、原曲目候选重试。
- **`download.autoToggleSource = false`**：**不调用** `getPlayQuality`，`quality = 请求音质`、`allowToggleSource: false`，失败即 `error`，不换源、不降级。
- **提示**：每个任务最多一条短 toast。降级复用既有 `list_download_quality_fallback`；跨源换源用新增 `list_download_source_toggled`。失败明细只写 `log.error`。
- **直链失效重试（410/403/404/416）**：拿到 URL 后若音频响应非 200，视为直链已过期，用 `isRefresh: true` **重新协商**并跳过已失败的链接（`skipUrls`）、间隔 1s 重试，最多 2 次（开自动换源时同时走阶梯降级/跨源候选）。全部失败才置 `error`；提示改用 `list_download_link_expired({code})`，`statusCode` 明细写 `log.error`（设置 → 其他 → 日志 可见）。

### 3.4 单任务流水线

| 阶段 | 动作 | 容错 |
| --- | --- | --- |
| 1 入队与协商 | 生成基础名/目标路径 → 3.3 音质协商拿到 URL | 失败 → 任务 `error` |
| 2 三路并发 | ① 音频流 → 缓存目录 `lx_dl_tmp_*`；② 封面：`getPicPath` → URL → 下载到缓存 → 压缩；③ 歌词：`getLyricInfo` → `buildLyrics(lrcInfo, embedAwlrc, embedTlrc, embedRlrc)` | ②③ 5s 超时即放弃，**不阻塞**音频；各自异常只记日志 |
| 3 容器识别与打标签 | 读首 16 字节定容器 → **对 `tmp` 文件**依次 `writeMetadata`（歌名/歌手/专辑）→ `writePic` → `writeLyric` | 每步独立 try/catch；失败记日志 + 任务级 `download_task_attach_failed` 短提示 |
| 4 落盘与可见性 | `unlink(目标)` → `copyFile(tmp → 目标)` → `unlink(tmp)` → `scanFile(目标)`；随后写伴生 `.lrc`（`writeFile`，UTF-8 无 BOM + LF）与 `.jpg`（`copyFile` 压缩图） | 伴生文件失败只记日志；`scanFile` 失败不影响任务成功 |

**容器识别**（`readFileSlice` + Buffer 比对）：

| 判定 | 容器 |
| --- | --- |
| `ID3` 或 `0xFF 0xFB/F3/F2` | mp3 |
| `fLaC` | flac |
| `OggS` | ogg |
| `RIFF…WAVE` | wav |
| `MAC␠` | ape |
| offset 4 处 `ftyp` | m4a/mp4 |
| 均不匹配 | 回退 URL 后缀判定 |

以**真实容器**决定落盘扩展名（音源标称与服务端实际不一致时不误命名）。jaudiotagger 写标签以 mp3/flac/wav/ogg 为主；`m4a/ape` 写入可能失败 → 按失败语义处理（音频仍成功）。

### 3.5 封面压缩原生模块

- **接口**：`compressImage(srcPath, destPath, { maxSize = 500, quality = 85, maxDirectBytes = 307200 })` → `{ path, width, height, size }`。
- **逻辑**：`inJustDecodeBounds` 读长边与文件大小 → 长边 ≤500 且 ≤300KB → 直出原图（返回 `srcPath`）；否则 `inSampleSize`（2 的幂）预缩 → `createScaledBitmap` 精确到长边 500 → `compress(JPEG, 85)` 写入 `destPath`。
- **失败**：JS 侧捕获后回退原图并记日志，不阻断任务。
- **真机验证修正**：压缩模块「小图直出」时返回的是**原图路径**，而原图在 `prepareCover` 结束时会被删除 → 调用方拿到已失效路径（`writePic` 与伴生 `.jpg` 报 `ENOENT`）。现统一把结果落到带 `.jpg` 的固定封面路径（必要时 `copyFile`），临时文件名加唯一 token 避免同曲并发互删，并在任务结束时统一清理封面 / 标签 / 音频三个临时文件。
- **落点**：`android/app/.../image/`，在 `MainApplication.java` 与既有 `CachePackage / LyricPackage / UtilsPackage / CryptoPackage / UserApiPackage` 并列注册。
- **理由**：`react-native-local-media-metadata` 等为 GitHub 依赖，不宜改其 `node_modules`；不引入第三方图像库（避免又一份不受控依赖与 RN 版本约束）。

### 3.6 任务队列、持久化与恢复

- **任务结构**：复用 `src/types/download_list.d.ts` 已声明的 `LX.Download.ListItem`（`status: run/waiting/pause/error/completed`、`progress/speed/downloaded/total`、`metadata{musicInfo,url,quality,ext,fileName,filePath}`），如缺字段仅少量补充。
- **调度**：FIFO + 并发上限读 `download.concurrency`；改值立即生效（仅影响后续调度，不打断在跑任务）。
- **持久化**：`src/utils/data.ts` 新增 `getDownloadTasks/saveDownloadTasks`，复用既有 `getData/saveData`（AsyncStorage）；写入节流，避免高频进度写盘。
- **恢复**：启动读盘 → 过滤 `waiting/run/error`，`run → waiting` → **丢弃 URL 与进度** → 检查存储权限与目录可写 → 按**当前**设置并发与音质重新走 3.3 协商 → 从头下载（无断点续传，残留 `tmp` 一律删除）。
- **恢复前置检查失败**：整批置 `error` + 一条 `download_task_dir_unavailable` 提示，等用户处理后再点重试。
- **操作**：取消（`waiting` / `run`）、重试（`error`）、清空已完成（全部取消 / 清空已完成）。
- **门面**：`src/core/downloadMusic.ts: downloadMusicFile(musicInfo, dirPath, qualityOverride?)` 签名不变，内部改为入队；现有 4 处调用点（`OnlineList`、`MylistDetail/MusicList`、`PlayDetail/DownloadBtn`、`listAction` 再导出）零改动。

### 3.7 UI：任务面板与批量入口

- **任务面板**（`DownloadTaskPanel.tsx`，挂在「我的下载」页顶部，与下方磁盘扫描列表共存）：可折叠；每行 = 歌名·歌手 / 状态 / 进度条 / 速度，失败行带「重试」；区头 = 「全部取消」「清空已完成」；无任务时不占位。
- **批量入口**：不新增菜单项。`OnlineList`、`MylistDetail/MusicList` 既有「多选后下载」路径在选中多首时改走 `startBatchDownload(list, quality?)`（`src/core/download/batch.ts`）：`confirmDialog`（将排队 N 首）→ 单次上限 **200** 首（超出截断并提示）→ 3.2 跳过判定（含已有任务去重）→ 入队 → 汇总 toast（已加入 N 首 / 跳过 M 首）；未选中多首时仍走原 `downloadMusicFile`。歌单详情页不加入口。
- 既有单曲 toast（开始 / 成功 / 失败）保留。

### 3.8 i18n key 清单（三语同步）

| 分组 | key |
| --- | --- |
| 批量 | `list_download_all`、`list_download_all_confirm`、`list_download_all_done`、`list_download_all_limit` |
| 换源 | `list_download_source_toggled` |
| 任务面板 | `download_task_title`、`download_task_status_waiting`、`download_task_status_running`、`download_task_status_failed`、`download_task_retry`、`download_task_cancel_all`、`download_task_clear_completed`、`download_task_attach_failed`、`download_task_dir_unavailable` |
| 命名 | `setting_download_file_name`、`setting_download_file_name_name_singer`、`setting_download_file_name_singer_name`、`setting_download_file_name_name` |
| 内嵌 | `setting_download_embed_group`、`setting_download_embed_pic`、`setting_download_embed_lyric`、`setting_download_embed_tlrc`、`setting_download_embed_rlrc`、`setting_download_embed_awlrc`、`setting_download_embed_tip` |
| 伴生文件 | `setting_download_extra_file_group`、`setting_download_save_lrc`、`setting_download_save_lrc_tip`、`setting_download_save_pic`、`setting_download_save_pic_tip` |
| 任务控制 | `setting_download_task_group`、`setting_download_concurrency`、`setting_download_concurrency_tip`、`setting_download_auto_toggle_source`、`setting_download_auto_toggle_source_tip` |

复用既有：`list_download`、`list_download_quality`、`list_download_quality_fallback`、`list_download_start`、`list_download_success`、`list_download_failed`、`list_downloading_tip`。

---

## 4. 实施顺序与每步验收

每步结束跑 `npm run lint`（必要处加 `npx tsc --noEmit`），并报告结果。

| 步 | 内容 | 验收方式 |
| --- | --- | --- |
| 1 | 设置项 + 设置页 + i18n | 设置页可见、置灰联动生效、杀进程后取值保持 |
| 2 | 管线改造（不含标签）：队列 + 音质协商开关 + 文件名接线 + 容器识别 | 单曲与批量可下；并发上限生效；关自动换源时严格失败 |
| 3 | 封面压缩原生模块 | `npm run pack:android:debug` 重编译后真机压缩一张大图，长边 ≤500、体积明显下降 |
| 4 | 标签合成：内嵌封面 / 歌词 + 伴生文件 | `readMetadata/readPic/readLyric` 回读正确；伴生 `.lrc` 同名同内容 |
| 5 | 任务面板 + 批量入口 | 排队/进度/失败重试/取消/清空可用；批量上限与跳过汇总正确 |
| 6 | 重启恢复 + 权限前置检查 | 杀进程重启：未完成任务回到 `waiting` 并重下；关权限后重启：整批 `error` + 提示 |
| 7 | 全量回归 | 第 5 节矩阵全过 + `npm run lint` |

> P2 起必须重新编译 APK（原生模块不能靠 JS 热重载验证）。

---

## 5. 真机验收矩阵

| # | 场景 | 期望 |
| --- | --- | --- |
| 1 | 全关（默认值）下载 | 无封面/歌词标签；文件仅含音频与基础标签 |
| 2 | 只开内嵌封面 | `readPic` 可回读；尺寸长边 ≤500、体积 ≤300KB 量级 |
| 3 | 开歌词 + 翻译 | `readLyric` = 原词 + 翻译追加；伴生 `.lrc` 同名且内容一致 |
| 4 | 开 LX 逐字 | 内嵌内容含 `[\|awlrc:…]` 段 |
| 5 | 并发 = 1，批量 10 首 | 任务面板严格串行，进度/速度正常 |
| 6 | 批量含已下载同名文件 | 汇总 toast 报告跳过数，未重复下载 |
| 7 | 关自动换源 + 选源无该音质 | 任务直接 `error`；开自动换源 → 降级/换源提示后成功 |
| 8 | 下载中杀进程并重启 | 未完成任务恢复为 `waiting` 并重新解析 URL 下载完成 |
| 9 | 关闭存储权限后重启 | 整批 `error` + 目录不可用提示，可重试 |
| 10 | 下载完成瞬间切第三方播放器（椒盐/Musicolet） | 无需手动扫描即可见，且带封面与歌词 |
| 11 | m4a / ape 等容器 | 音频下载成功；标签写入失败时仅提示，文件保留 |
| 12 | 单曲重复下载（先 128k 再 320k） | 静默覆盖旧文件，不产生 `[320k]` 后缀文件 |

---

## 6. 风险与对策

| 风险 | 对策 |
| --- | --- |
| jaudiotagger 对 `m4a/aac/opus/ape` 写入受限 | 按失败语义处理：音频仍算成功，只提示不删文件 |
| 源站封面过大撑爆存储 | 原生压缩到长边 500 / q85；小图直出避免二次编码 |
| 批量下载触发高频请求被风控 | 单次上限 200 首 + 并发默认 3 + 复用既有换源限流逻辑 |
| 队列持久化写入抖动 | 进度写盘节流；只在状态跃迁（入队/开始/失败/完成）时必写 |
| 原生模块与既有 5 个 Package 冲突 | 照 `MainApplication.java:33-37` 既有写法注册；先 `assembleDebug` 验证 |
| 公共目录写入依赖 `targetSdk 29 + requestLegacyExternalStorage` | 本次不动该前提；升 targetSdk 需另开计划（SAF 迁移） |
| 恢复时 URL 必失效导致失败 | 恢复一律丢弃旧 URL 重新协商，不试图复用 |

---

## 7. 工期

| 阶段 | 内容 | 估时 |
| --- | --- | --- |
| P1-1 | 设置项 / 设置页 / i18n | 1d |
| P1-2 | 队列 + 持久化骨架 + 音质协商 + 文件名接线 | 1.5d |
| P1-3 | 容器识别 + 落盘 + 媒体扫描 | 0.5d |
| P2-1 | 封面压缩原生模块 | 1d |
| P2-2 | 三路并发采集 + 标签注入 + 伴生文件 | 1d |
| P3-1 | 任务面板 | 1d |
| P3-2 | 批量入口 + 重启恢复 + 权限检查 | 0.5d |
| P3-3 | 全量验收与回归 | 1d |

---

定稿日期：2026-10-16（三轮决策评审后）
