import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RequestPage } from './pages/RequestPage';
import { WorkflowPage } from './pages/WorkflowPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/requests" replace />} />
      <Route path="/requests" element={<RequestPage />} />
      <Route path="/workflows" element={<WorkflowPage />} />
      <Route path="*" element={<Navigate to="/requests" replace />} />
    </Routes>
  );
}

export default App;
