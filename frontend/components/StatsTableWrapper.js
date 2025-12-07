import {
  Card,
  CardHeader,
  CardContent,
  TableContainer,
  Table,
  CircularProgress,
  Box,
} from '@mui/material';

/**
 * StatsTableWrapper component - wraps stats tables with consistent styling
 * @param {string} title - Table title
 * @param {string} subtitle - Table subtitle
 * @param {boolean} loading - Loading state
 * @param {number} dataLength - Length of data array
 * @param {React.ReactNode} children - Table content
 * @param {React.ReactNode} headerAction - Optional action component for header (e.g., dropdown)
 */
export default function StatsTableWrapper({ 
  title, 
  subtitle, 
  loading, 
  dataLength, 
  children,
  headerAction
}) {
  return (
    <Card sx={{ mb: 4 }}>
      <CardHeader
        title={title}
        subheader={subtitle}
        action={headerAction}
        titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
        subheaderTypographyProps={{ variant: 'body2' }}
      />
      <CardContent sx={{ p: 0 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : dataLength === 0 ? (
          <Box sx={{ textAlign: 'center', p: 4, color: 'text.secondary' }}>
            No stats available
          </Box>
        ) : (
          <TableContainer
            sx={{
              overflowX: 'auto',
              scrollbarWidth: 'none', // Firefox
              '&::-webkit-scrollbar': { display: 'none' }, // Chrome, Safari
            }}
          >
            <Table size="small" stickyHeader>
              {children}
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}
