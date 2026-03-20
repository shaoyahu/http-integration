import React from 'react';
import { Card, Table } from 'antd';
import type { TableColumnsType } from 'antd';

interface StatsTableRow {
  key: string;
  name: string;
  count: number;
  ratio: string;
}

interface StatsTableProps {
  totalRequests: number;
  totalWorkflows: number;
  requestPercent: number;
  workflowPercent: number;
}

export const StatsTable: React.FC<StatsTableProps> = ({
  totalRequests,
  totalWorkflows,
  requestPercent,
  workflowPercent,
}) => {
  const tableData: StatsTableRow[] = [
    { key: 'requests', name: '请求', count: totalRequests, ratio: `${requestPercent}%` },
    { key: 'workflows', name: '工作流', count: totalWorkflows, ratio: `${workflowPercent}%` },
  ];

  const columns: TableColumnsType<StatsTableRow> = [
    { title: '类型', dataIndex: 'name', key: 'name' },
    { title: '总数', dataIndex: 'count', key: 'count' },
    { title: '占比', dataIndex: 'ratio', key: 'ratio' },
  ];

  return (
    <Card title="统计数据表" className="h-full">
      <Table
        size="small"
        pagination={false}
        dataSource={tableData}
        columns={columns}
        className="[&_.ant-table-thead>tr>th]:!bg-[#f0f2f5]"
      />
    </Card>
  );
};
