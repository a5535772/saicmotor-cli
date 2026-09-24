"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadState = loadState;
exports.saveState = saveState;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const paths_1 = require("./paths");
function loadState() {
    try {
        const raw = node_fs_1.default.readFileSync((0, paths_1.stateFilePath)(), "utf8");
        return JSON.parse(raw);
    }
    catch {
        return { plugins: {} };
    }
}
function saveState(state) {
    const dir = node_path_1.default.dirname((0, paths_1.stateFilePath)());
    if (!node_fs_1.default.existsSync(dir))
        node_fs_1.default.mkdirSync(dir, { recursive: true });
    node_fs_1.default.writeFileSync((0, paths_1.stateFilePath)(), JSON.stringify(state, null, 2), "utf8");
}
//# sourceMappingURL=state.js.map