import { useEffect } from 'react';
import { useAdminStore } from '../../stores/admin';
import AdminLogin from './AdminLogin';
import AdminDashboard from './AdminDashboard';

export default function Admin() {
  const authenticated = useAdminStore((s) => s.authenticated);
  const connectWebSocket = useAdminStore((s) => s.connectWebSocket);
  const disconnectWebSocket = useAdminStore((s) => s.disconnectWebSocket);

  useEffect(() => {
    if (authenticated) {
      connectWebSocket();
    }
    return () => {
      disconnectWebSocket();
    };
  }, [authenticated, connectWebSocket, disconnectWebSocket]);

  if (!authenticated) {
    return <AdminLogin />;
  }

  return <AdminDashboard />;
}
