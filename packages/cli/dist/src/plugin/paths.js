"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pluginsDir = pluginsDir;
exports.installedPluginsDir = installedPluginsDir;
exports.linkedPluginsDir = linkedPluginsDir;
exports.stateFilePath = stateFilePath;
const node_path_1 = __importDefault(require("node:path"));
const config_1 = require("../config");
/** 插件安装根目录：~/.saicmotor/plugins/ */
function pluginsDir() {
    return node_path_1.default.join((0, config_1.saicmotorDir)(), "plugins");
}
/** 已安装插件目录（npm install 目标） */
function installedPluginsDir() {
    return node_path_1.default.join(pluginsDir(), "node_modules");
}
/** dev link 目录 */
function linkedPluginsDir() {
    return node_path_1.default.join(pluginsDir(), "linked");
}
/** state.json 路径 */
function stateFilePath() {
    return node_path_1.default.join(pluginsDir(), "state.json");
}
//# sourceMappingURL=paths.js.map