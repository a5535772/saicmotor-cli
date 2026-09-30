import fs from "node:fs";
import path from "node:path";
import { ServiceSchema, type Service } from "@saicmotor/sdk";
import { catalogDir } from "../config";

export function loadCatalog(): { services: Service[]; warnings: string[] } {
  const dir = catalogDir();
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    // 核心 catalog 目录读取失败回退空列表 + 空 warning，不阻断启动
    return { services: [], warnings: [] };
  }
  const services: Service[] = [];
  const warnings: string[] = [];
  for (const f of files) {
    const file = path.join(dir, f);
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      warnings.push(`无法解析 catalog: ${file}`);
      continue;
    }
    const result = ServiceSchema.safeParse(raw);
    if (!result.success) {
      const detail = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
      warnings.push(`catalog 校验失败 (${file}): ${detail}`);
      continue;
    }
    services.push(result.data);
  }
  return { services, warnings };
}
