import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { RequestPage } from './pages/RequestPage';
import { WorkflowPage } from './pages/WorkflowPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/requests" element={<RequestPage />} />
      <Route path="/workflows" element={<WorkflowPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;