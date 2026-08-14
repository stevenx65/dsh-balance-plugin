/**
 * dsh-balance-plugin — node 端
 *
 * cordis 插件:在 dsh web 服务器上注册一个 HTTP 路由 /dsh-balance/data,
 * 返回:
 *   - 余额(调 DeepSeek 官方 /user/balance,key 走 credentials 服务)
 *   - token 用量汇总(读取原始 session 日志 session.jsonl.zstd,
 *     仅统计 provider === "deepseek-official" 的 assistant/message 行,
 *     从而过滤掉其他厂商的用量)
 *
 * 浏览器端(client.js)通过 fetch('/dsh-balance/data') 消费本接口。
 */
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

/** Stable Cordis plugin name. */
const name = "dsh-balance";
/** Required services: webServer(HTTP 路由) + credentials(读 API key)。 */
const inject = ["webServer", "credentials"];

const BALANCE_API = "https://api.deepseek.com/user/balance";
const KEY_REF = "DEEPSEEK_API_KEY";
/** 只统计这个 provider 的用量(其他厂商的请求被过滤) */
const TARGET_PROVIDER = "deepseek-official";

function dshHome() {
  return process.env.DSH_HOME ?? join(homedir(), ".dsh");
}

/** 找到所有 session 的 session.jsonl.zstd 文件 */
async function findSessionLogs() {
  const root = join(dshHome(), "sessions");
  const files = [];
  const topEntries = await readdir(root, { withFileTypes: true });
  for (const top of topEntries) {
    if (!top.isDirectory()) continue;
    const scopeDir = join(root, top.name);
    // scope 目录(如 --home-steven_xu--)下的每个子目录是一个 session
    let subEntries;
    try {
      subEntries = await readdir(scopeDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const sub of subEntries) {
      if (!sub.isDirectory()) continue;
      const p = join(scopeDir, sub.name, "session.jsonl.zstd");
      try {
        await readFile(p);
        files.push(p);
      } catch {
        // 没有日志文件的目录,跳过
      }
    }
  }
  return files;
}

/** 解压一个 zstd 文件并返回按行分割的文本 */
async function zstdDecompress(file) {
  const { stdout } = await execFileP("zstd", ["-d", "-c", file], {
    maxBuffer: 256 * 1024 * 1024,
  });
  return stdout;
}

/**
 * 扫描 session 日志,聚合 provider === TARGET_PROVIDER 的 usage。
 * @param {string} scope - "all"(全部历史)或 "today"(北京时间当天)
 * @returns 按 provider 拆分的统计 + DeepSeek 汇总
 */
async function readTokenTotals(scope = "all") {
  const files = await findSessionLogs();
  const totals = {
    uncachedInputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
  };
  const byProvider = {};
  let messageCount = 0;
  let scannedFiles = 0;

  // "today" 按北京时间当天过滤
  let dayStartMs = 0;
  if (scope === "today") {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Shanghai",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const get = (t) => parseInt(parts.find((p) => p.type === t).value, 10);
    dayStartMs = Date.UTC(get("year"), get("month") - 1, get("day")) - 8 * 3600 * 1000;
  }

  for (const file of files) {
    let text;
    try {
      text = await zstdDecompress(file);
    } catch {
      continue; // 解压失败的文件跳过
    }
    scannedFiles++;
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let d;
      try {
        d = JSON.parse(line);
      } catch {
        continue;
      }
      if (d?.type !== "assistant/message") continue;
      const data = d.data ?? {};
      const source = data.message?.source;
      if (source?.kind !== "model" || !source.provider) continue;
      if (scope === "today" && !(typeof d.time === "number" && d.time >= dayStartMs)) continue;
      const usage = data.usage ?? {};
      const input = usage.inputTokens ?? 0;
      const output = usage.outputTokens ?? 0;
      const cacheRead = usage.cacheReadTokens ?? 0;

      const p = source.provider;
      const rec = byProvider[p] ?? (byProvider[p] = { messages: 0, input: 0, output: 0, cacheRead: 0 });
      rec.messages++;
      rec.input += input;
      rec.output += output;
      rec.cacheRead += cacheRead;

      if (p === TARGET_PROVIDER) {
        messageCount++;
        totals.uncachedInputTokens += input;
        totals.outputTokens += output;
        totals.cacheReadTokens += cacheRead;
      }
    }
  }

  return {
    totals,
    byProvider,
    messageCount,
    scannedFiles,
    targetProvider: TARGET_PROVIDER,
    scope,
    dayStartMs: scope === "today" ? dayStartMs : null,
    files,
  };
}

/** 调 DeepSeek 余额接口 */
async function fetchBalance(ctx) {
  const credentials = ctx.get("credentials");
  let apiKey;
  if (credentials !== void 0) {
    const hit = await credentials.resolve(KEY_REF);
    apiKey = hit?.value;
  }
  if (!apiKey) {
    throw new Error(`未找到 ${KEY_REF}(credentials 服务未配置)`);
  }
  const res = await fetch(BALANCE_API, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`balance API HTTP ${res.status}`);
  const data = await res.json();
  const info = (data.balance_infos ?? [])[0] ?? {};
  return {
    isAvailable: !!data.is_available,
    total: parseFloat(info.total_balance ?? NaN),
    granted: parseFloat(info.granted_balance ?? NaN),
    toppedUp: parseFloat(info.topped_up_balance ?? NaN),
    currency: info.currency ?? "CNY",
    fetchedAt: Date.now(),
  };
}

/**
 * 插件主体:注册路由。
 * @param {import("cordis").Context} ctx
 */
function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/dsh-balance/data",
    handler: async (req, res) => {
      const sendJson = (status, obj) => {
        const body = JSON.stringify(obj);
        res.writeHead(status, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(body);
      };

      // ?scope=all | today(默认 today,面板打开即显示当日)
      const url = new URL(req.url ?? "/", "http://x");
      const scope = url.searchParams.get("scope") === "all" ? "all" : "today";

      let balance = null;
      let balanceError = null;
      try {
        balance = await fetchBalance(ctx);
      } catch (e) {
        balanceError = e instanceof Error ? e.message : String(e);
      }

      let tokens = null;
      let tokenError = null;
      try {
        tokens = await readTokenTotals(scope);
      } catch (e) {
        tokenError = e instanceof Error ? e.message : String(e);
      }

      sendJson(200, {
        ok: balanceError === null || tokenError === null,
        balance,
        balanceError,
        tokens,
        tokenError,
        serverTime: Date.now(),
      });
    },
  }), "dsh-balance: /dsh-balance/data route");
}

export { apply, inject, name };
