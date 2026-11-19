<p align="center"><a href="https://github.com/lyswhut/lx-music-mobile"><img width="200" src="https://github.com/lyswhut/lx-music-mobile/blob/master/doc/images/icon.png" alt="lx-music logo"></a></p>

<h1 align="center">LX Music 移动版</h1>

<p align="center">
  <a href="https://github.com/lyswhut/lx-music-mobile/releases"><img src="https://img.shields.io/github/release/lyswhut/lx-music-mobile" alt="Release version"></a>
  <a href="https://github.com/lyswhut/lx-music-mobile/actions/workflows/release.yml"><img src="https://github.com/lyswhut/lx-music-mobile/workflows/Build/badge.svg" alt="Build status"></a>
  <a href="https://github.com/lyswhut/lx-music-mobile/actions/workflows/beta-pack.yml"><img src="https://github.com/lyswhut/lx-music-mobile/workflows/Build%20Beta/badge.svg" alt="Build status"></a>
  <a href="https://github.com/facebook/react-native"><img src="https://img.shields.io/github/package-json/dependency-version/lyswhut/lx-music-mobile/react-native/master" alt="React native version"></a>
  <!-- <a href="https://github.com/lyswhut/lx-music-mobile/releases"><img src="https://img.shields.io/github/downloads/lyswhut/lx-music-mobile/latest/total" alt="Downloads"></a> -->
  <a href="https://github.com/lyswhut/lx-music-mobile/tree/dev"><img src="https://img.shields.io/github/package-json/v/lyswhut/lx-music-mobile/dev" alt="Dev branch version"></a>
  <!-- <a href="https://github.com/lyswhut/lx-music-mobile/blob/master/LICENSE"><img src="https://img.shields.io/github/license/lyswhut/lx-music-mobile" alt="License"></a> -->
</p>

<p align="center">一个基于 React Native 开发的音乐软件（基于 <a href="https://github.com/lyswhut/lx-music-mobile">lx-music-mobile</a> 上游 <code>fb848072</code> 的定制修改版，当前版本 <strong>v1.10.3</strong>）</p>

## 修改版特性（v1.10.0 ~ v1.10.3）

本仓库基于洛雪音乐移动版主线进行定制增强，核心改动如下：

- **随心漫游（v1.10.0）**：新增「随心漫游」首页，支持全部歌曲、熟歌热歌（保守 / 均衡 / 探索）、常听艺人、风格盲盒与虚拟队列自动续杯。
- **全站下载与元数据写入（v1.10.0）**：补全播放详情页及各列表单曲/批量下载能力，支持音质阶梯降级与跨源兜底、内嵌封面/歌词标签及伴生 `.lrc` / `.jpg` 文件，新增独立「我的下载」页面与可恢复的下载队列。
- **歌单管理与内容屏蔽（v1.10.0 ~ v1.10.1）**：我的列表升级为歌单墙 + 详情页模式；支持「打开歌单时自动起播」；将「不喜欢」扩展为按单曲、歌手、歌名关键词的内容屏蔽规则并支持一键「屏蔽该歌手」。
- **自定义源来源管理（v1.10.2）**：在线导入源自动记录来源地址，支持复制源地址、查看详情及「重新拉取此源」原地覆盖（失败自动回滚上一版）。
- **播放稳定性与车机方控修复（v1.10.1 ~ v1.10.3）**：
  - 音质阶梯降级、10 分钟 URL 缓存新鲜期、12 秒取址预算与 8 秒起播超时保护；
  - 统一 2 秒自动跳歌计时器（带代际保护）、空 URL 校验、播放期报错标记与连续临时网络故障熔断；
  - 修复遇到无法播放歌曲时车载方向盘 / 蓝牙「下一首」按键失效问题（JS 元数据同步 + `dependencies-patch.js` 原生 `MediaSession` 补丁），并在「设置 → 播放设置」新增「收到停止指令时仅暂停（车机防误退）」开关（默认关闭，保留手机端划掉通知栏退出习惯）；
  - 新增持久化播放失败计数台账与歌单菜单「清理失效歌曲」预览清理功能。

详细版本变更请查看 [CHANGELOG.md](./CHANGELOG.md)。

## 说明

所用技术栈：

- React Native
- Redux

已支持的平台：

- Android 5 及以上

***注：目前没有计划支持 iOS 和 HarmonyOS NEXT**。*<br>
*桌面版项目地址：<https://github.com/lyswhut/lx-music-desktop>*<br>
*LX Music 项目发展调整与新项目计划：https://github.com/lyswhut/lx-music-desktop/issues/1912*

软件变化请查看[更新日志](https://github.com/lyswhut/lx-music-mobile/blob/master/CHANGELOG.md)。

软件下载请查看 [GitHub Releases](https://github.com/lyswhut/lx-music-mobile/releases)。

使用常见问题请参阅[移动版常见问题](https://lyswhut.github.io/lx-music-doc/mobile/faq)。

目前本项目的原始发布地址只有 [**GitHub**](https://github.com/lyswhut/lx-music-mobile/releases)，其他渠道均为第三方转载发布，与本项目无关！

为了提高使用门槛，本软件内的默认设置、UI 操作不以新手友好为目标，所以使用前建议先根据你的喜好浏览调整一遍软件设置，阅读一遍[音乐播放列表机制](https://lyswhut.github.io/lx-music-doc/mobile/faq/playlist)。

### 数据同步服务

从 v1.0.0 起，我们发布了一个独立的[数据同步服务](https://github.com/lyswhut/lx-music-sync-server#readme)。如果你有服务器，可以将其部署到服务器上作为私人多端同步服务使用，详情看该项目说明。

## 贡献代码

本项目欢迎 PR，但为了 PR 能顺利合并，需要注意以下几点：

- 对于添加新功能的 PR，建议在提交 PR 前先创建 Issue 进行说明，以确认该功能是否确实需要；
- 对于修复 bug 的 PR，请提供修复前后的说明及重现方式；
- 对于其他类型的 PR，则适当附上说明。

贡献代码步骤：

1. 参照[源码使用方法](https://lyswhut.github.io/lx-music-doc/mobile/use-source-code)设置开发环境；
2. 克隆本仓库代码并切换至 `dev` 分支进行开发；
3. 提交 PR 至 `dev` 分支。

<!--
## 用户界面

<p><img width="100%" src="https://github.com/lyswhut/lx-music-mobile/blob/master/doc/images/app.png" alt="lx-music mobile UI"></p> -->

## 项目协议

本项目基于 [Apache License 2.0](https://github.com/lyswhut/lx-music-mobile/blob/master/LICENSE) 许可证发行，以下协议是对于 Apache License 2.0 的补充，如有冲突，以以下协议为准。

---

*词语约定：本协议中的“本项目”指 LX Music（洛雪音乐）移动版项目；“使用者”指签署本协议的使用者；“官方音乐平台”指对本项目内置的包括酷我、酷狗、咪咕等音乐源的官方平台统称；“版权数据”指包括但不限于图像、音频、名字等在内的他人拥有所属版权的数据。*

### 一、数据来源

1.1 本项目的各官方平台在线数据来源原理是从其公开服务器中拉取数据（与未登录状态在官方平台 APP 获取的数据相同），经过对数据简单地筛选与合并后进行展示，因此本项目不对数据的合法性、准确性负责。

1.2 本项目本身没有获取某个音频数据的能力，本项目使用的在线音频数据来源来自软件设置内“自定义源”设置所选择的“源”返回的在线链接。例如播放某首歌，本项目所做的只是将希望播放的歌曲名、艺术家等信息传递给“源”，若“源”返回了一个链接，则本项目将认为这就是该歌曲的音频数据而进行使用，至于这是不是正确的音频数据本项目无法校验其准确性，所以使用本项目的过程中可能会出现希望播放的音频与实际播放的音频不对应或者无法播放的问题。

1.3 本项目的非官方平台数据（例如“我的列表”内列表）来自使用者本地系统或者使用者连接的同步服务，本项目不对这些数据的合法性、准确性负责。

### 二、版权数据

2.1 使用本项目的过程中可能会产生版权数据。对于这些版权数据，本项目不拥有它们的所有权。为了避免侵权，使用者务必在 **24 小时内** 清除使用本项目的过程中所产生的版权数据。

### 三、音乐平台别名

3.1 本项目内的官方音乐平台别名为本项目内对官方音乐平台的一个称呼，不包含恶意。如果官方音乐平台觉得不妥，可联系本项目更改或移除。

### 四、资源使用

4.1 本项目内使用的部分包括但不限于字体、图片等资源来源于互联网。如果出现侵权可联系本项目移除。

### 五、免责声明

5.1 由于使用本项目产生的包括由于本协议或由于使用或无法使用本项目而引起的任何性质的任何直接、间接、特殊、偶然或结果性损害（包括但不限于因商誉损失、停工、计算机故障或故障引起的损害赔偿，或任何及所有其他商业损害或损失）由使用者负责。

### 六、使用限制

6.1 本项目完全免费，且开源发布于 GitHub 面向全世界人用作对技术的学习交流。本项目不对项目内的技术可能存在违反当地法律法规的行为作保证。

6.2 **禁止在违反当地法律法规的情况下使用本项目。** 对于使用者在明知或不知当地法律法规不允许的情况下使用本项目所造成的任何违法违规行为由使用者承担，本项目不承担由此造成的任何直接、间接、特殊、偶然或结果性责任。

### 七、版权保护

7.1 音乐平台不易，请尊重版权，支持正版。

### 八、非商业性质

8.1 本项目仅用于对技术可行性的探索及研究，不接受任何商业（包括但不限于广告等）合作及捐赠。

### 九、接受协议

9.1 若你使用了本项目，即代表你接受本协议。

---

若对此有疑问请 mail to: lyswhut+qq.com (请将 `+` 替换成 `@`)
