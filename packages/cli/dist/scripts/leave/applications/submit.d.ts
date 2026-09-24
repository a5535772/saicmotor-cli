import type { ScriptContext } from "../../../src/engine/script";
export default function submit(ctx: ScriptContext): Promise<{
    ok: true;
    data: unknown;
}>;
