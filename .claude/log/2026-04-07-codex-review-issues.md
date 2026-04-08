# 2026-04-07 Codex 代码审查问题修复

## 概述
按照 codex-review-issues-implementation.md 方案实现了 plan.md 中任务 4-8。

## 修改文件

### 任务4: Admin 用户名提权漏洞修复
- `server/index.js`: 注册路由添加 FORBIDDEN_USERNAMES 黑名单校验（admin/administrator/root/system/superadmin/moderator）
- `server/index.js`: 启动提权逻辑改为条件执行——仅当不存在管理员时才创建初始 admin 账号
- `src/store/authStore.ts`: `isAdminUser()` 移除用户名判断逻辑
- `src/components/RouteSidebar.tsx`: `canAccessAdmin` 移除用户名判断逻辑

### 任务5: 请求 isPublic 持久化失效修复
- `server/index.js`: 删除 `isPublic: existingRequest?.isPublic ?? normalizedRequest.isPublic` 错误覆盖，让 normalizedRequest 直接展开

### 任务6: 用户/身份 DELETE 路由实现
- `server/index.js`: 添加 `AUDIT_LOGS_COLLECTION` 常量
- `server/index.js`: 添加 `deleteAdminUserHandler`（校验 ObjectId、禁止删除 admin、级联删除 sessions/requests/workflows/logs、审计日志）
- `server/index.js`: 添加 `deleteIdentityHandler`（禁止删除内置身份、检查用户使用、审计日志）
- `server/index.js`: 注册 DELETE /api/admin/users/:userId 和 DELETE /api/admin/identities/:identityId 路由

### 任务7: 测试运行与工作流执行逻辑统一
- `src/components/RequestEditor.tsx`: `buildRequestPayload` 从空初始值改为从 selectedRequest 提取 headers/params/body 静态值，再用 apiMappings 覆盖
- `src/components/RequestEditor.tsx`: 添加 useEffect 检测未映射字段并给出警告提示

### 任务8: 前端测试基础设施修复
- `package.json`: 添加 test/test:watch 脚本
- `package.json`: 安装 vitest@2 和 jsdom
- `vitest.config.ts`: 新建 vitest 配置文件

## 验证结果
- `tsc --noEmit` 通过
- `vitest run` 11 个测试全部通过（2 个测试文件）

## 注意事项
- vitest@4.x 需要 vite@6+，项目使用 vite@5，因此降级到 vitest@2.x
- 实现方案中使用的是代码中实际的集合常量名（REQUEST_STATE_COLLECTION 等单数形式）
