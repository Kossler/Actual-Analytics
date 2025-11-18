import { createTheme } from '@mui/material/styles';

/**
 * Main theme configuration for Actual NFL Analytics
 * Uses a dark, modern NFL-inspired color scheme with emphasis on usability
 */
const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#0a0e1a', // Deep navy for main background
      paper: '#151b2d', // Slightly lighter for cards
    },
    primary: {
      main: '#1976d2', // NFL blue
      light: '#42a5f5',
      dark: '#1565c0',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#ff4444', // Accent red
      light: '#ff6b6b',
      dark: '#cc0000',
      contrastText: '#ffffff',
    },
    success: {
      main: '#2d8c3c', // Success green
      light: '#4caf50',
      dark: '#1b5e20',
    },
    warning: {
      main: '#ff8c00',
      light: '#ffa726',
      dark: '#e65100',
    },
    error: {
      main: '#c60c30',
      light: '#ef5350',
      dark: '#b71c1c',
    },
    info: {
      main: '#1976d2',
      light: '#64b5f6',
      dark: '#0d47a1',
    },
    text: {
      primary: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.7)',
      disabled: 'rgba(255, 255, 255, 0.5)',
    },
    divider: 'rgba(255, 255, 255, 0.12)',
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '3rem',
      fontWeight: 900,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontSize: '2.5rem',
      fontWeight: 800,
      letterSpacing: '-0.01em',
    },
    h3: {
      fontSize: '2rem',
      fontWeight: 700,
    },
    h4: {
      fontSize: '1.75rem',
      fontWeight: 700,
    },
    h5: {
      fontSize: '1.5rem',
      fontWeight: 600,
    },
    h6: {
      fontSize: '1.25rem',
      fontWeight: 600,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.43,
    },
    button: {
      textTransform: 'none', // Keep normal casing for buttons
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 12, // Consistent rounded corners
  },
  spacing: 8, // Base spacing unit (8px)
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 960,
      lg: 1280,
      xl: 1920,
    },
  },
  components: {
    // Card styling - glassmorphism effect
    MuiCard: {
      styleOverrides: {
        root: {
          background: 'rgba(21, 27, 45, 0.8)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            border: '1px solid rgba(25, 118, 210, 0.3)',
            boxShadow: '0 12px 48px rgba(25, 118, 210, 0.15)',
            transform: 'translateY(-2px)',
          },
        },
      },
    },
    // Paper styling - consistent with cards
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          background: 'rgba(21, 27, 45, 0.8)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
        },
      },
    },
    // Table styling - modern, clean look
    MuiTable: {
      styleOverrides: {
        root: {
          '& thead': {
            background: 'linear-gradient(135deg, rgba(25, 118, 210, 0.1) 0%, rgba(21, 27, 45, 0.5) 100%)',
            borderBottom: '2px solid rgba(25, 118, 210, 0.3)',
          },
          '& tbody tr': {
            transition: 'all 0.2s ease',
            '&:hover': {
              background: 'rgba(25, 118, 210, 0.08)',
              transform: 'scale(1.001)',
            },
            '&:not(:last-child)': {
              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            },
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: '12px 16px',
          fontSize: '0.875rem',
          borderBottom: 'none',
        },
        head: {
          padding: '16px',
          fontSize: '0.8125rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'rgba(255, 255, 255, 0.9)',
        },
      },
    },
    // Chip styling - modern badges
    MuiChip: {
      styleOverrides: {
        root: {
          background: 'rgba(25, 118, 210, 0.15)',
          border: '1px solid rgba(25, 118, 210, 0.3)',
          color: '#ffffff',
          fontWeight: 600,
          transition: 'all 0.3s ease',
          '&:hover': {
            background: 'rgba(25, 118, 210, 0.25)',
            border: '1px solid rgba(25, 118, 210, 0.5)',
            boxShadow: '0 4px 12px rgba(25, 118, 210, 0.3)',
            transform: 'translateY(-1px)',
          },
        },
        outlined: {
          borderWidth: '1.5px',
        },
      },
    },
    // TextField/Input styling
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            color: '#ffffff',
            background: 'rgba(25, 118, 210, 0.05)',
            border: '1px solid rgba(25, 118, 210, 0.2)',
            borderRadius: '12px',
            transition: 'all 0.3s ease',
            '&:hover': {
              background: 'rgba(25, 118, 210, 0.08)',
              boxShadow: '0 0 20px rgba(25, 118, 210, 0.15)',
            },
            '&.Mui-focused': {
              background: 'rgba(25, 118, 210, 0.1)',
              boxShadow: '0 0 30px rgba(25, 118, 210, 0.25)',
              border: '1px solid rgba(25, 118, 210, 0.5)',
            },
            '& fieldset': {
              borderColor: 'transparent',
            },
          },
        },
      },
    },
    // Button styling
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '10px',
          padding: '10px 24px',
          fontSize: '0.9375rem',
          fontWeight: 600,
          boxShadow: 'none',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            boxShadow: '0 8px 24px rgba(25, 118, 210, 0.3)',
            transform: 'translateY(-2px)',
          },
        },
        contained: {
          background: 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)',
          '&:hover': {
            background: 'linear-gradient(135deg, #42a5f5 0%, #1976d2 100%)',
          },
        },
        outlined: {
          borderWidth: '1.5px',
          '&:hover': {
            borderWidth: '1.5px',
            background: 'rgba(25, 118, 210, 0.08)',
          },
        },
      },
    },
    // Autocomplete styling
    MuiAutocomplete: {
      styleOverrides: {
        paper: {
          background: 'rgba(21, 27, 45, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(25, 118, 210, 0.3)',
          marginTop: '8px',
        },
        listbox: {
          padding: '8px',
          '& .MuiAutocomplete-option': {
            borderRadius: '8px',
            margin: '2px 0',
            '&:hover': {
              background: 'rgba(25, 118, 210, 0.15)',
            },
            '&[aria-selected="true"]': {
              background: 'rgba(25, 118, 210, 0.25)',
            },
          },
        },
      },
    },
    // Loading indicator
    MuiCircularProgress: {
      styleOverrides: {
        root: {
          color: '#1976d2',
        },
      },
    },
  },
});

export default theme;
