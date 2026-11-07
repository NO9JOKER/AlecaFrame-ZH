# 贡献流程（fork PR）

> 适用于外部贡献者。项目由维护者手动合并 PR。
> 当前项目正在按新架构实现；命令/工具以仓库实际存在的为准，目标路径见 [task-router.md](task-router.md)。

## 0. 前置

- Windows（launcher 真机验证需要）+ Python 3 + Node.js + PowerShell 5.1。
- 读 [AGENTS.md](../../AGENTS.md)、[task-router.md](task-router.md)、[evidence.md](evidence.md)。
- 不需要 OCR 便携依赖，除非任务涉及 OCR；OCR 只允许改边界/路径，逻辑变更另立项目。

## 1. Fork 与分支

1. 在 GitHub fork 仓库到自己的账号。
2. 克隆 fork，添加上游：

```powershell
git clone https://github.com/<your-name>/AlecaFrame-ZH.git
cd AlecaFrame-ZH
git remote add upstream https://github.com/NO9JOKER/AlecaFrame-ZH.git
git fetch upstream
git switch -c feature/<scope> upstream/main
```

3. 一个分支只做一个主题；分支名与 commit scope 一致。

## 2. 本地检查

以下为目标命令（工具实现后）；工具尚未落地时，使用仓库实际存在的等价脚本，并在 PR 中记录实际命令。

```powershell
python tools\build.py
powershell -ExecutionPolicy Bypass -File tools\verify.ps1
node tests\search.test.mjs
```

- `verify` 必须退出码 0；改文档可跳过构建，但改词典/代码必须完整跑。
- 生成物不要提交。
- 若某命令/工具尚未落地，在 PR 中说明实际运行的等价命令，不要伪造输出。

## 3. 真机验证（按 Tier）

| Tier | 开发者必须做 |
|---|---|
| T0 | 改词典/文档：构建 + `Refresh-Chinese.cmd`，截图受影响界面；改文档无需真机 |
| T1 | 改引擎/规则/搜索：现有搜索/规则测试全过（数量以测试输出为准）、规则 golden、受影响界面前后截图、日志 `[AlecaFrame-ZH] loaded translated=...` |
| T2 | 改 launcher/注入/OCR/CI：完整 `Start / Restore / Refresh / Toggle / Status`，保存日志、截图、bundle hash；验证回滚 |

具体证据字段见 [evidence.md](evidence.md)。没有真机证据的 T1/T2 PR 不进入合并讨论。

## 4. 提交

```powershell
git add -A
git commit -m "fix(search): 中文查询在 X 场景失效"
git push origin feature/<scope>
```

- 提交信息风格：`feat|fix|refactor|docs|test|chore(scope): 中文描述`（`refactor` 是常规提交类型）。
- 不要 `git add -f` 生成物；不要提交 `.tools/`、`state/`、`logs/`。
- 新提交会触发重新审核；已审过的 head 变了要重新审。

## 5. 开 PR

- 目标分支：`main`。
- 使用 [.github/PULL_REQUEST_TEMPLATE.md](../../.github/PULL_REQUEST_TEMPLATE.md)。
- 写清：改了什么、为什么、Tier、影响模块/页面、行为是否变化、证据、未验证项、回滚方式。
- 由维护者手动合并；贡献者不要自行合并。

## 6. 复核与合并

- 维护者的复核 AI 会从 PR head 复核；可能要求补证据或拆分 PR。
- 维护者合并后，由维护者打 tag/发版（或等到下次发版）。
- 合并后删除自己的 feature 分支。
