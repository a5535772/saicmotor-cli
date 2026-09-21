import fs from "node:fs";
import path from "node:path";
import { ServiceSchema, type Service } from "../schema/catalog";
import { SaicmotorError } from "./errors";
import { catalogDir } from "../config";

export function loadCatalog(): Service[] {
  const dir = catalogDir();
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const services: Service[] = [];
  for (const f of files) {
    const file = path.join(dir, f);
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      throw new SaicmotorError("spec", `无法加载 catalog: ${file}`);
    }
    const result = ServiceSchema.safeParse(raw);
    if (!result.success) {
      const detail = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
      throw new SaicmotorError("spec", `catalog 校验失败 (${file}): ${detail}`);
    }
    services.push(result.data);
  }
  return services;
}
