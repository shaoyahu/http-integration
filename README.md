# HTTP Integration Client

现代化 HTTP 请求管理与可视化工作流编辑器。 author：syh

## 主要功能

### HTTP 请求管理
- 支持多种 HTTP 方法（GET, POST, PUT, DELETE, PATCH 等）
- 请求参数、Headers、Body 配置
- 请求收藏夹与文件夹管理
- 响应数据可视化展示
- 请求通过后端代理转发

### 可视化工作流编辑器
- 拖拽式节点编辑
- 节点间手动连线
- 触发器配置
- 工作流运行日志
- 节点碰撞检测与位置优化

### 用户系统
- 用户注册与登录认证
- 基于角色的权限控制（RBAC）
- 权限点模型

### 管理员功能
- 用户管理
- 身份管理
- 统计数据仪表盘

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite |
| UI 组件 | Ant Design |
| 状态管理 | Zustand |
| 样式 | Tailwind CSS |
| 后端 | Express.js (Node.js) |
| 数据库 | MongoDB |
| 测试 | Vitest + React Testing Library |
| 编辑器 | Monaco Editor |

## 快速开始

### 环境要求
- Node.js >= 18.0.0
- MongoDB 数据库

### 安装依赖
```bash
pnpm install
```

### 开发模式
```bash
# 启动前后端开发服务器
pnpm dev

# 仅前端
pnpm dev:client

# 仅后端
pnpm dev:server
```

前端开发服务器运行在 `http://localhost:62345`

### 构建
```bash
# 构建生产版本
pnpm build

# 构建客户端
pnpm build:client

# 构建服务端
pnpm build:server

# 启动生产服务
pnpm start
```

### 测试
```bash
# 运行所有测试
pnpm test

# 监听模式
pnpm test:watch
```

### 代码检查
```bash
# ESLint
npx eslint src/

# TypeScript 类型检查
npx tsc --noEmit
```

## 项目结构

```
src/
├── api/              # API 请求封装
├── components/       # React 组件
│   ├── admin/        # 管理员相关组件
│   ├── request/      # 请求编辑器组件
│   └── workflow/     # 工作流编辑器组件
├── constants/        # 常量定义
├── pages/            # 页面组件
├── store/            # Zustand 状态管理
├── types/            # TypeScript 类型定义
└── utils/            # 工具函数

server/
├── index.js          # Express 服务器入口
└── workflowState.js  # 工作流状态处理
```

## 数据库配置

创建 `.env` 文件：

```env
MONGODB_URI=mongodb://localhost:27017/http-client
SESSION_SECRET=your-session-secret
PORT=3000
```

## 提交规范

使用 Conventional Commits 格式：

```
feat: 新功能
fix: 修复 bug
refactor: 重构
docs: 文档更新
test: 测试相关
chore: 构建/工具相关
```

## License

MIT
