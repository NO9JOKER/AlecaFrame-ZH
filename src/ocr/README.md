# OCR 子系统

## 职责

可选的中文 OCR 增强：遗物奖励、裂罅卡片、叠加层中文渲染。启动器只负责按 `src/ocr/manifest.json` 复制/注入/启停；识别逻辑不在这里改写。

## 目录

```text
src/ocr/
  manifest.json        # 唯一 OCR 清单：server / page-scripts / globals / 前置
  README.md
  CONTRACT.md          # 端口、全局名、部署名等硬契约
  page-scripts/<page>/ # 页面脚本源码（按页面组织仅限 OCR）
  server/              # 本地 OCR HTTP server
  worker/              # 截图/识别 worker 与前置脚本
```

构建会把页面脚本**平铺**复制到 `bin/ocr/<deployName>`，部署名仍是 `afzh-*.js`；页面通过 `pages.json` 的 `ocrScripts` 注入。`bin/ocr/.tools/` 与 `bin/ocr/afzh-items.js` 是运行期/生成物，不进源码。

## 修改规则

- 页面脚本只改路径/适配，不改 OCR 协议、端口、全局名；
- 新增/移动脚本必须同时改 `manifest.json`、对应页面 `pages.json`、构建同步与文档；
- 识别逻辑变更另立项目/ADR，不在本目录做；
- 真机 OCR 需要 Node/Python/PaddleOCR 前置；没有前置时记录“未验证”，不要伪造成功。

## 验证

```powershell
python tools\check_contracts.py
python tools\build.py
python tools\package.py --version 1.2.0-dev --name AlecaFrame-ZH-1.2.0-dev --out ..
```

构建后检查 `bin/ocr/` 是否包含 manifest 中全部 `deployName`，以及 `bin/ocr/afzh-items.js`。

## 关联

- [CONTRACT.md](CONTRACT.md)
- [src/ocr/AGENTS.md](AGENTS.md)
- [pages.json](../../pages.json)
