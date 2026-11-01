# 订阅源（自定义源）地址留存与迁移 实施计划

领域词汇见 [CONTEXT.md](../CONTEXT.md)。本文是本次「订阅源地址留存 / 复制 / 重新拉取」改造的唯一实施载体：决策记录、数据模型、模块规格、文件改动、验收标准。

状态：**已实施**（四轮决策已闭环；实施范围与本文一致，见 §11 实施记录）。

---

## 0. 背景与决策记录

用户反馈「设置里已导入的订阅源无法复制出来，换平板/手机要重新找源，希望备份后导入其它设备」。

代码事实决定了方案形态：

| 事实 | 依据 |
| --- | --- |
| 源元数据里**没有**导入 URL | `LX.UserApi.UserApiInfo` 只有 id/name/description/author/homepage/version/sources/allowShowUpdateAlert |
| 脚本原文**只存一次**，存本地 | `utils/data.ts:570 addUserApi` 写 `@user_api__<id>` |
| 每次加载都读**本地副本**，不联网 | `utils/data.ts:537 getUserApiScript` → `core/userApi.ts:13 setUserApi` |
| 全仓库无「按 URL 重新下载脚本」的路径 | 仅 `addUserApi` / `getUserApiScript` 两个触点 |
| 「更新」= 脚本自报 + 用户手动下载再导入，且会生成**新 id** | `core/init/userApi/index.ts:192 showUpdateAlert` |

因此：**URL 的唯一价值是「迁移时重新取货」**，而它当前根本没被记录。

已明确**砍掉**的方向及理由：

| 砍掉的方案 | 理由 |
| --- | --- |
| 备份包（导出脚本原文 + 元数据为文件） | 源下架即失效，用户不需要僵尸源保活；本地脚本本就是事实来源，备份的是用户不会去读的文件 |
| 「从备份文件导入」入口 | 多一次选目录、多一套格式校验与冲突策略，收益只是少点几下 |
| 批量复制 / 多行粘贴导入 | 迁移是低频动作，源数量通常 1~2 个，不值得为它加输入框改造 |
| 订阅源云同步 | 与现有同步体系耦合，脚本涉及第三方代码安全，收益不匹配成本 |

---

## 1. 已定决策清单

| 决策项 | 结论 |
| --- | --- |
| 主路径 | **单条复制源地址** → 新设备「在线导入」粘贴 |
| 是否记录 URL | 记录；在线导入时落盘，本地导入标记为 `local` |
| 历史源（无 URL） | 显示「来源未知」，提供**手动补录**；并从已存的 `homepage` 给线索 |
| 是否导出文件 | 否 |
| 是否支持批量 | 否（单条复制 + 现有在线导入即可闭环） |
| 重新拉取此源 | **做**：按已存 URL 重新下载，**覆盖同 id 脚本**，不新增源、不占 20 名额 |
| 重新拉取的失败保护 | 覆盖前保留上一版脚本，初始化失败**自动回滚**；并提供手动「恢复上一版」 |
| 允许显示更新弹窗 | 重新拉取后**保留**用户本机设置，不重置 |
| 20 个源上限 | 不受影响（复制不占额度，重新拉取不新增源） |

---

## 2. 数据模型变更

`LX.UserApi.UserApiInfo`（`src/types/user_api.d.ts`）新增三个可选字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `url` | `string?` | 在线导入地址；本地导入/补录前为空 |
| `importType` | `'online' \| 'local'?` | 当初的导入方式，仅用于展示，**不参与可用性判断** |
| `importedAt` | `number?` | 导入时间戳，详情里展示，帮助用户判断新旧 |

约定：

- 旧数据缺字段 → 一律视为「来源未知」，**不做数据迁移脚本**，读取时按 `undefined` 处理即可。
- 可用性判断只看 `url` 是否有值（补录过地址的本地源同样可以复制、可以重新拉取）。
- 重新拉取后刷新 `name / version / author / description / homepage`，但**不覆盖** `id / url / importType / importedAt / allowShowUpdateAlert`。
- 新脚本头部 `@name` 为空时**保留原名**，不得回落到 `addUserApi` 的 `user_api_<时间>` 兜底命名。

新增存储键（仅重新拉取使用）：

- `@user_api__<id>__prev`：上一版脚本，仅保留最近一版，成功拉取时被替换，删除源时一并清除。

---

## 3. 功能规格

### 3.1 记录地址（导入时）

- 在线导入成功 → 写入 `url`、`importType: 'online'`、`importedAt`。
- 本地导入成功 → `importType: 'local'`，`url` 留空。
- 导入失败（下载失败 / 脚本无效 / 超 9MB）→ **不落任何字段**，不产生半成品记录。

### 3.2 列表项操作菜单

现状：`List.tsx` 每行右侧只有一个 `×`（删除）。改为 `⋯` + `×` 并列，`⋯` 打开 ActionSheet：

| 菜单项 | 显示条件 | 说明 |
| --- | --- | --- |
| 复制源地址 | `url` 有值 | 复制完整 URL，toast `已复制源地址` |
| 重新拉取此源 | `url` 有值 | 见 3.4 |
| 查看详情 | 始终 | 见 3.3 |
| 补充来源地址 | `url` 为空 | 见 3.5 |
| 恢复上一版 | `@user_api__<id>__prev` 存在 | 见 3.4 回滚 |
| 移除 | 始终 | 沿用现有确认弹窗 |

`url` 为空时，「复制源地址」不显示（而非置灰）——避免给用户一个永远点不动的按钮；本地源的解释放在「查看详情」里。

### 3.3 查看详情

轻量弹窗，字段：名称、版本、作者、描述、**来源地址**（长链接中间省略，点击展开/再次点击复制）、导入方式（在线 / 本地文件 / 未知）、导入时间、作者主页（有则给「打开」）。

- 无 `url` 时来源一行显示 `来源未知（旧版本导入）` + 一行说明「可通过『补充来源地址』补录」。
- 地址可能含个人 token：**日志与错误提示一律不打印 URL**（现状已满足，实施时保持）。

### 3.4 重新拉取此源

前置：`url` 有值。

流程：

1. 确认弹窗：`将从 {host} 重新下载脚本并覆盖「{name}」，本地对该源的其它设置会保留。`
2. 下载：复用 `httpFetch`，沿用 9MB 上限；失败 → 中止，不动本地任何数据。
3. 静态校验：必须能匹配脚本头部注释（与 `addUserApi` 同一规则 `/^\/\*[\S|\s]+?\*\//`）；不通过 → 中止并提示「下载到的内容不是有效的自定义源」。
4. 备份：把当前脚本写入 `@user_api__<id>__prev`（覆盖上一版 prev）。
5. 覆盖：写入 `@user_api__<id>`，并用新头部信息刷新元数据（见 §2 约定）。
6. 生效：
   - 若该源**是当前启用源** → 重新 `setUserApi(id)` 并等待初始化结果；
     - 成功 → toast `已更新到 v{version}`；
     - 失败 → **自动回滚**：写回 prev 脚本 + 重新 `setUserApi(id)` → toast `新版本初始化失败，已恢复上一版`。
   - 若**不是当前启用源** → 不做运行验证，toast `已更新到 v{version}，切换到此源时生效`。
7. 版本未变化时仍执行覆盖（内容可能变），文案用「已更新到 v{version}」，不提示「已是最新」。

「恢复上一版」：读取 `__prev` 覆盖当前脚本（同样走第 6 步的生效与回滚逻辑），成功后 toast `已恢复上一版`。

### 3.5 补充来源地址

- 弹输入框，校验 `^https?://`，失败提示 `请输入以 http:// 或 https:// 开头的地址`。
- 保存后仅写 `url`（`importType` 保持原值），列表项立即可复制、可重新拉取，重启后仍在。
- 不预填剪贴板内容，避免误存无关文本。

---

## 4. 文件改动清单（按层）

| 层 | 文件 | 改动 |
| --- | --- | --- |
| 类型 | `src/types/user_api.d.ts` | `UserApiInfo` 增 `url` / `importType` / `importedAt` |
| 存储 | `src/utils/data.ts` | `addUserApi(script, meta?)` 接收 url/importType；新增 `updateUserApiInfo(id, patch)`、`saveUserApiScript(id, script, { keepPrev })`、`getUserApiScriptPrev(id)`；`removeUserApi` 连带删 `__prev` |
| 核心 | `src/core/userApi.ts` | `importUserApi(script, meta?)`；新增 `refreshUserApi(id)`（下载→校验→备份→覆盖→生效→回滚）、`restorePrevUserApi(id)`、`setUserApiUrl(id, url)` |
| Store | `src/store/userApi/action.ts` | 新增 `updateUserApi(info)`（就地替换列表项，避免整表重设） |
| UI | `Setting/settings/Basic/UserApiEditModal/List.tsx` | 行尾 `⋯` 菜单、ActionSheet 各项按条件显隐 |
| UI | 新增 `.../UserApiEditModal/Detail.tsx` | 详情弹窗（含复制、打开主页） |
| UI | 新增 `.../UserApiEditModal/SetUrl.tsx` | 补录地址输入弹窗 |
| UI | `.../UserApiEditModal/ScriptImportOnline.tsx` | 导入时把 URL 透传给 `handleImportScript` |
| UI | `.../UserApiEditModal/action.ts` | `handleImportScript(script, meta)` 透传 |
| 文案 | `src/lang/{zh-cn,zh-tw,en-us}.json` | 见 §5 |

不新增页面、不改动 `UserApiEditModal/index.tsx` 的入口结构、不改动现有导入下拉的两个选项。

---

## 5. 文案清单（zh-cn）

| key | 文案 |
| --- | --- |
| `user_api_copy_url` | 复制源地址 |
| `user_api_copy_url_success` | 已复制源地址 |
| `user_api_refresh` | 重新拉取此源 |
| `user_api_refresh_confirm` | 将从 {host} 重新下载脚本并覆盖「{name}」，本地对该源的其它设置会保留。 |
| `user_api_refresh_success` | 已更新到 {version} |
| `user_api_refresh_success_pending` | 已更新到 {version}，切换到此源时生效 |
| `user_api_refresh_failed` | 更新失败：{message} |
| `user_api_refresh_invalid_script` | 下载到的内容不是有效的自定义源 |
| `user_api_refresh_rollback` | 新版本初始化失败，已恢复上一版 |
| `user_api_restore_prev` | 恢复上一版 |
| `user_api_restore_prev_success` | 已恢复上一版 |
| `user_api_set_url` | 补充来源地址 |
| `user_api_url_invalid` | 请输入以 http:// 或 https:// 开头的地址 |
| `user_api_source_unknown` | 来源未知（旧版本导入） |
| `user_api_source_unknown_tip` | 可通过「补充来源地址」补录，补录后即可复制与重新拉取 |
| `user_api_detail` | 查看详情 |
| `user_api_import_type_online` | 在线导入 |
| `user_api_import_type_local` | 本地文件 |
| `user_api_import_type_unknown` | 未知 |
| `user_api_homepage` | 作者主页 |

---

## 6. 跨设备迁移闭环

| 场景 | 路径 | 步数 |
| --- | --- | --- |
| 主场景（1~2 个源） | 旧机 `⋯` → 复制源地址 → 发给自己 → 新机「在线导入」粘贴 → 完成 | 4 步 |
| 本地导入的源 | 无地址，详情里明确说明「本地导入的源没有在线地址」 | — |
| 老源首次使用 | 详情 → 补充来源地址（一次性）→ 此后与新源一致 | 3 步 |

注意：迁移到新设备拿到的是**迁移时刻 URL 上的最新版本**，旧设备仍是导入时那份。两端版本可能不一致，属预期行为，不自动对齐（用户可通过「重新拉取此源」在旧机手动追平）。

---

## 7. 异常与边界

| 场景 | 处理 |
| --- | --- |
| 旧数据无 `url` | 详情显示「来源未知」，菜单出现「补充来源地址」，不报错不阻断 |
| 本地导入的源 | `url` 为空，不显示复制/重新拉取；详情里说明原因 |
| URL 含 token | 原样复制（用户需要），展示截断，日志不打印 |
| 下载失败 / 超时 | 中止，本地数据不变，提示原始错误 |
| 下载内容非脚本（HTML 错误页等） | 头部注释校验拦下，提示「不是有效的自定义源」 |
| 脚本超 9MB | 沿用现有上限，拒绝并提示 |
| 新版本脚本初始化失败 | 自动回滚到 `__prev` 并重新加载，toast 告知 |
| 非当前源的脚本被拉坏 | 不做运行验证；用户切换过去失败时可「恢复上一版」 |
| 重新拉取时源已被删除 | 中止并提示，不重建源 |
| 重复导入同一 URL | 现状允许（生成新 id），本期不新增检测；与「重新拉取」的区别在详情里说明 |
| 20 个源上限 | 不受影响 |

---

## 8. 验收标准

1. 在线导入一个源 → `⋯` 出现「复制源地址」→ 复制出的 URL 能被本机「在线导入」重新导入成功。
2. 本地导入的源 → 无「复制源地址」，详情显示「本地文件」且说明无在线地址。
3. 升级前已存在的源 → 详情显示「来源未知」→ 「补充来源地址」补录合法地址 → 立即可复制，重启后仍在；非法地址被拦下且不写入。
4. 修改 URL 上的脚本版本号 → 「重新拉取此源」→ 列表项版本号更新，源数量不变（不新增），`允许显示更新弹窗` 保持原值。
5. 重新拉取时把 URL 指向一个无效内容 → 提示「不是有效的自定义源」，本地脚本与元数据**完全未变**。
6. 重新拉取一个会在初始化时报错的脚本（当前启用源）→ 自动回滚，源仍可用，toast 提示已恢复上一版。
7. 「恢复上一版」→ 版本号回到上一版，源可用。
8. 地址超长时列表/详情不破版，复制的仍是完整串。
9. 零回归：本地导入、在线导入、20 上限、删除确认、更新弹窗、源切换、初始化失败提示，行为均不变。
10. 迁移全流程：A 机复制 → B 机在线导入 → B 机可正常取音频。

---

## 9. 非目标

- 订阅源云同步、二维码分享、批量复制/多行导入。
- 导出/导入备份文件、脚本原文导出、源下架保活。
- 自动检查更新、定时拉取（保持「脚本自报 + 用户手动触发」的现有模型）。
- 源重命名、源分组、多源同时启用。

---

## 10. 风险

| 风险 | 说明 | 应对 |
| --- | --- | --- |
| 迁移依赖 URL 有效 | 源下架则迁不走 | 已与产品确认接受；详情页不承诺「永久可迁移」 |
| 重新拉取可能装坏可用源 | 新版本脚本可能初始化失败 | `__prev` 备份 + 自动回滚 + 手动恢复入口 |
| URL 携带个人信息 | 部分源地址含 token | 日志不打印、展示截断、复制为用户主动行为 |
| 非当前源无法运行验证 | 拉坏的脚本要到切换时才暴露 | 保留 `__prev`，提供「恢复上一版」 |

---

## 11. 实施记录

已按本文落地，`npx eslint src` 改动文件 0 问题、`npx tsc --noEmit` 仅剩 5 个既有错误、`npx react-native bundle --platform android` 通过。

| 层 | 文件 | 实际改动 |
| --- | --- | --- |
| 类型 | `src/types/user_api.d.ts` | 新增 `UserApiImportType`，`UserApiInfo` 增 `url` / `importType` / `importedAt` |
| 存储 | `src/utils/data.ts` | `addUserApi(script, meta?)` 写入来源信息；新增 `updateUserApiInfo` / `updateUserApiScript` / `restoreUserApiScript` / `getUserApiScriptPrev`；`applyUserApiScript` 统一「校验头部 → 合并元数据 → 写 prev → 写脚本」；`removeUserApi` 连带删除 `__prev` |
| 核心 | `src/core/userApi.ts` | `importUserApi(script, meta?)`；新增 `refreshUserApi` / `restorePrevUserApi` / `setUserApiUrl`；`reloadUserApi` 复用 `apiInitPromise` 并加 15s 超时兜底 |
| Store | `src/store/userApi/action.ts` | 新增 `updateUserApi`（就地替换列表项） |
| UI | `.../UserApiEditModal/List.tsx` | 行尾 `⋯` 菜单、ActionSheet 各项按条件显隐、复制/重新拉取/详情/补录/恢复上一版/移除的接线 |
| UI | `.../UserApiEditModal/UserApiMenu.tsx`（新增） | 菜单组件，打开前异步读取 `__prev` 决定是否显示「恢复上一版」 |
| UI | `.../UserApiEditModal/UserApiDetail.tsx`（新增） | 详情弹窗：来源地址（中间省略）、复制、导入方式、导入时间、作者主页、描述 |
| UI | `.../UserApiEditModal/UserApiSetUrl.tsx`（新增） | 补录地址弹窗，`^https?://` 校验 |
| UI | `.../UserApiEditModal/action.ts`、`ScriptImportOnline.tsx` | 导入时透传 `url` / `importType` |
| 文案 | `src/lang/{zh-cn,zh-tw,en-us}.json` | 新增 30 条 `user_api_*` 文案 |

与本文的偏差：`refreshUserApi` 的「重新加载」没有调用 `core/apiSource.ts` 的 `setApiSource`，而是在 `core/userApi.ts` 内用同一套 `apiInitPromise` 约定自行实现，以避免 `userApi ↔ apiSource` 的循环依赖；行为一致（置 pending → native 回调 resolve → 超时判失败）。

