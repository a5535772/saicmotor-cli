"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getByPath = getByPath;
function getByPath(obj, path) {
    if (!path)
        return obj;
    let cur = obj;
    for (const key of path.split(".")) {
        if (cur === null || cur === undefined)
            return undefined;
        if (Array.isArray(cur))
            return undefined;
        cur = cur[key];
    }
    return cur;
}
//# sourceMappingURL=extract.js.map