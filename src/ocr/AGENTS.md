# src/ocr/AGENTS.md — OCR 子系统边界

> 就近规则：在 `src/ocr/` 下工作的 AI 先读根 [AGENTS.md](../../AGENTS.md)，再读本文件。
> Tier：T2（路径/manifest 变更）；逻辑改动另立项目/ADR。命令是目标接口；工具未落地时以仓库实际文件为准，不要执行不存在的路径。

## 1. 职责

- 可选 OCR 子系统：遗物/裂罅识别、奖励回退、杜卡特/叠加层/推荐/库存辅助；本地 HTTP 服务 + 页面脚本 + Python/Paddle worker。
- 不负责：主翻译/搜索链路（`src/runtime`）、启动器主流程（`src/launcher`）——launcher 只按 manifest 启停/复制/注入。

## 2. 目标结构

```text
src/ocr/
  manifest.json          # 唯一注册表：页面脚本、server、worker、端口、全局名、生成物
  README.md              # 职责/边界/契约/扩展方式
  CONTRACT.md            # 与 MIOEU 的硬契约
  page-scripts/
    background/
    main/
    relicOverlay/
    relicRecommendation/
    rivenOverlay/
  server/
    relic-ocr-server.js
  worker/
    relic-ocr-worker.ps1
    capture-warframe-screen.ps1
    paddle-reward-worker.py
  host-patches/
    relic-reward-fallback.js
bin/ocr/
  afzh-items.js          # 构建生成，gitignore
  .tools/                # 便携 Python/Node/Paddle 缓存，gitignore
```

- 部署后的脚本名/flat 路径保持 `assets/js/afzh-*.js`；不要改注入契约。
- 页面 id 与 `pages.json` 对齐；manifest 中的页面必须存在。
- `.tools/` 与 `afzh-items.js` 属于运行时资产，不放进 `src/ocr/`。

## 3. 硬契约（不可改）

- 端口 `127.0.0.1:38147`；HTTP endpoint 与 `CONTRACT.md` 一致。
- 全局名：`__ALECAFRAME_ZH_CN_ITEMS__` 等与 MIOEU 兼容的名字；清单见 `CONTRACT.md`。
- 页面脚本与页面映射以 `manifest.json` 为准；不要依赖文档里的数量。不要重命名部署文件名。
- 官方文件补丁点：`relicOverlay/main.js` 奖励回退、`rivenOverlay.html` 的 `:key`；必须可还原。
- launcher 只通过 `manifest.json` 读取清单；不要再新增第二份 OCR 脚本/页面清单。

## 4. 允许 / 不允许

允许：
- 调整 `src/ocr/` 内部目录与 manifest；
- 更新 server/worker 内部相对路径、launcher 读取路径、docs/package/verify 路径；
- 补 README/CONTRACT/页面卡与合成注入测试；
- 修复因路径调整导致的问题（不改变行为）。

不允许：
- 重写 OCR 算法、识别流程、协议、endpoint、全局名；
- 改页面脚本的业务逻辑；
- 改官方文件补丁内容；
- 把 OCR 逻辑合并进 runtime/launcher；
- 在没有 OCR 冒烟的情况下宣称 OCR 已验证。

## 5. 验证

静态：

```powershell
node --check src\ocr\server\relic-ocr-server.js
# 所有页面脚本 / worker 同理
powershell -ExecutionPolicy Bypass -File tools\verify.ps1
```

合成：

```powershell
powershell -ExecutionPolicy Bypass -File tools\test-inject.ps1
```

- 断言 manifest 中每个页面脚本都能复制到合成页面树并注入。
- 启动 server（不加载 Paddle 模型）确认能读 `bin/ocr/afzh-items.js`、监听 38147；随后停止。
- 真实 OCR：如果本机有 `.tools/` 与游戏环境，按 `CONTRACT.md` 跑一次遗物/叠加层；否则在 PR 证据里写“实际识别未验证”。

## 6. OCR 逻辑演进

- 先写新 ADR（边界/协议/目标），再动逻辑；不要夹带在边界/路径 PR 里。
- 任何协议/端口/全局名变更必须先改 `CONTRACT.md`、manifest、launcher、所有调用方，并在同一 PR 里升级所有调用方；不允许无方案直接改名。
- 页面脚本按页面分目录是允许的；不要把 OCR 的按页面组织方式推广到主翻译/搜索链路。
