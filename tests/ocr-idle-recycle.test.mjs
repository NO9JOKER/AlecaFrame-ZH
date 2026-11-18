#!/usr/bin/env node
/* Smoke tests for Paddle worker idle recycling in the OCR server.
 *
 * The real worker imports PaddleOCR (several hundred MB, slow to load), so the
 * test drives the same spawn/JSON-line protocol with a tiny Node stub worker.
 * What is asserted is the lifecycle contract:
 *   - a finished OCR request starts the idle countdown;
 *   - the counting-down worker is stopped after the idle timeout;
 *   - the next request respawns a *different* worker and answers normally;
 *   - AFZH_PADDLE_IDLE_TIMEOUT_MS=0 keeps the old keep-alive behaviour.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = path.join(ROOT, "src", "ocr", "server", "relic-ocr-server.js");
const IDLE_MS = 1500;

let passed = 0;
const failures = [];
const cleanups = [];

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log("  ok   " + name);
    })
    .catch((error) => {
      failures.push({ name, error });
      console.log("  FAIL " + name + " -> " + (error && error.message || error));
    });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).on("error", reject));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function readLines(file) {
  try {
    return readFileSync(file, "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

async function waitFor(predicate, { timeoutMs = 15000, intervalMs = 40, label = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last) return last;
    await sleep(intervalMs);
  }
  throw new Error("timed out waiting for " + label + (last ? "" : ""));
}

function auditEvents(lines, name) {
  const pattern = new RegExp(`\\s${name}(?:\\s|$)`);
  return lines.filter((line) => pattern.test(line));
}

function eventPid(line) {
  const match = /pid=(\d+)/.exec(line);
  return match ? Number(match[1]) : null;
}

function eventTime(line) {
  return Date.parse(line.split(" ")[0]);
}

function startServer({ port, workDir, idleMs }) {
  const itemsPath = path.join(workDir, "items.js");
  const workerScript = path.join(workDir, "relic-ocr-worker.ps1");
  const captureScript = path.join(workDir, "capture-warframe-screen.ps1");
  const stubPath = path.join(workDir, "stub-paddle-worker.cjs");
  const outputDirectory = path.join(workDir, "state");
  const child = spawn(
    process.execPath,
    [SERVER, itemsPath, workerScript, outputDirectory, captureScript, process.execPath, stubPath, String(port)],
    {
      env: { ...process.env, AFZH_PADDLE_IDLE_TIMEOUT_MS: String(idleMs) },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  cleanups.push(() => {
    try { child.kill(); } catch { /* already gone */ }
  });
  const auditPath = path.join(outputDirectory, "bridge-audit.log");
  const listening = new Promise((resolve, reject) => {
    let stdout = "";
    const timer = setTimeout(() => reject(new Error("server did not listen: " + stderr.slice(-400))), 15000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.includes("listening on " + port)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited during startup (code ${code}): ${stderr.slice(-400)}`));
    });
  });
  return { child, auditPath, listening, outputDirectory };
}

async function postReward(port, imagePath) {
  const response = await fetch(`http://127.0.0.1:${port}/debug-process-reward`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: imagePath })
  });
  assert.equal(response.ok, true, "debug-process-reward should answer 200");
  return response.json();
}

const tempRoot = mkdtempSync(path.join(os.tmpdir(), "afzh-ocr-idle-"));
cleanups.push(() => rmSync(tempRoot, { recursive: true, force: true }));

const itemsPath = path.join(tempRoot, "items.js");
const imagePath = path.join(tempRoot, "frame.png");
writeFileSync(itemsPath, "window.__ALECAFRAME_ZH_CN_ITEMS__ = {};\n", "utf8");
// 1x1 transparent PNG: the OCR endpoint only checks that the path exists.
writeFileSync(
  imagePath,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  )
);
// Stub worker: speaks the same line-delimited JSON protocol as
// paddle-reward-worker.py without importing PaddleOCR.
writeFileSync(
  path.join(tempRoot, "stub-paddle-worker.cjs"),
  [
    'const readline = require("node:readline");',
    'process.stdout.write(JSON.stringify({ ready: true }) + "\\n");',
    'const lines = readline.createInterface({ input: process.stdin });',
    'lines.on("line", () => {',
    '  process.stdout.write(JSON.stringify({ success: true, imageWidth: 2, imageHeight: 2, lines: [] }) + "\\n");',
    '});',
    'lines.on("close", () => process.exit(0));'
  ].join("\n"),
  "utf8"
);

async function main() {
  await test("idle worker is recycled and the next request respawns it", async () => {
    const port = await freePort();
    const server = startServer({ port, workDir: tempRoot, idleMs: IDLE_MS });
    cleanups.push(() => server.child.kill());
    await server.listening;

    const ready = await waitFor(
      () => auditEvents(readLines(server.auditPath), "PADDLE_READY")[0],
      { label: "first PADDLE_READY" }
    );
    const firstPid = eventPid(ready);
    assert.ok(firstPid, "PADDLE_READY should log the worker pid");

    const result = await postReward(port, imagePath);
    assert.equal(result.success, false, "stub worker returns no reward titles");
    const requestDoneAt = Date.now();

    const idleExit = await waitFor(
      () => auditEvents(readLines(server.auditPath), "PADDLE_IDLE_EXIT")[0],
      { timeoutMs: IDLE_MS + 10000, label: "PADDLE_IDLE_EXIT" }
    );
    const elapsed = eventTime(idleExit) - requestDoneAt;
    assert.ok(
      elapsed >= IDLE_MS - 250,
      `worker must stay alive for the idle window (elapsed=${elapsed}ms, idle=${IDLE_MS}ms)`
    );

    const exited = await waitFor(
      () => {
        const lines = readLines(server.auditPath);
        const exitIndex = lines.findIndex((line) => line.includes(" PADDLE_EXIT "));
        const idleIndex = lines.findIndex((line) => line.includes(" PADDLE_IDLE_EXIT "));
        return exitIndex > idleIndex && idleIndex >= 0 ? lines[exitIndex] : null;
      },
      { label: "PADDLE_EXIT after PADDLE_IDLE_EXIT" }
    );
    assert.ok(exited, "the recycled worker should exit");

    // A new request must silently respawn the worker with a fresh pid.
    const afterExit = await postReward(port, imagePath);
    assert.equal(afterExit.success, false, "respawned stub worker answers again");
    const respawned = await waitFor(
      () => auditEvents(readLines(server.auditPath), "PADDLE_READY")[1],
      { label: "second PADDLE_READY" }
    );
    const secondPid = eventPid(respawned);
    assert.ok(secondPid && secondPid !== firstPid, "respawn must use a new worker process");

    // Every idle period recycles, not just the first one.
    await waitFor(
      () => auditEvents(readLines(server.auditPath), "PADDLE_IDLE_EXIT")[1],
      { timeoutMs: IDLE_MS + 10000, label: "second PADDLE_IDLE_EXIT" }
    );
    const recycles = auditEvents(readLines(server.auditPath), "PADDLE_IDLE_EXIT");
    assert.equal(recycles.length, 2, "each idle period recycles the worker once");
  });

  await test("AFZH_PADDLE_IDLE_TIMEOUT_MS=0 keeps the worker resident", async () => {
    const disabledRoot = mkdtempSync(path.join(os.tmpdir(), "afzh-ocr-idle-off-"));
    cleanups.push(() => rmSync(disabledRoot, { recursive: true, force: true }));
    for (const name of ["items.js", "stub-paddle-worker.cjs", "frame.png"]) {
      writeFileSync(path.join(disabledRoot, name), readFileSync(path.join(tempRoot, name)));
    }
    const port = await freePort();
    const server = startServer({ port, workDir: disabledRoot, idleMs: 0 });
    cleanups.push(() => server.child.kill());
    await server.listening;
    await waitFor(
      () => auditEvents(readLines(server.auditPath), "PADDLE_READY")[0],
      { label: "PADDLE_READY in keep-alive mode" }
    );
    await postReward(port, imagePath);
    await sleep(IDLE_MS * 2);
    const recycles = auditEvents(readLines(server.auditPath), "PADDLE_IDLE_EXIT");
    assert.equal(recycles.length, 0, "keep-alive mode must not recycle the worker");
    const exitLines = auditEvents(readLines(server.auditPath), "PADDLE_EXIT");
    assert.equal(exitLines.length, 0, "keep-alive worker must still be running");
  });

  for (const cleanup of cleanups.reverse()) {
    try { cleanup(); } catch { /* best effort */ }
  }

  console.log("");
  console.log(`  PASS ${passed} / FAIL ${failures.length}`);
  if (failures.length) {
    for (const failure of failures) console.log(failure.error && failure.error.stack || failure.error);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
