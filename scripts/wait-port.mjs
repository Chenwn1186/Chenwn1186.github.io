#!/usr/bin/env node
/**
 * 零依赖端口就绪等待 —— CI 与本地 E2E 的前置。
 *
 * 为什么不用 `npx wait-on`：wait-on 不是本仓库依赖，`npx` 对未知包会**联网即时
 * 下载**——这会（1）引入未锁定版本的第三方包；（2）registry 受限时直接失败；
 * （3）破坏「干净 clone 可复现」的验收标准。本脚本只用 Node 内置能力。
 *
 * 用法：node scripts/wait-port.mjs [url] [timeoutMs]
 *   默认 url = http://localhost:4173 （注意：本机 vite preview 只监听 IPv6 ::1，
 *   127.0.0.1 会 ERR_CONNECTION_REFUSED——用 localhost 让系统自己解析）。
 */
'use strict';

const url = process.argv[2] || 'http://localhost:4173';
const timeoutMs = Number(process.argv[3]) || 60_000;
const deadline = Date.now() + timeoutMs;
const started = Date.now();

for (;;) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
    // 2xx/3xx/4xx 都算端口就绪（4xx 说明服务在响应，只是路径不对）
    if (res.status < 500) {
      console.log(`ready: ${url} (HTTP ${res.status}, waited ${Date.now() - started}ms)`);
      process.exit(0);
    }
  } catch {
    /* 连接失败 = 未就绪，继续轮询 */
  }
  if (Date.now() > deadline) {
    console.error(`timeout after ${timeoutMs}ms waiting for ${url}`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 300));
}
