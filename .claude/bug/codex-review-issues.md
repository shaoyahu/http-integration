# Codex Review 发现的问题

日期: 2026-04-07
来源: Codex 自动化代码审查

## 问题 1 [P1] - 升级后可能丢失管理员账号

**文件**: `server/index.js:2204-2212`
**状态**: 已修复

### 描述
当数据库中存在一个名为 `admin` 的普通用户（非管理员角色），但没有真正的管理员角色/身份时，`existingAdmin` 为 false 但 `adminExists` 为 true，导致跳过创建管理员账号。由于此补丁同时移除了基于用户名的管理员快捷方式，升级后的实例将没有任何可以访问 `/admin` 或管理身份的账号，直到手动修复数据库。

### 修复方案
当存在普通 `admin` 用户但没有真正管理员时，使用 `system-admin` 用户名创建管理员账号，确保升级后始终有可用的管理员。

---

## 问题 2 [P1] - 测试依赖与 Node 18 不兼容

**文件**: `package.json:45`
**状态**: 已修复

### 描述
仓库声明 `node >= 18`，但 `jsdom@29` 仅支持 Node 20.19+。在仍使用 Node 18 的 CI 或开发机器上，`pnpm install`/`pnpm test` 会失败。

### 修复方案
将 `jsdom` 从 `^29.0.2` 降级到 `^25.0.1`，兼容 Node 18。

---

## 问题 3 [P2] - 删除用户时未清理关联状态文档

**文件**: `server/index.js:1955-1956`
**状态**: 已修复

### 描述
删除用户时，按 `ownerUserId` 字段删除请求/工作流状态，但实际上这两个集合使用 `_id = String(userId)` 存储，不含 `ownerUserId` 字段。导致删除用户后留下孤立状态数据，公开请求仍会以"未知用户"身份出现在 `/api/workflow-requests` 接口中。

### 修复方案
将删除条件从 `{ ownerUserId: rawUserId }` 改为 `{ _id: rawUserId }`。

---

## 问题 4 [P2] - 审计日志缺失操作者信息

**文件**: `server/index.js:1962, 2015`
**状态**: 已修复

### 描述
新增的审计日志插入使用 `req.user?.id`，但本服务器将认证主体存储在 `req.auth.user`。实际运行中每条 `DELETE_USER`/`DELETE_IDENTITY` 记录的 `operatorId` 都为空，导致审计追踪无法确定谁执行了删除操作。

### 修复方案
将 `req.user?.id` 改为 `req.auth?.user?.id`。
