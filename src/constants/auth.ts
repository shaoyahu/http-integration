export const USER_ROLES = {
  USER: 'user',
  ADMIN: 'admin',
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const USER_PERMISSIONS = {
  REQUEST_MANAGEMENT: 'request_management',
  WORKFLOW_MANAGEMENT: 'workflow_management',
  ADMIN_PANEL: 'admin_panel',
} as const;

export type UserPermission = (typeof USER_PERMISSIONS)[keyof typeof USER_PERMISSIONS];

export const DEFAULT_USER_PERMISSIONS: UserPermission[] = [
  USER_PERMISSIONS.REQUEST_MANAGEMENT,
  USER_PERMISSIONS.WORKFLOW_MANAGEMENT,
];

export const ADMIN_ALL_PERMISSIONS: UserPermission[] = [
  USER_PERMISSIONS.REQUEST_MANAGEMENT,
  USER_PERMISSIONS.WORKFLOW_MANAGEMENT,
  USER_PERMISSIONS.ADMIN_PANEL,
];

export const permissionLabelMap: Record<UserPermission, string> = {
  [USER_PERMISSIONS.REQUEST_MANAGEMENT]: '请求管理权限',
  [USER_PERMISSIONS.WORKFLOW_MANAGEMENT]: '工作流管理权限',
  [USER_PERMISSIONS.ADMIN_PANEL]: '管理后台权限',
};
