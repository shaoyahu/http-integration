import React from 'react';
import { Card } from 'antd';

interface StatsChartProps {
  totalRequests: number;
  totalWorkflows: number;
  requestPercent: number;
  workflowPercent: number;
}

const COLORS = {
  requests: '#1890ff',
  workflows: '#52c41a',
};

export const StatsChart: React.FC<StatsChartProps> = ({
  totalRequests,
  totalWorkflows,
  requestPercent,
  workflowPercent,
}) => {
  const totalCount = totalRequests + totalWorkflows;

  if (totalCount === 0) {
    return (
      <Card title="总量占比图" className="h-full">
        <div className="flex items-center justify-center h-64 text-gray-400">暂无数据</div>
      </Card>
    );
  }

  const chartStyle = {
    background: `conic-gradient(${COLORS.requests} 0% ${requestPercent}%, ${COLORS.workflows} ${requestPercent}% 100%)`,
  } as React.CSSProperties;

  return (
    <Card title="总量占比图" className="h-full">
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
            <span>请求：{totalRequests}（{requestPercent}%）</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-block w-3 h-3 rounded-sm bg-green-500" />
            <span>工作流：{totalWorkflows}（{workflowPercent}%）</span>
          </div>
        </div>
      </div>
    </Card>
  );
};
