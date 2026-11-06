# Changelog

## v1.1.0 (2026-11-07)

第二个开源整理版本：并入 MIOEU 的**中文搜索**与**中文 OCR**，并用两个上游项目做词库查漏补缺。

### 新增

- **中文搜索**（`src/search.js`，移植自 MIOEU 并适配 AlecaFrame 3.0.6）
  - 仓库 `#inventorySearch`、铸造厂 `#foundrySearch`、遗物规划器 `#relicPlannerSearch`
  - WFM 订单/合同列表、已揭示裂罅列表、裂罅查找器武器搜索
  - 市场搜索框：中文输入 -> 反向索引换英文查询；建议列表显示中文
  - 3.0.6 适配：插件级钩子安装在 `background.html`（插件实例所在窗口），应用级钩子安装在 `main.html`
  - 纯函数测试 `tests/search.test.mjs`（40 项）
- **可选中文 OCR**（`bin/ocr/`，移植自 MIOEU）：中文界面下的遗物推荐、遗物奖励、裂罅识别
  - `安装OCR前置组件.cmd` 在 `bin/ocr/.tools` 内安装便携 Python/Node/PaddleOCR 与中文模型
  - `启用中文遗物OCR.cmd` / `关闭中文遗物OCR.cmd`；状态文件 `AlecaFrame-ZH.settings.json`
  - 本地服务 `127.0.0.1:38147`，协议与 MIOEU 保持一致
  - 未安装前置时自动降级：界面汉化与中文搜索照常工作
- **词库查漏补缺**
  - `dict/mioeu-terms.tsv`：吸收 MIOEU 术语库 8,195 条中的缺口部分（3,276 条，冲突保留本项目译名）
  - `src/scan_missing.py`：扫描本机 AlecaFrame 源码，导出未翻译界面文本
  - `dict/extra-8.tsv`：按扫描结果补齐 1,113 条界面文案，未覆盖候选从 1,136 降到 25
  - 合并词库从 20,757 条增加到 **25,145 条**
- **启动器**
  - 新动作：`OcrOn` / `OcrOff` / `InstallOcr`
  - 还原范围扩展到 OCR 改写的 `web/assets/js/relicOverlay/main.js`
  - 无 `app.opk` 缓存时可用「当前官方文件」自动建立快照（并校验未被汉化过）
  - `Status` 显示 OCR 开关 / 前置 / 服务状态
- **工程**
  - `scripts/test-inject.ps1`：在临时副本上回归注入/还原（含真实安装锚点只读检查）
  - CI：构建校验 + JS 语法检查 + 搜索单元测试

### 修复

- 构建校验不再把「本项目自己注入的脚本」算作词条已存在（此前会掩盖缺口）
- 校验时还原源码里的 `\'` / `\"` 转义，减少假阴性

### 已知限制

- `build-unmatched.txt` 里仍有约 405 条词条在 3.0.6 源码中找不到字面量，主要是上游 2.x 时代的淘汰文案（无害，不会命中）
- 中文搜索时库存/遗物汇总数字仍是「清空搜索后」口径（与 MIOEU 一致）
- OCR 对官方脚本有两处原位补丁，升级 AlecaFrame 后需先跑 `scripts\test-inject.ps1`

## v1.0.0 (2026-11-06)

首个开源整理版本。

- 启动器：中文启动 / 恢复英文 / 会话内切换 / 刷新词库 / 状态查看 / 桌面快捷方式
- 运行时翻译层：DOM 精确匹配 + MutationObserver 动态补翻 + 数字/日期/数量模板规则
- UI 词库：上游 1,104 条 + 人工补充/修正约 900 条
- 物品名：从 AlecaFrame 本地游戏数据生成 18,778 条（武器 / MOD / 赋能 / 资源 / 遗物 / Prime 部件；战甲名保留英文）
- 合并后词库总计 20,757 条
- 文档：README、维护手册、可行性评估
- CI：push/PR 构建校验；`v*` tag 自动打包发布
