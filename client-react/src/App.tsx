import { BrowserRouter, Routes, Route } from 'react-router';
import { lazy, Suspense } from 'react';
import { Box, CircularProgress } from '@mui/material';

const Scanner = lazy(() => import('./components/Scanner/Scanner'));
const Admin = lazy(() => import('./pages/Admin/Admin'));

const Loading = () => (
  <Box display="flex" justifyContent="center" alignItems="center" height="100%">
    <CircularProgress />
  </Box>
);

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Scanner />} />
          <Route path="/admin/*" element={<Admin />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
