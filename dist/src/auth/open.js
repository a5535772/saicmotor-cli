"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openBrowser = openBrowser;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const errors_1 = require("../engine/errors");
const execAsync = (0, node_util_1.promisify)(node_child_process_1.exec);
async function openBrowser(url) {
    let u;
    try {
        u = new URL(url);
    }
    catch {
        throw new errors_1.SaicmotorError("network", "非法授权地址", { hint: url });
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new errors_1.SaicmotorError("network", "授权地址协议不被允许", { hint: url });
    }
    let cmd;
    if (process.platform === "win32")
        cmd = `start "" "${url}"`;
    else if (process.platform === "darwin")
        cmd = `open "${url}"`;
    else
        cmd = `xdg-open "${url}"`;
    try {
        await execAsync(cmd, { windowsHide: true });
    }
    catch {
        throw new errors_1.SaicmotorError("network", "无法打开浏览器", { hint: `请手动访问: ${url}` });
    }
}
//# sourceMappingURL=open.js.map