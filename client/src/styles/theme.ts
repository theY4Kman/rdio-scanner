import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: {
      main: '#424242', // grey 800
    },
    secondary: {
      main: '#4caf50', // green 500
    },
  },
  typography: {
    fontFamily: 'Roboto, "Helvetica Neue", sans-serif',
  },
});
