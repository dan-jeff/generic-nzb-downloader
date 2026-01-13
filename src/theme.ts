import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  spacing: 5,
  palette: {
    mode: 'dark',
    primary: {
      main: '#00E5FF', // Cyan/Aqua accent
      light: '#62EFFF',
      dark: '#00B2CC',
    },
    background: {
      default: '#0A0F1D', // Deep Midnight Blue
      paper: '#141B2D',   // Rich Surface Gray-Blue
    },
    text: {
      primary: '#F0F4F8',
      secondary: '#94A3B8',
    },
    divider: 'rgba(148, 163, 184, 0.12)',
    secondary: {
      main: '#8B5CF6',    // Soft Violet
      light: '#A78BFA',
      dark: '#7C3AED',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 15,
    h5: {
      fontSize: '1.375rem',
      fontWeight: 800,
      letterSpacing: '0.02em',
      lineHeight: 1.4,
      textTransform: 'uppercase',
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 700,
      letterSpacing: '0.02em',
      lineHeight: 1.4,
      textTransform: 'uppercase',
    },
    subtitle1: {
      fontSize: '1rem',
      lineHeight: 1.6,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.6,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.6,
    },
    button: {
      fontSize: '0.875rem',
      fontWeight: 600,
      textTransform: 'none',
    },
  },
  shape: {
    borderRadius: 4,
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
        size: 'small',
      },
      styleOverrides: {
        root: {
          borderRadius: 4,
          padding: '4px 12px',
          transition: 'all 0.1s ease-in-out',
          '&:hover': {
            backgroundColor: 'rgba(0, 229, 255, 0.08)',
          },
        },
        containedPrimary: {
          '&:hover': {
            backgroundColor: '#00B2CC',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0) 100%)',
          border: '1px solid rgba(148, 163, 184, 0.12)',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        size: 'small',
        variant: 'outlined',
      },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: 'rgba(255, 255, 255, 0.2)',
            },
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          transition: 'all 0.1s ease-in-out',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 40,
          padding: '6px 16px',
          fontWeight: 600,
          fontSize: '0.9375rem',
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 40,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 2,
          height: 4,
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
        },
        bar: {
          borderRadius: 2,
          backgroundColor: '#00E5FF',
        },
      },
    },
  },
});

export default theme;
