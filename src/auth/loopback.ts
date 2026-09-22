import http from "node:http";
import type { AddressInfo } from "node:net";
import { SaicmotorError } from "../engine/errors";

export interface CallbackParams {
  code: string;
  state: string;
}

export interface LoopbackHandle {
  port: number;
  result: Promise<CallbackParams>;
  close: () => Promise<void>;
}

const SUCCESS_HTML = "<html><body><h3>登录成功，可以关闭本页。</h3></body></html>";
const FAIL_HTML = "<html><body><h3>登录失败，请回到终端重新登录。</h3></body></html>";
const ENDED_HTML = "<html><body><h3>登录已结束或超时，请回到终端。</h3></body></html>";

export async function startCallbackServer(opts: { host: string; port: number; timeoutMs: number }): Promise<LoopbackHandle> {
  let resolveFn!: (p: CallbackParams) => void;
  let rejectFn!: (e: Error) => void;
  const result = new Promise<CallbackParams>((resolve, reject) => { resolveFn = resolve; rejectFn = reject; });

  let settled = false;
  let timer: NodeJS.Timeout;

  const settleOk = (p: CallbackParams) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolveFn(p);
  };
  const settleErr = (e: Error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    rejectFn(e);
  };

  const server = http.createServer((req, res) => {
    try {
      const u = new URL(req.url ?? "/", `http://${opts.host}`);
      if (u.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      if (settled) {
        res.writeHead(410, { "Content-Type": "text/html; charset=utf-8" }).end(ENDED_HTML);
        return;
      }
      const code = u.searchParams.get("code") ?? "";
      const state = u.searchParams.get("state") ?? "";
      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" }).end(FAIL_HTML);
        settleErr(new SaicmotorError("auth", "回调缺少 code"));
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(SUCCESS_HTML);
      settleOk({ code, state });
    } catch (e) {
      if (!res.headersSent) {
        res.writeHead(500).end();
      } else {
        res.end();
      }
      settleErr(e as Error);
    }
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, opts.host, () => resolve((server.address() as AddressInfo).port));
  });
  timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    rejectFn(new SaicmotorError("auth", "等待浏览器回调超时，请重试登录"));
  }, opts.timeoutMs);

  const close = () => new Promise<void>((r) => {
    clearTimeout(timer);
    server.close(() => r());
  });

  return { port, result, close };
}
