# 规划文档

# 说明
规划文档中保存需要开发的任务，agent 接到任务之前如果有不明白的地方需要与用户进行讨论，对于在开发的任务，不能引起其他任务的bug，对于已经做完的任务，需要单独在 /plan 文件夹下添加一个文件来记录任务和实现方案。

例如：
开发任务：
[] 1 头部样式修改
需求描述
将页面的 header 的背景颜色调整为淡蓝色。

agent 开发完成后，首先将 plan.md 文件中这个开发任务前面的勾打上，再在 /plan 文件夹下创建文件 头部样式修改.md，内容则写任务需求，实现方案和开发过程精要。

# 注意
此文档只可以修改任务的完成状态，即修改任务前面的复选框[]

# 需求安排列表

[x] 1 连线样式修改

需求描述
将工作流各个节点之间连线的样式，由实线修改为虚线。

[x] 2 工作流布局修改

需求描述
工作流页面中的搜索节点框框删除。

[x] 3 工作流编辑与运行体验增强

需求描述
参考 Make 工作流编辑器的交互，完善保存、自动排列、流程解释，并新增请求拖入、节点搜索和运行日志能力，提升工作流编排、定位与排障效率。

[x] 4 Admin 用户名提权漏洞修复

需求描述
修复高危安全问题：
1. 注册时未阻止保留用户名（admin/administrator/root/system等），攻击者可注册 admin 账号
2. 服务器启动时无条件将 username='admin' 的账号提权为管理员
3. 前端 isAdminUser() 和 canAccessAdmin() 允许用户名 'admin' 直接通过权限判断

实现方案：
1. server/index.js 注册路由（L688后）添加保留用户名黑名单校验
2. server/index.js 启动提权逻辑（L2094）改为条件执行：仅当不存在管理员时才创建初始 admin 账号
3. authStore.ts 的 isAdminUser() 移除用户名判断逻辑
4. RouteSidebar.tsx 的 canAccessAdmin 移除用户名判断逻辑

[x] 5 请求 isPublic 持久化失效修复

需求描述
请求"公开给所有人"开关实际上不会持久化，刷新后会回滚，跨用户共享请求功能基本失效。

根本原因：server/index.js#L974 使用 `existingRequest?.isPublic ?? normalizedRequest.isPublic` 强制保留数据库旧值，导致前端传来的新值被静默丢弃。

实现方案：
删除 server/index.js#L974 的错误覆盖逻辑，让 normalizedRequest 直接展开即可。normalizedRequest 已通过 normalizeRequest 正确处理 isPublic 字段。

[x] 6 用户/身份 DELETE 路由实现

需求描述
前端已实现删除用户和删除身份的功能（auth.ts 发起 DELETE 请求），但后端缺少对应路由，实际操作返回 404。

实现方案：
1. 添加 DELETE /api/admin/users/:userId 路由
   - 校验 ObjectId
   - 禁止删除 admin 用户（防止管理员锁死）
   - 删除用户 + 级联清理 user_sessions
   - 级联删除该用户的 request_states 和 workflow_states
   - 清除 adminMetaCache

2. 添加 DELETE /api/admin/identities/:identityId 路由
   - 校验 identityId
   - 禁止删除内置身份 (USER, ADMIN)
   - 检查是否有用户使用该身份，如有则拒绝删除
   - 清除 adminMetaCache

3. 添加审计日志
   - 记录管理员删除用户/身份的操作
   - 创建 audit_logs 集合存储审计记录

[x] 7 测试运行与工作流执行逻辑统一

需求描述
单请求"测试运行"和工作流实际执行不是同一套请求构造逻辑：
- RequestEditor.tsx 测试运行从空的 headers/params/body 开始，只拼映射字段
- WorkflowPage.tsx 工作流执行会带上请求保存的静态 headers/params/body

导致同一个请求，测试通过但进工作流失败。

实现方案：
修改 RequestEditor.tsx 的 buildRequestPayload 函数（第214-239行）：
1. headers/params/body 初始化为从 selectedRequest 提取的静态值（与 WorkflowPage 一致）
2. 然后用 apiMappings 映射的字段进行覆盖/追加

附加交互优化：
- 当 inputFields 无 apiMappings 时，用户切换出页面时给出提示，提醒配置字段映射

[x] 8 前端测试基础设施修复

需求描述
测试文件（workflowStore.test.ts、WorkflowPage.test.tsx）依赖 vitest，但 package.json 缺少 vitest 依赖和测试命令，导致 pnpm vitest run 失败。

实现方案：
1. 安装 vitest：pnpm add -D vitest
2. package.json 添加 scripts：
   - "test": "vitest run"
   - "test:watch": "vitest"
3. 创建 vitest.config.ts：
   ```typescript
   import { defineConfig } from 'vitest/config'
   import react from '@vitejs/plugin-react'
   export default defineConfig({
     plugins: [react()],
     test: { globals: true, environment: 'jsdom' },
   })
   ```
