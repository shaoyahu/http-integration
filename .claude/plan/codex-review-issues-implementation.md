# Codex 代码审查问题修复方案

## 概述

本文档包含 Codex 全代码审查发现的 5 个问题的详细实现方案。

---

## 问题 1：Admin 用户名提权漏洞修复

### 严重度
**高危**

### 问题描述
1. `server/index.js#L680` 注册逻辑未阻止保留用户名
2. `server/index.js#L2094` 启动时无条件将 `admin` 账号提权
3. `authStore.ts#L35` 和 `RouteSidebar.tsx#L69` 前端基于用户名的管理员判断

### 攻击路径
1. 攻击者注册用户名为 "admin" 的普通账号
2. 服务器重启时，L2094-2104 将该账号提升为管理员
3. 前端 `isAdminUser()` 因用户名为 'admin' 返回 `true`
4. 攻击者获得完整管理权限

### 实现步骤

#### 步骤 1：注册时禁止保留用户名
**文件**: `server/index.js`
**位置**: L688 之后（用户名长度检查之后）

```javascript
// 禁止注册保留用户名
const FORBIDDEN_USERNAMES = ['admin', 'administrator', 'root', 'system', 'superadmin', 'moderator'];
if (FORBIDDEN_USERNAMES.includes(normalizedUsername.toLowerCase())) {
  return res.status(400).json({ error: '该用户名不可注册', code: 'USERNAME_FORBIDDEN' });
}
```

#### 步骤 2：修复启动提权逻辑
**文件**: `server/index.js`
**位置**: L2094-2104

将无条件提权改为条件创建：

```javascript
// 检查是否已存在管理员账号
const existingAdmin = await db.collection(USERS_COLLECTION).findOne({
  $or: [
    { role: USER_ROLE.ADMIN },
    { identityIds: BUILTIN_IDENTITY_ID.ADMIN },
  ],
});

// 仅当不存在管理员时才创建初始 admin 账号
if (!existingAdmin) {
  const adminExists = await db.collection(USERS_COLLECTION).findOne({ username: 'admin' });
  if (!adminExists) {
    const now = new Date();
    await db.collection(USERS_COLLECTION).insertOne({
      username: 'admin',
      passwordHash: hashPassword('admin'),
      role: USER_ROLE.ADMIN,
      permissions: [...ADMIN_ALL_PERMISSIONS],
      identityIds: [BUILTIN_IDENTITY_ID.ADMIN],
      disabled: false,
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
    });
  }
}
```

#### 步骤 3：移除前端用户名判断
**文件**: `src/store/authStore.ts`
**位置**: L35-41

```typescript
// 修改前
export const isAdminUser = (user: AuthUser): boolean => {
  return (
    user.role === USER_ROLES.ADMIN ||
    user.permissions?.includes(USER_PERMISSIONS.ADMIN_PANEL) ||
    (typeof user.username === 'string' && user.username.trim().toLowerCase() === 'admin')
  );
};

// 修改后
export const isAdminUser = (user: AuthUser): boolean => {
  return (
    user.role === USER_ROLES.ADMIN ||
    user.permissions?.includes(USER_PERMISSIONS.ADMIN_PANEL)
  );
};
```

**文件**: `src/components/RouteSidebar.tsx`
**位置**: L69-71

```typescript
// 修改前
const canAccessAdmin = user?.role === USER_ROLES.ADMIN
  || hasAdminPanelPermission
  || (typeof user?.username === 'string' && user.username.trim().toLowerCase() === 'admin');

// 修改后
const canAccessAdmin = user?.role === USER_ROLES.ADMIN
  || hasAdminPanelPermission;
```

---

## 问题 2：请求 isPublic 持久化失效修复

### 严重度
**中高**

### 问题描述
- `Sidebar.tsx#L454` 更新 `isPublic`
- `server/index.js#L974` 保存时强制使用数据库旧值覆盖新值
- 导致"公开给所有人"开关刷新后回滚

### 根本原因
```javascript
// server/index.js#L974
isPublic: existingRequest?.isPublic ?? normalizedRequest.isPublic,
```
当 `existingRequest` 存在时，**总是使用数据库中的旧值**。

### 实现步骤

**文件**: `server/index.js`
**位置**: L971-975

```javascript
// 修改前
const nextRequest = {
  ...normalizedRequest,
  folderId: hasFolder ? normalizedRequest.folderId : null,
  isPublic: existingRequest?.isPublic ?? normalizedRequest.isPublic,  // BUG
};

// 修改后
const nextRequest = {
  ...normalizedRequest,
  folderId: hasFolder ? normalizedRequest.folderId : null,
};
```

**说明**: `normalizedRequest` 已通过 `normalizeRequest` 函数（L103: `isPublic: Boolean(req.isPublic)`）正确处理 `isPublic` 字段，直接展开即可。

---

## 问题 3：用户/身份 DELETE 路由实现

### 严重度
**中危**

### 问题描述
前端 `auth.ts#L179` 和 `#L193` 发起 DELETE 请求，但后端只有 GET/POST/PUT，缺少 DELETE 路由。

### 实现步骤

#### 步骤 1：添加删除用户路由
**文件**: `server/index.js`
**位置**: admin 路由注册区域（约 L1921 后）

**Handler 实现**:
```javascript
const deleteAdminUserHandler = async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }

  const rawUserId = typeof req.params.userId === 'string' ? req.params.userId.trim() : '';
  if (!ObjectId.isValid(rawUserId)) {
    return res.status(400).json({ error: 'Invalid userId', code: 'INVALID_USER_ID' });
  }
  const userObjectId = new ObjectId(rawUserId);

  try {
    const existingUser = await db.collection(USERS_COLLECTION).findOne(
      { _id: userObjectId },
      { projection: { username: 1 } }
    );
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }

    // 禁止删除 admin 用户
    if (existingUser.username?.toLowerCase() === 'admin') {
      return res.status(403).json({ error: '禁止删除 admin 用户', code: 'ADMIN_CANNOT_BE_DELETED' });
    }

    // 级联删除
    await db.collection(USERS_COLLECTION).deleteOne({ _id: userObjectId });
    await db.collection(USER_SESSIONS_COLLECTION).deleteMany({ userId: userObjectId });
    await db.collection(REQUEST_STATES_COLLECTION).deleteOne({ ownerUserId: rawUserId });
    await db.collection(WORKFLOW_STATES_COLLECTION).deleteOne({ ownerUserId: rawUserId });
    await db.collection(WORKFLOW_RUN_LOGS_COLLECTION).deleteMany({ userId: rawUserId });

    // 审计日志
    await db.collection(AUDIT_LOGS_COLLECTION).insertOne({
      action: 'DELETE_USER',
      targetUserId: rawUserId,
      operatorId: req.user?.id,
      timestamp: new Date(),
    });

    invalidateAdminMetaCache('identityOverview');
    return res.json({ ok: true, userId: rawUserId });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to delete user',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
```

**路由注册**:
```javascript
app.delete('/api/admin/users/:userId', requireAuth, requireAnyPermission(USER_PERMISSION.ADMIN_PANEL), deleteAdminUserHandler);
```

#### 步骤 2：添加删除身份路由
**文件**: `server/index.js`

**Handler 实现**:
```javascript
const deleteIdentityHandler = async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }

  const identityId = typeof req.params.identityId === 'string' ? req.params.identityId.trim() : '';
  if (!identityId) {
    return res.status(400).json({ error: 'Invalid identityId', code: 'INVALID_IDENTITY_ID' });
  }

  try {
    const identity = await db.collection(USER_IDENTITIES_COLLECTION).findOne(
      { _id: identityId }
    );
    if (!identity) {
      return res.status(404).json({ error: 'Identity not found', code: 'IDENTITY_NOT_FOUND' });
    }

    // 禁止删除内置身份
    if (identityId === BUILTIN_IDENTITY_ID.USER || identityId === BUILTIN_IDENTITY_ID.ADMIN) {
      return res.status(403).json({ error: '内置身份不可删除', code: 'BUILTIN_IDENTITY_CANNOT_BE_DELETED' });
    }

    // 检查是否有用户使用该身份
    const usersWithIdentity = await db.collection(USERS_COLLECTION).countDocuments(
      { identityIds: identityId }
    );
    if (usersWithIdentity > 0) {
      return res.status(400).json({
        error: '该身份已被用户使用，无法删除',
        code: 'IDENTITY_IN_USE',
        userCount: usersWithIdentity,
      });
    }

    await db.collection(USER_IDENTITIES_COLLECTION).deleteOne({ _id: identityId });

    // 审计日志
    await db.collection(AUDIT_LOGS_COLLECTION).insertOne({
      action: 'DELETE_IDENTITY',
      targetIdentityId: identityId,
      operatorId: req.user?.id,
      timestamp: new Date(),
    });

    invalidateAdminMetaCache('identityOverview');
    return res.json({ ok: true, identityId });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to delete identity',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
```

**路由注册**:
```javascript
app.delete('/api/admin/identities/:identityId', requireAuth, requireAnyPermission(USER_PERMISSION.ADMIN_PANEL), deleteIdentityHandler);
```

#### 步骤 3：添加审计日志集合常量
**文件**: `server/index.js`

```javascript
const AUDIT_LOGS_COLLECTION = 'audit_logs';
```

---

## 问题 4：测试运行与工作流执行逻辑统一

### 严重度
**中危**

### 问题描述
- `RequestEditor.tsx` 测试运行从空的 headers/params/body 开始
- `WorkflowPage.tsx` 工作流执行使用请求保存的静态 headers/params/body
- 导致同一请求测试通过但进工作流失败

### 核心差异

| | RequestEditor (测试运行) | WorkflowPage (工作流执行) |
|--|--------------------------|---------------------------|
| headers | `{}` 空 | 从 request.headers 提取 |
| params | `{}` 空 | 从 request.params 提取 |
| body | 只通过 apiMappings | 从 request.body 提取 |

### 实现步骤

**文件**: `src/components/RequestEditor.tsx`
**位置**: `buildRequestPayload` 函数（第 214-239 行）

```javascript
// 修改前
const buildRequestPayload = (inputValueMap: Record<string, string>) => {
  const headers: Record<string, string> = {};
  const params: Record<string, string> = {};
  const bodyObject: Record<string, unknown> = {};
  let url = selectedRequest?.url || '';

  const mappings = selectedRequest?.apiMappings || [];
  for (const mapping of mappings) {
    // ... 仅通过 apiMappings 处理
  }
  // ...
};

// 修改后
const buildRequestPayload = (inputValueMap: Record<string, string>) => {
  // 初始化为基础值（与 WorkflowPage.tsx 行为一致）
  const headers: Record<string, string> = (selectedRequest?.headers || []).reduce(
    (acc, h) => (h.key ? { ...acc, [h.key]: h.value } : acc), {}
  );
  const params: Record<string, string> = (selectedRequest?.params || []).reduce(
    (acc, p) => (p.key ? { ...acc, [p.key]: p.value } : acc), {}
  );
  let url = selectedRequest?.url || '';

  let bodyObject: Record<string, unknown> = {};
  if (selectedRequest?.body && selectedRequest.body.trim() !== '') {
    try {
      bodyObject = JSON.parse(selectedRequest.body);
    } catch { /* ignore */ }
  }

  // 用 apiMappings 覆盖/补充
  const mappings = selectedRequest?.apiMappings || [];
  for (const mapping of mappings) {
    if (!mapping.inputName || !mapping.key) continue;
    const value = inputValueMap[mapping.inputName];
    if (value === undefined) continue;
    if (mapping.target === 'path') {
      url = applyPathMapping(url, mapping.key, value);
    } else if (mapping.target === 'params') {
      params[mapping.key] = value;
    } else if (mapping.target === 'body') {
      setNestedValue(bodyObject, mapping.key, parseBodyValue(value));
    }
  }

  let body = undefined;
  if (selectedRequest && ['POST', 'PUT', 'PATCH'].includes(selectedRequest.method) && Object.keys(bodyObject).length > 0) {
    body = bodyObject;
  }

  return { url, headers, params, body };
};
```

### 附加交互优化

**文件**: `src/components/RequestEditor.tsx`
**功能**: inputFields 无 apiMappings 时，切换页面时给出提示

在 `useEffect` 或适当的生命周期中检测并提示：
```typescript
useEffect(() => {
  const hasUnmappedFields = selectedRequest?.inputFields?.some(field => {
    return !selectedRequest?.apiMappings?.some(m => m.inputName === field.name);
  });
  if (hasUnmappedFields) {
    message.warning('部分输入字段未配置映射，切出页面时数据不会保存');
  }
}, [selectedRequest?.inputFields, selectedRequest?.apiMappings]);
```

---

## 问题 5：前端测试基础设施修复

### 严重度
**中低**

### 问题描述
- `workflowStore.test.ts` 和 `WorkflowPage.test.tsx` 依赖 vitest
- `package.json` 缺少 vitest 依赖和测试命令

### 实现步骤

#### 步骤 1：安装 vitest
```bash
pnpm add -D vitest
```

#### 步骤 2：添加测试脚本
**文件**: `package.json`
**位置**: scripts 区域

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

#### 步骤 3：创建 vitest 配置
**文件**: `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
```

---

## 验证清单

- [ ] `npx tsc --noEmit` 通过
- [ ] `pnpm test` (vitest run) 通过
- [ ] 前端测试通过
- [ ] 后端 DELETE 路由手动验证
- [ ] isPublic 持久化手动验证
- [ ] Admin 提权漏洞手动验证（注册 admin 用户应被拒绝）

---

## 依赖关系

1. 问题 1（Admin 提权）修复后端注册和启动逻辑
2. 问题 2（isPublic）独立
3. 问题 3（DELETE 路由）依赖审计日志集合定义
4. 问题 4（测试vs工作流）独立
5. 问题 5（测试基础设施）独立

建议按上述顺序实施。
