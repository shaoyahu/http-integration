---
description: "/team [N] — 创建多 Agent 协作团队。当用户要求并行开发、多人协作、或任务需要拆分为多个独立子任务时使用。N 为 teammate 数量（1-10，默认 5），你自己作为 lead 不计入。"
user-invocable: true
---
# /team [N]
参数: $ARGUMENTS
- 第一个数字：teammate 数量（1-10，默认 5）
- 其余文字：任务描述（未提供则从对话上下文推断）
用 TeamCreate 创建团队，用 TaskCreate 分配任务，团队有哪些角色、每个角色数量、协作模式需要你自己探索。每个角色可以不止一人，监控每个 agent 角色的状态， 如果卡住了则立刻重建。注意，总角色数量不要超过 N 位。