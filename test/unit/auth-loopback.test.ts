import { describe, it, expect } from "vitest";
import http from "node:http";
import { startCallbackServer } from "../../src/auth/loopback";

describe("loopback callback", () => {
  it("captures code and state from /callback", async () => {
    const cb = await startCallbackServer({ host: "127.0.0.1", port: 0, timeoutMs: 5000 });
    const port = cb.port;
    const resultPromise = cb.result;
    // 模拟浏览器跳转
    const status = await new Promise<number>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/callback?code=code-123&state=st`, (r) => { r.resume(); r.on("end", () => resolve(r.statusCode ?? 0)); })
        .on("error", reject);
    });
    expect(status).toBe(200);
    expect(await resultPromise).toEqual({ code: "code-123", state: "st" });
    await cb.close();
  });

  it("times out without callback", async () => {
    const cb = await startCallbackServer({ host: "127.0.0.1", port: 0, timeoutMs: 100 });
    await expect(cb.result).rejects.toThrow(/超时/);
    await cb.close();
  });
});
