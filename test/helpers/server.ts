import http from "node:http";
import type { AddressInfo } from "node:net";

export interface CapturedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface MockServer {
  url: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}

export type MockHandler = (req: http.IncomingMessage, res: http.ServerResponse, ctx: { body: string }) => void;

export function startServer(handler: MockHandler): Promise<MockServer> {
  return new Promise((resolve) => {
    const requests: CapturedRequest[] = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        requests.push({
          method: req.method ?? "GET",
          url: req.url ?? "/",
          headers: (req.headers as Record<string, string>),
          body,
        });
        handler(req, res, { body });
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
