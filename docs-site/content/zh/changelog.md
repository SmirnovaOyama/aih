---
title: 更新日志
description: AIH 版本更新日志 —— 0.8.x / 0.7.x / 0.6.x / 0.5.x 的主要变更。
---

# 更新日志

完整逐条记录见仓库 [`CHANGELOG.md`](https://github.com/summit4you/aih/blob/main/CHANGELOG.md)（Keep a Changelog 格式，SemVer 版本）。本页为各版本要点摘要。

## 0.8.14（2026-09-20）

**新增**

- **`webfetch` / `websearch` 支持 SOCKS5 代理** — 出站网络工具可经 SOCKS5 隧道转发；`aih.json` 加 `{"proxy": {"socks5": "127.0.0.1:1080"}}`（可选 `username`/`password`/`timeoutMs`），或 `AIH_SOCKS5_PROXY=host:port` 覆盖。基于 undici 官方 `Socks5ProxyAgent`（纯 JS、无原生依赖），处理 CONNECT 握手、可选鉴权与 HTTPS 的 TLS 包裹，离线包也能正常携带；未配置时走直连，行为不变。

**变更**

- **辅助 LLM 调用统一在适配层走流式** — goal judge、`best_of_n`、MEA guardian/auditor、dream/title/branch 蒸馏、压缩摘要等绕过主循环流式的旁路调用，此前发 `stream:false` 被只接受流式的网关拒绝（403）；现由适配层统一决定流式，每条旁路都覆盖，最终文本仍完整拼装，调用方无感知。
- **离线包默认配置改为"净版"** — 打包默认配置不再携带任何 provider / 模型 / 代理，安装后由用户自行配置端点（`aih connect` / `aih config` / `aih.json`）；构建机本地的 `aih.json`（provider、模型、代理、内网端点）被剥离而非合并，杜绝机器本地信息泄漏进安装包。
- **全新安装启动引导** — 未配置任何 provider 时，`aih run` / `aih chat` 不再报晦涩的"no API key"/"no model id"，而是引导用户 `aih connect`（浏览目录）或在 `aih.json` 加 provider；自托管 / 免 key 端点无需密钥，`--mock` 可离线演示。

**文档**

- **0.8.13 发布页宽度修复** — 内容列此前被限宽 840px 且左对齐，在约 1200px 的内容区里右侧留一大片空白；现加宽阅读列并居中，桌面端正常利用宽度，移动端仍响应式。

## 0.8.13（2026-09-18）

**修复**

- **跨会话 todo 残留** — 右栏 todo 列表通过项目级 `.aih/todos.json` 从上一个会话泄漏；全新会话现在从空白开始（`--session`/`-c` 恢复与会话内 `/restore` 回滚仍保留列表）。
- **重绘后右栏文字 padding 走位** — ▶/⚙/↩ 在 zh_CN CJK 字体下是 1 格，标准 string-width 却算 2；宽度模型已修正（`❓` 保持 2——真 emoji），todo 行首用固定 2 列前缀，所有状态与换行续行对齐。
- **最小化→最大化后 UI 冻结数秒** — 窗口动画的 resize burst 合并为一次终态重绘（debounce 16ms → 160ms；此前每个中间尺寸都付一次全量冷渲染）。
- **最小/最大化后历史消息不停在最后一条** — 钉底视图在 rows/cols 刷新后重新跟随；放大窗口后最后一条消息稳定停在末行。
- **最小化→最大化后右栏背景向左扩** — 整帧保持最后一列不写（DECAWM 行尾挂起防护），边缘列漂移不再吃掉侧栏间隔。
- **行首无法输入 `?`** — 帮助弹窗关闭时把 `?` 回填进输入框（`/help` 与 palette 不受影响）。

## 0.8.12（2026-09-17）

**修复**

- **最终步 steering 输入被吞**：模型即将结束回合时排队的 steering 会被静默丢弃；final-step drain 现在把挂起的 steering 追加进日志并多跑一步。
- **压缩失败曾是静默 no-op**：空摘要让上下文继续膨胀且无诊断；现在输出带 `turn=` / `trigger=auto` 上下文的 stderr 行，摘要模板还逐字保留用户授权状态。

**变更**

- **模型选择器 MRU**：最近用过的 provider/模型浮到 `/model` 选择器顶部（去重，其余保持配置序）。
- **Steering 召回（Alt+Up）**：把最近一条未消费的 steering 拉回编辑器重发；Ctrl+R 副键回退；question UX 钉底 + 滚动 + 可退出的自由输入模式。

## 0.8.11（2026-09-15）

**修复**

- **question options 在 TUI 边界被静默丢弃**：agent 接线只给 `ask` 回调传了 `(q)`，LLM 提供的 `options` 到不了 `Tui.askQuestion`，选项列表退化回纯自由文本输入（冒烟套件直接调 `Tui.askQuestion` 绕过了回调，所以保持绿色）。接线现转发 `(q, options)`，非 TTY stdin 回退也渲染选项行。

## 0.8.10（2026-09-15）

**修复**

- **压缩被缩水的 provider prompt_tokens 饿死**：模型切换后 provider 上报的 token 计数缩水，旧判据误判"上下文不紧张"而跳过压缩；`agent-loop.ts` 改用本地估算交叉校验，压缩不再被错误跳过。

## 0.8.9（2026-09-15）

**修复**

- **TUI 键盘：connect provider 二级菜单 Esc 后 Enter 死锁**：一级菜单 Esc 后焦点状态与 Enter 默认动作错位，导致按 Enter 卡死；状态重置修复。
- **`aih update` 升级后用户配置丢失**：`applyUpdate` 合并配置时只认新包配置，覆盖了用户层配置；改为保留用户配置层。

## 0.8.8（2026-09-14）

**修复**

- **`aih update` 在 Windows offline 安装上失败（`EPERM: unlink node.exe`）**：offline 安装部署便携 Node.js（`app\.node\...\node.exe`），运行的 AIH 进程就是该 exe；旧的整体改名交换（app → .bak、new → app）试图删除/改名**正在运行**的可执行文件——Windows 禁止，故应用更新中止。检测到 `app\.node\` 时 `applyUpdate` 走**copy-over** 路径：把新负载（aih、lib/、node_modules/、package.json）复制覆盖旧 app 目录，`.node\` 完全不动，不再重命名正在运行的 exe。普通 tarball 安装保持原原子改名交换。

## 0.8.7（2026-09-14）

**修复**

- **TUI 输入历史浏览误触发滚轮恢复**：快速连按 ↑ 翻历史时视图被误判为滚动浏览而顶回底部；区分"输入历史浏览"与"任务输出滚动"的 pinned 状态修复。

## 0.8.6（2026-09-14）

**安全**

- **MCP 参数校验加固**：注册前校验 action 参数 schema，非法参数拒绝注册。
- **Readonly 模式执行面加固**：屏蔽 `date -s`/`--set` 等可写旗标，只读 shell 不可被绕过执行写操作。
- **环境变量脱敏扩充**：SECRET_HINT 正则加入更多密钥形态，防止泄漏。
- **jobs.json 读-改-写竞态**：spawn/finish/cancel 并发时任务板状态丢失；改为原子更新。

**修复**

- **MCP 工具调用超时**：per-call 120s 超时，防挂死。
- **MCP 错误序列化崩溃**：textResult JSON replacer 处理 circular ref/bigint/function。
- **jobs.json 非原子写**：saveBoard 改 temp+rename 原子发布。
- **更新暂存目录冲突**：staging 目录加 PID+随机后缀，防并发冲突。
- **管道 stdin 无上限**：`aih run <` 输入 10 MiB 上限，超限报错。
- **@aih/core 依赖版本错位**：cli 依赖 core 0.2.0 → 0.7.2 修正。

## 0.8.5（2026-09-13）

**修复**

- **后台 agent 环境变量泄漏（安全）**：jobs/teams 后台任务继承宿主完整环境，含密钥；改为构建受控环境。
- **readonly-allow 漏 find 写旗标**：`find` 的 `-delete`/`-exec` 等写旗标未列入只读放行检查，补全。

## 0.8.4（2026-09-13）

**修复**

- **发布供应链完整性（安全）**：打包/安装脚本加固，防发布物被篡改。
- **offline 打包凭据泄漏（安全）**：合并配置时本地 provider 密钥混入打包产物；改为只带空配置。
- **todo store 非原子写导致数据丢失**：`mcp-server/src/app-adapter.ts` 改 temp+rename 原子写。
- **第三方 MCP 工具默认放行（安全）**：未声明权限的第三方工具改为默认 deny，避免静默放行。
- **webfetch HTML 实体越界**：`&#(\d+);` 超过 Unicode 范围崩溃；钳制修复。
- **smoke 凭据形状断言恒真修复**：断言形态修正，不再恒真。

## 0.8.3（2026-09-13）

**修复**

- **`aih workflow list` 不再执行工作流代码（安全）**：列表命令误 import 工作流模块导致执行副作用；改为纯元数据读取。
- **MCP server 子进程环境变量脱敏（凭据泄漏面）**：MCP 子进程继承父进程含密钥的环境；改为受控环境透传。

## 0.8.2（2026-09-13）

**修复**

- **权限门路径穿越（安全，R3 P1）**：`RulesetGate.evaluate/explain` 对路径参数未做规范化，`..` 可绕过 deny 规则；补路径规范化与匹配。
- **非 TTY ask 挂死（R3 P2）**：`SessionGate` 无 TUI 时 ask 回退到 readline，不再无限等待。
- **并发 ask 槽位竞争（turn 悬挂，R5 P1）**：两个 `permission="ask"` 工具并发时 TUI 只渲染一个槽位，另一个永久悬挂；补并发队列。
- **/model 切换瞬间上下文闪 6k（面板口径不一致）**：`applyModel` 换模型后上下文估算口径与面板不一致，闪一下 6k；统一口径。

## 0.8.1（2026-09-10）

**新增**

- **自更新支持 GitHub 国内镜像（离线/GitHub 不可达时下载更新包）**：`cli/src/update.ts` 支持镜像源回退，国内用户可正常更新。
- **同版本 release 重传检测**：`--clobber` 刷新 release 后也能触发更新（同版本 sha 变化视为新包）。

**修复**

- **TUI 输入后延迟数秒才出现消息与 loading 转圈**：session-log 写入阻塞 UI 渲染；异步化修复。
- **Windows 上 `aih update` 解压失败**：`.bin\node-which` 解压路径非法；打包脚本修正。
- **TUI 面板 todo 在压缩/全完成后消失**：压缩后保留 todo 面板状态。
- **浏览历史时按 End 无法回到底部**：VT 终端序列 `ESC[4~` 未处理；补键位。
- **任务执行中滚动浏览历史被新消息顶回底部**：缺 pinned 状态，`#follow()` 无条件钉底；补 pinned。
- **26 字母中只有 `o`/`O` 在空输入框无法输入**：toggle 快捷键与字母冲突；空输入框时按键优先给文本。
- **重启后首次输入 `o`/`O` 被吞**：DSR probe chunk 丢弃竞态；probe 响应不再吞首字符。

## 0.8.0（2026-09-07）

**新增**

- **网络失败弹性（turn 级 park-and-retry）**：流中 `finish_reason: network_error` / 连接中断时 park 该 turn，后续重试不丢上下文。
- **hook 故障隔离**：工具注册表与权限缝中的 hook 抛错不再拖垮主流程，单 hook 故障隔离。
- **凭据存储边界净化**：`sanitizeCredential` 确保密钥只落在凭据槽，不入核心状态。
- **技能可见性分层**：frontmatter `visibility:` 支持，技能可按可见性分级。
- **edit 自动修复 + 受保护区**：edit 失败自动重试小步修改；受保护区（如凭据文件）不可 edit。
- **prompt-cache 分桶统计**：按窗口分桶统计缓存命中，量化前缀稳定收益。
- **可逆 secret 占位符**：secret 在工具输出中以可逆占位符隐藏，防泄漏且不破坏回放。
- **只读 shell 防御性否决**：`readOnlyBash` 直接把写命令否决在权限缝。
- **分支蒸馏**：checkRestoreSafety 防止分支切换覆盖未合并工作。
- **Doom-loop 升级观测器 + 重复调用止损**：检测重复工具调用循环并升级为 escalate。

## 0.7.2（2026-09-06）

**新增**

- **`read_file` 双预算 + 四态截断**：行数 + 字节双预算，截断保留头尾并打 elided 标记。
- **compaction 文件改动清单（file manifest）**：压缩时记录本次会话改动的文件清单，压缩后保留上下文线索。
- **只读 bash 护栏 + guarded 写工具**：只读模式细分"纯读"与"guarded 写"（有界写允许），path-scoped 兄弟工具断言对齐。

**变更**

- `core/src/smoke.ts`：path-scoped 兄弟写工具断言对齐 KL-R#4 guarded 语义。

**修复**

- **TUI 显示修复**（对齐 opencode / mimo-code）：Linux 光标、block-char 用量条、meta 行折叠等显示问题。

## 0.7.1（2026-09-06）

**变更**

- **Windows/PowerShell TUI 显示修复**（对齐 opencode / mimo-coder）：conhost 下键盘展开、边距、ASCII 用量条、UTF-8 codepage 兼容。

## 0.7.0（2026-09-06）

**新增**

- **流内 `finish_reason: network_error` 重试**（opencode v1.18.20 对齐）：网络错误不在中途丢弃响应，自动重试同 turn。
- **prompt-cache 前缀稳定性**：系统提示新增前缀稳定性纪律段；易变内容后置，避免破坏缓存前缀。
- **remember 超预算显式警告**：memory.md 写入超 `AIH_MEMORY_BUDGET` 时显式警告而非静默截断。
- **upstream-review 技能 hard gate**：上游机制断言必须本机源码实读 + `file:line` 引用，失据降级为"未验证（线索）"。
- **MCP add_todo 批量形式**：`items` 数组（1–50）一次调用新增多条，避免 re-planning。
- **Windows 兼容（mimo-code 对齐）**：run_cmd/sandbox 在 win32 解析执行 shell，跨平台一致。
- **冒烟 suite 挂起修复**：live tsserver 子进程 spawn 后从不关闭导致的挂起；补关闭。

## 0.6.0（2026-09-05）

**新增**

- **MEA 独立判定层（LH#1 + CX-R#1 合并实施，roadmap 最高优先级项）**：Manager/Executor/Auditor 三角色循环 + verified-state ledger——executor 的行动由独立 auditor 校验后再入账，模型自述不算证据，从机制上避免"自跑自判"。
- **Textual-grant bridge（`permissions` 工具）**：用户在对话里明确授权（"直接写"/"不用确认"）时，agent 通过 `permissions` 工具把它转成真实权限规则，对话授权不再只是一句空话。
- **CL-R#3 拒绝双段消息（cline 同构）**：所有权限拒绝 error 统一追加 REJECTION_SUFFIX，模型不再误判拒绝为可重试。
- **KL-R#3 子代理权限传播**：`RulesetGate.subagentGate()`——父 deny 规则传播到子代理，子代理不能越权。
- **RulesetGate.explain()**：返回最高优先级 winning rule，SessionGate deny 时透出原因。

**变更**

- **OMP-R#1+OCL-R#4 重试升级**：`retryAfterHintFromHeaders()` 多源 hint 解析合并，重试策略更稳。
- **OMP-R#7 memory 截断 marker**：fitBudget 截断时尾部附可行动提示。
- **OMP-R#10 replay-policy**：deriveMessages 过滤 turn/end stopReason 含弃权语义的消息。
- **kl-R#5 截断 recovery 消息**：截断后的续跑指令升级，恢复更稳。
- **TUI footer hint 模式感知**：run-or-copy 确认（[R]un [C]opy [N]o）时底部提示同步。

## 0.5.0（2026-09-02）

**新增**

- **Provider 目录 + `/connect` 交互式接入（对齐 opencode `/connect`，仅 OpenAI 兼容）**——`connectCatalog()` 精选 OpenAI 兼容 provider（热门优先，native-SDK 的 Anthropic/Google 排除）；TUI `/connect` 与 `aih connect [<id>]` 引导选择 provider → 输入 API key（写入 env 文件 chmod 600，**绝不落 aih.json**）→ `saveProvider()` 存入配置（`apiKeyEnv` 命名环境变量，密钥本身不入库）→ 立即应用模型。未配置的 provider 以 "+ connect" 条目出现在 `/model` 选择器底部。
- **双语文档站教程扩展（第 3 批 + 第 19 章 HemaGuide 案例）**、**规则加载（opencode `rules` 对齐）**、**Provider 策略（`policies`）**、**可配置按键（`keybinds`）**、**凭据所有者隔离（OC#7）**、**live-verify / check-existing-first 纪律（OC#3）**、**core 每调用税治理（OC#2）**、**信任模型声明（OC#4）**、**`aih doctor --fix` 配置自愈（OC#5）**、**成熟度记分卡（OC#6）**、**BuffBench 式质量评估 + 基线回归门（FB#4）**。

**修复**

- **模型选择器滚动高亮错位（"选的和显示的不一定"）**：`/model` / ctrl-p 选择器用窗口内循环索引对比全局选中索引，列表超过可见行滚动后高亮与实际选中项漂移；抽取 `paletteWindow()` 返回窗口内高亮位置修齐。
- **切换模型后幻影"上下文爆满/需要压缩"**：免费网关（opencode zen go）报告**累计** `prompt_tokens`（~78K 会话实测 949K / 3.2M）；旧判据 `prompt_tokens ≤ 2×窗口` 在窗口涨到 1M（deepseek-v4-flash）后放行垃圾值，切 big-pickle(200k) → deepseek-v4-flash(1M) 误报"949K ≥ 800K 需压缩"。可信度现在双向对照本地 chars÷4 估算——报告≫估算=累计垃圾（估算胜）、估算≫报告=样本过期（估算胜）。`agent-loop.ts` 与 `cost.ts` 同步修复。

## 0.4.0（2026-08-29）

**新增**

- **安全缝（PE#1 / PE#2 / PE#4）**——让 harness 强制，而非模型自律。**PE#2 预算**：`maxCostUsd` / `maxWrites` / `timeoutMs` / `denyPaths` 硬边界越界即 `escalate` 停轮；软熔断（任务成本 ≥ 2× 会话均值）提示一次不阻断（`AIH_BUDGET` 或 `safety.budget`）。**PE#1 传感器**：写后跑声明的检查（`AIH_SENSORS`），红→有界重试→升级；传感器子进程不继承密钥。**PE#4 escalate**：模型不可见的 `escalate` 事件（`reason` + `options` + `safestDefault`）；非交互 `run` **退出码 3**，TUI 渲染选项。**`test/recovery.sh`**：崩溃→续跑 park 住该工具（结果未知）且不重复派发。
- **Intelligent Terminal UX（IT#1–IT#5）**——**IT#1** `shell_context` 工具 + `/shell` + `AIH_SHELL_CONTEXT=auto`；**IT#2** 确定性失败检测 + 红色 `⚠ N failed` 徽标 + `/fix`；**IT#3** `?` 前缀起 agent 任务并自动注入 shell 上下文；**IT#4** `/sessions` 面板（dashboard / `kill <id>` / `view <name>`）；**IT#5** 写命令 run-or-copy 批准 `[R]un / [C]opy / [N]o`。
- **`aih measure` 距离尺（PR#2）**——`distance` / `stream`（seeded 置换检验）/ `crystallize`；纯函数，`--json` 出。
- **`aih session rm --all`**——真实 `-a/--all` 标志清空全部已存会话。
- **配额自动续跑（CC#51）**、**只读自动放行（CC#54）**、**凭据作用域（CC#59）**、**BOM 容错（CC#55）**、**MCP 空 schema（CC#56）**、**`/usage` 逐循环明细（CC#57）**、**TUI 截断（CC#58）**、**注入源隔离（CC#60）**、**question 工具**、**双语文档站 + GitHub Pages**、**harness 记分卡（PE#3）**、**`escalate` 事件（PE#4 基建）**。

**修复**

- **工具输出预算标记（FA#2）**：旧的晦涩截断标记不再让模型盲目循环——现在会提示它停止重复发工具、就已有内容收尾。
- **语言规则覆盖进度说明**：所有面向用户的文本（最终回答*与*任务中途的进度说明）都跟随用户语言。
- **斜杠命令解析**、**子代理部分结果（CC#50）**、**`load_skill` 去重（CC#52）**、**写工具权限 ask（CC#53）**。

## 0.3.0（2026-08-26）

**新增**

- **逐事件会话持久化**：`chat` 现在在事件发生时即追加落盘（带字节水位增量 flush），长多工具轮次在崩溃/被杀后不再只活在内存里
- **扩展 API（P#39）**：`.aih/extensions/*.mjs` 模块——`registerTool`、`registerCommand`、`on("tool:before" | "tool:after" | "turn:end")` 处理器，可取消调用或就地改写结果；`--no-extensions` 关闭加载，受项目信任门约束
- **会话树（P#37）**：事件携带可选父链接；`aih session tree` 渲染分支结构，TUI `/tree` 导航，可从任意历史点分叉
- **转向 + 后续队列（P#35）**：忙碌中输入不再排队等待，而是在工具批次之间中途落地；后续队列在自然停止点排空
- **项目信任门（P#40）**：仓库提供的扩展/技能/配置在目录被信任前保持休眠；决策按路径持久化到用户目录；`--trust` / `--no-trust` 一次性覆盖
- **Eval 框架一期（P#46）**：Experiment → Cells → Attempts → Results 数据模型，用固定任务集度量 harness 变更
- **上下文修剪 + 惰性归档（MK#43）**：超大的旧工具结果每次会话启动修剪一次，可经 `archive_read` 逐字取回
- **压缩覆盖摘要（MK#42）**：摘要戳明它替换了什么
- **用户级记忆 + 后台任务 + 记忆整理**：`remember` 支持 `scope: project|user`；`/bg <prompt>` 派发隔离后台轮次；`aih tidy` / `aih distill` 去重记忆并挖掘重复流程
- **BM25 技能相关性 + 流式 TPS**：已装技能按用户查询排序并自动浮现；逐请求流式吞吐显示在 `/usage`、`aih stats` 与 TUI 上下文面板
- **技能驱动的钩子配置（D#11）**：技能 front matter 可声明 `secretPatterns`，内置脱敏钩子额外屏蔽
- **Agent Teams（最小）（D#15）**：`aih team` 管理名册、任务板、每代理邮箱
- **`/find` 工具输出检索（T#22）**：跨所有工具输出检索，命中展开并滚动到首个命中

**修复**

- **上下文面板真实性**：免费网关报告的累计/垃圾 `prompt_tokens` 不再进入显示——用量样本窗口化、压缩作为硬溯源边界、过期样本回退本地估算
- **CJK 感知的 token 估算**：扁平 chars÷4 对中文+JSON 会话少估约 3×，已修正

## 0.2.0

**新增**

- **Codex 风格加固**：子进程 env 策略剔除密钥类变量（`KEY`/`TOKEN`/`SECRET`/`PASSWORD`、`AIH_*API*`）；`--debug-prompt` 打印每次 LLM 调用的模型可见消息；技能名册在 ~2% 上下文预算内注入系统提示
- **多模型目录**：provider 可声明 `models[]`；`ctrl-p` 与 `/model` 运行时切换已验证模型
- **实时上下文窗口探测 + 主动/被动/手动压缩**：保留逐字最近尾部 + 滚动摘要（`compactNow()`、`/compact`）；用户查询不变量保证压缩后严格聊天模板仍可用
- **TUI 设计走查**（拆分/统一布局、粘贴修复）与更丰富的会话内省

## 0.1.0

**新增**

- 初始 harness：`AgentLoop` 步引擎（max-steps 交接预填）、`SessionLog` append-only JSONL 持久化 + 分叉/回放、`ToolRegistry`、`PolicyGate` / `RulesetGate` 审批流、路径作用域写审批、plan/只读模式
- MCP server 暴露应用 context/actions；CLI 入口（`run` / `chat` / `tools` / `describe` / `sessions`）、内置 todo-app 示例、OpenAI 兼容适配器（SSE 流式 + 429/5xx 重试）
- 契约文档（`APP.md`、`harness.yml`）与门禁：`doctor`、`check`、冒烟测试、完整 `eval`
