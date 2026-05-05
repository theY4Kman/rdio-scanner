import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import WarningIcon from '@mui/icons-material/Warning';
import { useAdminStore } from '../../stores/admin';
import type { Todo } from '../../types/admin';

export default function AdminTodos() {
  const config = useAdminStore((s) => s.config);
  const passwordNeedChange = useAdminStore((s) => s.passwordNeedChange);
  const getConfig = useAdminStore((s) => s.getConfig);
  const [todos, setTodos] = useState<Todo[]>([]);

  useEffect(() => {
    getConfig();
  }, [getConfig]);

  useEffect(() => {
    const items: Todo[] = [];

    if (passwordNeedChange) {
      items.push({
        level: 'warn',
        message:
          'You are using the default admin password, please change it from the tools / admin password menu.',
      });
    }

    if (!config?.systems?.length) {
      items.push({
        level: 'info',
        message:
          'No systems defined. You can define one from the systems menu, or import one from a CSV file from the tools menu, or turn on the global auto populate option from the options menu.',
      });
    }

    if (!config?.apiKeys?.length && !config?.dirWatch?.length) {
      items.push({
        level: 'info',
        message:
          'No apikeys or dirwatch defined. Please set at least one to allow ingesting audio files.',
      });
    }

    setTodos(items);
  }, [config, passwordNeedChange]);

  if (todos.length === 0) return null;

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Todos
        </Typography>
        <List dense>
          {todos.map((todo, i) => (
            <ListItem key={i}>
              <ListItemIcon>
                {todo.level === 'warn' ? (
                  <WarningIcon color="warning" />
                ) : (
                  <NotificationsIcon color="info" />
                )}
              </ListItemIcon>
              <ListItemText primary={todo.message} />
            </ListItem>
          ))}
        </List>
      </CardContent>
    </Card>
  );
}
