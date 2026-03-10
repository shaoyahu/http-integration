import React from 'react';
import { Alert, Button, Card, Layout, Spin, Table, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { fetchAdminStats } from '../api/http';

const { Content } = Layout;
const { Title, Paragraph } = Typography;

export const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState('');
  const [stats, setStats] = React.useState({
    totalRequests: 0,
    totalWorkflows: 0,
    ratio: { requests: 0, workflows: 0 },
  });

  React.useEffect(() => {
    let cancelled = false;
    const loadStats = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const data = await fetchAdminStats();
        if (cancelled) {
          return;
        }
        setStats(data);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : '加载统计数据失败');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    loadStats();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalCount = stats.totalRequests + stats.totalWorkflows;
  const requestPercent = Math.round(stats.ratio.requests * 100);
  const workflowPercent = Math.round(stats.ratio.workflows * 100);
  const chartStyle = {
    background: `conic-gradient(#3b82f6 0% ${requestPercent}%, #10b981 ${requestPercent}% 100%)`,
  } as React.CSSProperties;
  const tableData = [
    { key: 'requests', name: '请求', count: stats.totalRequests, ratio: `${requestPercent}%` },
    { key: 'workflows', name: '工作流', count: stats.totalWorkflows, ratio: `${workflowPercent}%` },
  ];

  return (
      <Content className="flex-1 min-h-0 overflow-auto bg-[#f5f5f5] p-6">
        <Card>
          <Title level={3} className="!mb-2">管理后台</Title>
          <Paragraph className="!mb-5 text-gray-600">
            统计所有用户的请求和工作流总量，并展示两者占比。
          </Paragraph>
          <div className="!mb-5 flex gap-2">
            <Button onClick={() => navigate('/admin/users')}>
              进入用户管理
            </Button>
            <Button onClick={() => navigate('/admin/identities')}>
              进入身份管理
            </Button>
          </div>
          {errorMessage ? <Alert type="error" message={errorMessage} className="mb-4" /> : null}
          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <Spin tip="正在加载统计数据..." />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <div className="text-sm text-gray-500 mb-3">总量占比图</div>
                <div className="flex items-center gap-6">
                  <div className="relative w-40 h-40 rounded-full" style={chartStyle}>
                    <div className="absolute inset-6 rounded-full bg-white flex items-center justify-center text-sm text-gray-600 text-center">
                      总计
                      <br />
                      {totalCount}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" />
                      <span>请求：{stats.totalRequests}（{requestPercent}%）</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" />
                      <span>工作流：{stats.totalWorkflows}（{workflowPercent}%）</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-3">
                <Table
                  size="small"
                  pagination={false}
                  dataSource={tableData}
                  columns={[
                    { title: '类型', dataIndex: 'name', key: 'name' },
                    { title: '总数', dataIndex: 'count', key: 'count' },
                    { title: '占比', dataIndex: 'ratio', key: 'ratio' },
                  ]}
                />
              </div>
            </div>
          )}
        </Card>
      </Content>
  );
};
