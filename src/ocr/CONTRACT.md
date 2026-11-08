# OCR 硬契约

以下内容与启动器、宿主页面、OCR worker 共享；改名/改端口会让 OCR 静默失效。

## 部署

- 页面脚本部署目录：`<AlecaFrame版本>/web/assets/js/`
- 部署名：`afzh-*.js`，必须与 `pages.json` 的 `ocrScripts` 和 `manifest.json` 的 `deployName` 一致；
- 词库：`bin/ocr/afzh-items.js`，由 `tools/build.py` 生成，形如 `window.__ALECAFRAME_ZH_CN_ITEMS__ = {...}`；
- OCR 运行期目录：`bin/ocr/`；`.tools/` 只放本机依赖，不入库。

## 服务

- 监听：`127.0.0.1:38147`（仅本机）
- server 入口：`src/ocr/server/relic-ocr-server.js`
- 协议/端点：保持现有 server/worker 约定，不在本次边界调整中改

## 全局名

见 `manifest.json` 的 `globals`，包括：

`__ALECAFRAME_ZH_CN_ITEMS__`、`__ALECAFRAME_ZH_CN_RELIC_OCR__`、`__ALECAFRAME_ZH_CN_RIVEN_OCR__`、`__ALECAFRAME_ZH_CN_RELIC_OVERLAY__`、`__ALECAFRAME_ZH_CN_RIVEN_OVERLAY__`、`__ALECAFRAME_ZH_CN_REWARD_DUCATS__`、`__ALECAFRAME_ZH_CN_RELIC_PLANNER_CACHE__`、`__ALECAFRAME_ZH_CN_CAPTURE_REWARD__` 等。

## 启动器补丁点

- 允许原地补丁的官方文件：`pages.json.hostPatches` 中列出的文件（当前为 `assets/js/relicOverlay/main.js` 与 `rivenOverlay.html`）；
- 所有补丁必须先快照、Restore 必须还原；
- 不得修改官方签名/DLL。

## 前置

- Node.js（本地或 `.tools/node`）
- `python311-portable`
- PaddleOCR（可选识别）

没有前置时 OCR 不启动，翻译/搜索仍可用；不要把它当运行时失败。
