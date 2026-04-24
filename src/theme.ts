import { createTheme, Theme, alpha } from '@mui/material/styles';

export type ThemeMode = 'dark' | 'light';

const palettes = {
  dark: {
    mode: 'dark' as const,
    primary:   { main: '#60A5FA', light: '#93C5FD', dark: '#3B82F6' }, // blue-400
    secondary: { main: '#FCD34D', light: '#FDE68A', dark: '#F59E0B' }, // amber-300
    success:   { main: '#34D399' },
    error:     { main: '#F87171' },
    warning:   { main: '#FBBF24' },
    info:      { main: '#60A5FA' },
    background: {
      default: '#0F172A', // slate-900
      paper:   '#1E293B', // slate-800 — solid, card has a real surface
    },
    text: {
      primary:   '#F1F5F9',
      secondary: '#94A3B8',
      disabled:  '#64748B',
    },
    divider: 'rgba(148, 163, 184, 0.16)',
    action: {
      hover:          'rgba(148, 163, 184, 0.08)',
      selected:       'rgba(96, 165, 250, 0.12)',
      disabled:       'rgba(148, 163, 184, 0.3)',
      disabledBackground: 'rgba(148, 163, 184, 0.06)',
    },
  },
  light: {
    mode: 'light' as const,
    primary:   { main: '#2563EB', light: '#3B82F6', dark: '#1D4ED8' }, // blue-600
    secondary: { main: '#D97706', light: '#F59E0B', dark: '#B45309' }, // amber-600
    success:   { main: '#059669' },
    error:     { main: '#DC2626' },
    warning:   { main: '#D97706' },
    info:      { main: '#2563EB' },
    background: {
      default: '#F8FAFC', // slate-50
      paper:   '#FFFFFF',
    },
    text: {
      primary:   '#0F172A',
      secondary: '#64748B',
      disabled:  '#94A3B8',
    },
    divider: 'rgba(15, 23, 42, 0.08)',
    action: {
      hover:          'rgba(15, 23, 42, 0.04)',
      selected:       'rgba(37, 99, 235, 0.08)',
      disabled:       'rgba(15, 23, 42, 0.3)',
      disabledBackground: 'rgba(15, 23, 42, 0.04)',
    },
  },
};

export const createAppTheme = (mode: ThemeMode): Theme => {
  const p = palettes[mode];

  return createTheme({
    spacing: 5,
    palette: p,
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      fontSize: 15,
      h5: { fontSize: '1.375rem', fontWeight: 700, letterSpacing: '0.01em', lineHeight: 1.35 },
      h6: { fontSize: '1rem', fontWeight: 700, letterSpacing: '0.01em', lineHeight: 1.4 },
      subtitle1: { fontSize: '1rem', lineHeight: 1.6 },
      body1: { fontSize: '1rem', lineHeight: 1.6 },
      body2: { fontSize: '0.875rem', lineHeight: 1.55 },
      button: { fontSize: '0.875rem', fontWeight: 600, textTransform: 'none' },
    },
    shape: { borderRadius: 6 }, // squared off — just enough to soften edges
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true, size: 'small' },
        styleOverrides: {
          root: { borderRadius: 6, padding: '6px 14px', transition: 'background-color 0.15s ease-in-out' },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: p.background.paper,
            border: `1px solid ${p.divider}`,
            boxShadow: mode === 'dark'
              ? '0 4px 20px -8px rgba(0, 0, 0, 0.4)'
              : '0 4px 20px -8px rgba(15, 23, 42, 0.08)',
            borderRadius: 6,
          },
        },
      },
      MuiTextField: {
        defaultProps: { size: 'small', variant: 'outlined' },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: 6 },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: { borderRadius: 6, transition: 'background-color 0.15s ease-in-out' },
        },
      },
      MuiChip: {
        styleOverrides: { root: { borderRadius: 4 } },
      },
      MuiTab: {
        styleOverrides: {
          root: { minHeight: 40, padding: '6px 16px', fontWeight: 600, fontSize: '0.9375rem' },
        },
      },
      MuiTabs: { styleOverrides: { root: { minHeight: 40 } } },
      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: 2, height: 4, backgroundColor: alpha(p.text.primary, 0.08) },
          bar:  { borderRadius: 2 },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: mode === 'dark' ? '#334155' : '#1E293B',
            fontSize: '0.75rem',
            borderRadius: 4,
          },
        },
      },
    },
  });
};

export default createAppTheme('dark');
