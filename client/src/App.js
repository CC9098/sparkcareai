import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'react-hot-toast';
import { store } from './store/store';
import { useAppDispatch, useAppSelector } from './hooks/redux';
import { initializeAuth } from './store/slices/authSlice';
import { connectSocket } from './store/slices/socketSlice';

// Layout Components
import CareOfficeLayout from './layouts/CareOfficeLayout';
import CarerAppLayout from './layouts/CarerAppLayout';
import AuthLayout from './layouts/AuthLayout';

// Page Components - Care Office
import Dashboard from './pages/CareOffice/Dashboard';
import ResidentsList from './pages/CareOffice/Residents/ResidentsList';
import ResidentProfile from './pages/CareOffice/Residents/ResidentProfile';
import CarePlansPage from './pages/CareOffice/CarePlans/CarePlansPage';
import CarePlanDetail from './pages/CareOffice/CarePlans/CarePlanDetail';
import RiskAssessmentsPage from './pages/CareOffice/RiskAssessments/RiskAssessmentsPage';
import DailyLogsPage from './pages/CareOffice/DailyLogs/DailyLogsPage';
import TasksPage from './pages/CareOffice/Tasks/TasksPage';
import StaffPage from './pages/CareOffice/Staff/StaffPage';
import ReportsPage from './pages/CareOffice/Reports/ReportsPage';
import SettingsPage from './pages/CareOffice/Settings/SettingsPage';

// Page Components - Carer App
import CarerDashboard from './pages/CarerApp/Dashboard';
import LogEntry from './pages/CarerApp/LogEntry';
import ResidentOverview from './pages/CarerApp/ResidentOverview';
import TasksList from './pages/CarerApp/TasksList';
import HandoverNotes from './pages/CarerApp/HandoverNotes';
import ChartsView from './pages/CarerApp/ChartsView';

// Auth Components
import Login from './pages/Auth/Login';
import ForgotPassword from './pages/Auth/ForgotPassword';
import ResetPassword from './pages/Auth/ResetPassword';

// Utility Components
import LoadingSpinner from './components/ui/LoadingSpinner';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import InterfaceSelector from './components/InterfaceSelector';
import OfflineIndicator from './components/OfflineIndicator';

// Styles
import './styles/globals.css';
import './styles/animations.css';

// Service Worker Registration
import { registerSW } from './utils/serviceWorker';

function AppContent() {
  const dispatch = useAppDispatch();
  const { isLoading, isAuthenticated, user } = useAppSelector((state) => state.auth);
  const { isConnected } = useAppSelector((state) => state.socket);

  useEffect(() => {
    // Initialize authentication on app load
    dispatch(initializeAuth());

    // Register service worker for offline functionality
    registerSW();

    // Cleanup function
    return () => {
      // Cleanup if needed
    };
  }, [dispatch]);

  useEffect(() => {
    // Connect to socket when authenticated
    if (isAuthenticated && user?.facility) {
      dispatch(connectSocket(user.facility));
    }
  }, [isAuthenticated, user?.facility, dispatch]);

  // Show loading spinner during initial auth check
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <Router>
      <div className="App">
        <HelmetProvider>
          <ErrorBoundary>
            <Routes>
              {/* Authentication Routes */}
              <Route path="/auth" element={<AuthLayout />}>
                <Route path="login" element={<Login />} />
                <Route path="forgot-password" element={<ForgotPassword />} />
                <Route path="reset-password/:token" element={<ResetPassword />} />
                <Route path="" element={<Navigate to="login" replace />} />
              </Route>

              {/* Interface Selection Route */}
              <Route 
                path="/interface" 
                element={
                  <ProtectedRoute>
                    <InterfaceSelector />
                  </ProtectedRoute>
                } 
              />

              {/* Care Office Routes (Web Dashboard) */}
              <Route path="/care-office" element={
                <ProtectedRoute requiredAccessLevel={['Senior', 'Admin']}>
                  <CareOfficeLayout />
                </ProtectedRoute>
              }>
                <Route index element={<Dashboard />} />
                <Route path="dashboard" element={<Dashboard />} />
                
                {/* Residents Management */}
                <Route path="residents">
                  <Route index element={<ResidentsList />} />
                  <Route path=":id" element={<ResidentProfile />} />
                </Route>

                {/* Care Plans */}
                <Route path="care-plans">
                  <Route index element={<CarePlansPage />} />
                  <Route path=":id" element={<CarePlanDetail />} />
                </Route>

                {/* Risk Assessments */}
                <Route path="risk-assessments" element={<RiskAssessmentsPage />} />

                {/* Daily Logs */}
                <Route path="daily-logs" element={<DailyLogsPage />} />

                {/* Tasks Management */}
                <Route path="tasks" element={<TasksPage />} />

                {/* Staff Management */}
                <Route path="staff" element={<StaffPage />} />

                {/* Reports & Analytics */}
                <Route path="reports" element={<ReportsPage />} />

                {/* Settings */}
                <Route path="settings" element={<SettingsPage />} />
              </Route>

              {/* Carer App Routes (Mobile Interface) */}
              <Route path="/carer-app" element={
                <ProtectedRoute>
                  <CarerAppLayout />
                </ProtectedRoute>
              }>
                <Route index element={<CarerDashboard />} />
                <Route path="dashboard" element={<CarerDashboard />} />

                {/* Log Entry */}
                <Route path="log-entry" element={<LogEntry />} />
                <Route path="log-entry/:residentId" element={<LogEntry />} />

                {/* Resident Overview */}
                <Route path="residents/:id" element={<ResidentOverview />} />

                {/* Tasks */}
                <Route path="tasks" element={<TasksList />} />

                {/* Handover */}
                <Route path="handover" element={<HandoverNotes />} />

                {/* Charts */}
                <Route path="charts/:residentId" element={<ChartsView />} />
              </Route>

              {/* Root Route - Redirect Logic */}
              <Route path="/" element={
                isAuthenticated ? (
                  user?.accessLevel === 'Carer' ? (
                    <Navigate to="/carer-app" replace />
                  ) : (
                    <Navigate to="/interface" replace />
                  )
                ) : (
                  <Navigate to="/auth/login" replace />
                )
              } />

              {/* Catch-all Route */}
              <Route path="*" element={
                <div className="min-h-screen flex items-center justify-center bg-gray-50">
                  <div className="text-center">
                    <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
                    <p className="text-gray-600 mb-8">The page you're looking for doesn't exist.</p>
                    <button 
                      onClick={() => window.history.back()}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Go Back
                    </button>
                  </div>
                </div>
              } />
            </Routes>

            {/* Global Components */}
            <Toaster 
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#363636',
                  color: '#fff',
                  borderRadius: '8px',
                  padding: '16px',
                  fontSize: '14px',
                },
                success: {
                  style: {
                    background: '#059669',
                  },
                },
                error: {
                  style: {
                    background: '#DC2626',
                  },
                },
              }}
            />

            {/* Offline Indicator */}
            <OfflineIndicator />

            {/* Socket Connection Status (Development Only) */}
            {process.env.NODE_ENV === 'development' && (
              <div className="fixed bottom-4 left-4 z-50">
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                  isConnected 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
                </div>
              </div>
            )}
          </ErrorBoundary>
        </HelmetProvider>
      </div>
    </Router>
  );
}

function App() {
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
}

export default App;