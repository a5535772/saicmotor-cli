"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findPackageRoot = findPackageRoot;
exports.packageFile = packageFile;
exports.distRoot = distRoot;
// src/pkg-root.ts
// 统一包根定位：源码位于 src/、编译产物位于 dist/src/，两种形态下都能找到包根
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const PACKAGE_MARKER = "saicmotor.config.json";
function findPackageRoot(start = __dirname) {
    let dir = start;
    for (let i = 0; i < 6; i++) {
        if (node_fs_1.default.existsSync(node_path_1.default.join(dir, PACKAGE_MARKER))) {
            return dir;
        }
        const parent = node_path_1.default.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    // 兜底：src/ 或 dist/src/ 下两级即包根
    return node_path_1.default.resolve(start, "..", "..");
}
function packageFile(rel) {
    return node_path_1.default.join(findPackageRoot(), rel);
}
function distRoot() {
    return node_path_1.default.join(findPackageRoot(), "dist");
}
//# sourceMappingURL=pkg-root.js.map