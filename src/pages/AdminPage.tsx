import React from 'react';
import { Alert, Button, Card, Spin, Layout } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAdminStore } from '../store/adminStore';
import { StatsChart } from '../components/admin/StatsChart';
import { StatsTable } from '../components/admin/StatsTable';

const { Content } = Layout;

export const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const { stats, statsLoading, statsError, fetchStats } = useAdminStore();

  React.useEffect(() => {
    fetchStats();
  }, []);

  const totalCount = stats.totalRequests + stats.totalWorkflows;
  const requestPercent = Math.round(stats.ratio.requests * 100);
  const workflowPercent = Math.round(stats.ratio.workflows * 100);

  return (
    <Content className="flex-1 min-h-0 overflow-auto bg-[#f5f5f5] p-6">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-medium mb-1">管理后台</h2>
            <p className="text-gray-500 text-sm">统计所有用户的请求和工作流总量，并展示两者占比</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => navigate('/admin/users')}>进入用户管理</Button>
            <Button onClick={() => navigate('/admin/identities')}>进入身份管理</Button>
          </div>
        </div>
        {statsError ? <Alert type="error" message={statsError} className="mb-4" /> : null}
        {statsLoading ? (
          <div className="py-12 flex items-center justify-center">
            <Spin tip="正在加载统计数据..." />
          </div>
        ) : totalCount === 0 ? (
          <div className="py-12 text-center text-gray-400">暂无数据</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StatsChart
              totalRequests={stats.totalRequests}
              totalWorkflows={stats.totalWorkflows}
              requestPercent={requestPercent}
              workflowPercent={workflowPercent}
            />
            <StatsTable
              totalRequests={stats.totalRequests}
              totalWorkflows={stats.totalWorkflows}
              requestPercent={requestPercent}
              workflowPercent={workflowPercent}
            />
          </div>
        )}
      </Card>
    </Content>
  );
};
