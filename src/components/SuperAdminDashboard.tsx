import React from 'react';
import { SuperAdminAnalyticsView } from './SuperAdminAnalyticsView';
import { SuperAdminTenantsView } from './SuperAdminTenantsView';

export { SuperAdminAnalyticsView } from './SuperAdminAnalyticsView';
export { SuperAdminTenantsView } from './SuperAdminTenantsView';

interface SuperAdminDashboardProps {
  viewMode?: 'analytics' | 'tenants';
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ viewMode = 'analytics' }) => {
  if (viewMode === 'tenants') {
    return <SuperAdminTenantsView />;
  }
  return <SuperAdminAnalyticsView />;
};
