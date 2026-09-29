# @saicmotor/plugin-user

> saicmotor 用户信息查询插件——查当前登录用户的基本信息。

---

## 引擎要求

`@saicmotor/cli` ≥ 0.8.0

---

## 安装

```bash
saicmotor plugin install user --registry=<内部 registry>
```

---

## 可用命令

```bash
# 查询当前用户信息
saicmotor user info me
saicmotor user info me --format pretty
```

---

## 说明

本插件为纯声明式实现——只有 catalog JSON 声明，无自定义脚本。所有请求走引擎 HTTP 直连。