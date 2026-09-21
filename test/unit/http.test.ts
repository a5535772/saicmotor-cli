import { describe, it, expect, afterEach } from "vitest";
import { send } from "../../src/engine/http";
import { startServer, MockServer } from "../helpers/server";

describe("send", () => {
  let server: MockServer | undefined;
  afterEach(async () => { await server?.close(); });

  it("returns parsed JSON body and status", async () => {
    server = await startServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ code: 0, data: { ok: true } }));
    });
    const resp = await send({ method: "GET", url: server.url + "/api/list" });
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({ code: 0, data: { ok: true } });
  });

  it("preserves headers", async () => {
    server = await startServer((_req, res) => {
      res.setHeader("X-Resp", "1");
      res.end("x");
    });
    const resp = await send({ method: "GET", url: server.url + "/", headers: { "X-A": "1" } });
    expect(server.requests[0].headers["x-a"]).toBe("1");
    expect(resp.headers["x-resp"]).toBe("1");
    expect(resp.rawBody).toBe("x");
  });

  it("times out when body stalls after headers", async () => {
    server = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write('{"a":');
      const t = setTimeout(() => res.end("}"), 500);
      res.on("close", () => clearTimeout(t));
      res.on("error", () => {});
    });
    await expect(send({ method: "GET", url: server.url + "/" }, { timeoutMs: 50 })).rejects.toThrow(/请求失败/);
  });

  it("throws network error on unreachable host", async () => {
    await expect(send({ method: "GET", url: "http://127.0.0.1:1/" })).rejects.toThrow(/请求失败/);
  });

  it("combines multiple Set-Cookie headers", async () => {
    server = await startServer((_req, res) => {
      res.setHeader("Set-Cookie", ["A=1; Path=/", "B=2; HttpOnly"]);
      res.end("x");
    });
    const resp = await send({ method: "GET", url: server.url + "/" });
    expect(resp.headers["set-cookie"]).toContain("A=1");
    expect(resp.headers["set-cookie"]).toContain("B=2");
  });
});
