# 贡献指南

感谢你愿意帮忙完善 AlecaFrame-ZH。请先阅读 [README](README.md) 与 [维护手册](docs/维护手册.md)。

## 可以贡献什么

- **翻译修正**：错译、机翻腔、术语不统一；
- **新增词条**：新版 AlecaFrame 出现的英文界面；
- **物品名**：游戏数据缺失/错误的中文名（在 `src/build_items.py` 的 `MANUAL` / `PART_ZH` 或 `dict/` 里补）；
- **规则**：数字/日期等动态模板；
- **文档**：排障案例、使用说明。

## 词条格式

`dict/*.tsv`，一行一条，**英文<TAB>中文**，不要有空行或多余空格：

```
No preferences set	未设置偏好
```

- 英文必须与界面文本完全一致（大小写、标点、弯引号 `’` 与直引号 `'` 不同）；
- 只加在 `dict/extra-*.tsv`（UI 文案）或 `dict/fixes.tsv`（覆盖上游错误）；
- 同一英文不要重复；修改请保留原有顺序，方便 review。

## 本地构建与验证

```powershell
python src\build.py          # 合并词典 -> bin/alecaframe-zh-cn.js
```

- 输出会打印 `UI keys not found in app source: N`；新增词条后该数字应尽量不增加（说明文本匹配不上）。
- 在中文会话里运行 `Refresh-Chinese.cmd` 即可看到效果（不需要重启 Overwolf）。
- 截图可用 `verify/capture.ps1`（仅本机调试，不提交）。

## 提交前检查

- [ ] `powershell -ExecutionPolicy Bypass -File scripts\verify.ps1` 全绿（等价于 CI 检查）
- [ ] `python src/build.py` 成功
- [ ] 词条 TSV 每行都有 Tab
- [ ] 没有提交 `bin/alecaframe-zh-cn.js`、`state/`、`logs/`、`dist/`、`backup/`
- [ ] `bin/AlecaFrame-ZH.ps1` 若被修改，保持 **UTF-8 with BOM**（中文提示需要）
- [ ] PR 描述里说明：改了什么、对应哪个界面、如何验证

## 版本与发布

- 所有改动先在 `dev`（或 `feature/*`）分支上做，验证通过后再合入 `main`；
  完整流程见 [分支与发布流程](docs/分支与发布流程.md)；
- 版本号在 `VERSION`，更新记录在 `CHANGELOG.md`；
- 维护者打 tag（如 `v1.0.1`）并推送后，GitHub Actions 会自动构建并发布 zip 到 Releases。
