import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeToken, readToken, clearToken, writeCredentials, readCredentials } from "../../src/auth/store";

describe("auth store", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saicmotor-")); process.env.SAICMOTOR_HOME = tmp; });
  afterEach(() => { delete process.env.SAICMOTOR_HOME; delete process.env.SAICMOTOR_USERNAME; delete process.env.SAICMOTOR_PASSWORD; fs.rmSync(tmp, { recursive: true, force: true }); });

  it("round-trips token", () => {
    writeToken("tok-123");
    expect(readToken()).toBe("tok-123");
    clearToken();
    expect(readToken()).toBeUndefined();
  });

  it("round-trips credentials", () => {
    writeCredentials({ username: "zhangsan", password: "123456" });
    expect(readCredentials()).toEqual({ username: "zhangsan", password: "123456" });
  });

  it("reads credentials from env", () => {
    process.env.SAICMOTOR_USERNAME = "u";
    process.env.SAICMOTOR_PASSWORD = "p";
    expect(readCredentials()).toEqual({ username: "u", password: "p" });
  });
});
