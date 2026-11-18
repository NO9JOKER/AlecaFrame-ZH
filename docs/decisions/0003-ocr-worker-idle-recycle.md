# ADR 0003：OCR Paddle worker 空闲回收

- 状态：Proposed
- 日期：2026-11-18
- 决策者：项目维护者
- 相关文档：[src/ocr/AGENTS.md](../../src/ocr/AGENTS.md)、[src/ocr/CONTRACT.md](../../src/ocr/CONTRACT.md)、`src/ocr/server/relic-ocr-server.js`、`tests/ocr-idle-recycle.test.mjs`

## 背景

- `relic-ocr-server.js` 在 `server.listen` 里直接 `startPaddleWorker()`，worker（`paddle-reward-worker.py`）一经启动就常驻，只有重启服务才会退出。
- 该 worker 的价值只在「Warframe 在前台且有奖励/裂罅画面」的少数几秒；其余时间它只占内存。
- PaddleOCR 常驻开销大：同一套 worker 冷启动实测约 1.7 GB 提交内存、峰值约 2.3 GB（2026-11-18，Windows / RTX 5070 Ti 机器，CPU 版 Paddle 2.6.2）；真实机器上长跑一天的 worker 提交内存达到 8.1 GB。
- 触发条件很窄，回收代价也不大：冷启动到 ready 实测约 3.2 s，首个 OCR 请求再加约 0.4 s。
- 按 `src/ocr/AGENTS.md`，OCR 逻辑变更需另立项目/ADR；本次由项目维护者直接要求实施（用户指令优先），以最小改动落地并补 ADR、测试与真机证据。

## 决策

- 在 server 内加入**空闲回收**：一次 OCR 请求完成（或 worker 刚 ready）后开始计时；超过空闲阈值仍无在途请求时停止 worker；下一个请求经既有的 `startPaddleWorker()` 自动重生。
- 默认空闲阈值 600000 ms（10 分钟），可用环境变量 `AFZH_PADDLE_IDLE_TIMEOUT_MS` 覆盖；设为 `0` 关闭回收、恢复旧的常驻行为。
- 停止方式：先 detach（清空 `paddleChild` / `paddleReady` / `paddleStartPromise`，新请求可立即重新 spawn），再关闭 worker 的 stdin 让其自然退出；3 s 内未退出则强制 kill。
- 新增审计事件 `PADDLE_IDLE_EXIT idleMs=...`；`PADDLE_READY` 追加 `pid=...`，便于确认「换了一个进程」。
- 并发安全：旧 worker 的 exit 只重置仍是当前 worker 的状态；旧 worker 的 stdout 被忽略，避免迟到的结果行错配给新 worker 的请求。
- 启动后从未被使用的 worker 同样计时回收，避免「服务开着但一天没开游戏」的纯占用。

## 不变量

- 端口、endpoint、全局名、协议不变；请求/应答语义不变。
- 识别算法、截图流程、官方文件补丁点不变。
- `AFZH_PADDLE_IDLE_TIMEOUT_MS=0` 时行为与改动前一致。

## 考虑过的替代方案

1. **定时重启整个 OCR 服务**：会打断页面轮询与 `latest-*` 状态，且 node 重启有副作用；放弃。
2. **每次请求后都重启 worker**：每次识别多 ~4-5 s 冷启动，奖励界面体验不可接受；放弃。
3. **只靠用户手动停服务**：依赖用户操作、且不是产品行为；作为兜底文档化，不替代本改动。
4. **同时限制 OpenBLAS/OMP 线程数**：同属内存优化但主题独立（改 worker 环境，节省的是基线而非「常驻不回收」），另立改动，不夹带在本 ADR 里。

## 后果

- 空闲时释放 worker 的全部常驻内存（数百 MB 至数 GB 提交内存）。
- 空闲后的首次 OCR 多约 4-5 s 冷启动；奖励/裂罅画面停留时间远大于此，预期可接受，但需真机复验一次首次识别延迟。
- 服务启动后 10 分钟无人使用也会回收 worker：不玩游戏时不再有常驻 python。
- 新事件会出现在 `bridge-audit.log`；现有诊断包/日志读取逻辑按行文本处理，不受影响。

## 参考

- 复现与回归：`tests/ocr-idle-recycle.test.mjs`（stub worker，验证回收、重生、重复回收与 `=0` 关闭）。
- 内存与冷启动实测：见 PR 描述（含测量脚本输出）；不在仓库内写入本机路径。
