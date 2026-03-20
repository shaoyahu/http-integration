# Bug 复盘：导入文件路径不匹配

## Bug 概述

**发现时间**: 2026-03-20
**严重程度**: 高（阻塞构建）
**影响范围**: 管理后台页面无法正常构建

## Bug 描述

执行 `npm run build` 时报错：

```
Could not resolve "./pages/UsersPage" from "src/App.tsx"
```

## 根因分析

在 team 模式开发过程中，frontend-dev 创建了页面组件，但存在以下问题：

1. **文件名与组件名不匹配**：创建的页面组件文件名和实际导出的组件名不一致
2. **删除重复文件后未同步更新 App.tsx**：reviewer 删除了未使用的 `IdentitiesPage.tsx` 和 `UsersPage.tsx`，但 App.tsx 仍然引用这些已删除的文件

### 错误代码位置

`src/App.tsx` 第 6-7 行：
```typescript
import { UsersPage } from './pages/UsersPage';        // ❌ 文件不存在
import { IdentitiesPage } from './pages/IdentitiesPage'; // ❌ 文件不存在
```

第 44-45 行：
```tsx
<Route path="/admin/users" element={<UsersPage />} />
<Route path="/admin/identities" element={<IdentitiesPage />} />
```

### 正确的文件名

| 错误引用 | 正确引用 |
|----------|----------|
| `./pages/UsersPage` | `./pages/UserManagementPage` |
| `./pages/IdentitiesPage` | `./pages/IdentityManagementPage` |

## 修复方案

修改 `src/App.tsx`：

```diff
- import { UsersPage } from './pages/UsersPage';
- import { IdentitiesPage } from './pages/IdentitiesPage';
+ import { UserManagementPage } from './pages/UserManagementPage';
+ import { IdentityManagementPage } from './pages/IdentityManagementPage';

  // Route 元素
- <Route path="/admin/users" element={<UsersPage />} />
- <Route path="/admin/identities" element={<IdentitiesPage />} />
+ <Route path="/admin/users" element={<UserManagementPage />} />
+ <Route path="/admin/identities" element={<IdentityManagementPage />} />
```

## 经验教训

1. **team 模式下应注意文件同步**：在删除或重命名文件时，必须同步检查和更新所有引用
2. **reviewer 应检查 App.tsx 路由配置**：不仅检查组件内容，还要验证路由引用是否正确
3. **建议添加 CI 检查**：在构建流程中加入 import 检查，及早发现问题

## 预防措施

- 后续开发中使用 glob 检查确保删除文件前没有其他引用
- reviewer 在清理文件时，同步检查 App.tsx 的路由配置
