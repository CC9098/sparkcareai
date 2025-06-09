import React from 'react';
import './App.css';
import API_CONFIG from './config/api';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>SparkCare AI</h1>
        <p>Revolutionary Care Logging System for UK Care Homes</p>
        <div className="status-info">
          <p>🎯 Application Status: Online</p>
          <p>🌐 API Endpoint: {API_CONFIG.baseURL}</p>
          <p>⚙️ Environment: {process.env.NODE_ENV}</p>
        </div>
        <div className="features">
          <h2>Core Features</h2>
          <ul>
            <li>✅ Daily Care Logging</li>
            <li>✅ Care Plan Management</li>
            <li>✅ Risk Assessments</li>
            <li>✅ AI-Powered Insights</li>
            <li>✅ CQC Compliance</li>
            <li>✅ GDPR Compliant</li>
          </ul>
        </div>
        <p className="coming-soon">
          🚀 Full interface coming soon! This is the deployment test version.
        </p>
      </header>
    </div>
  );
}

export default App;