import {
  Avatar,
  Box,
  Button,
  Card,
  CardHeader,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { getPositionColor } from '../utils/statsUtils';
import { useEffect, useMemo, useState } from 'react';

function formatHeight(height) {
  if (height == null) return null;
  const raw = typeof height === 'string' ? height.trim() : String(height);
  const asInt = Number.parseInt(raw, 10);

  // If the API provides inches (common in NFL data), convert to feet/inches.
  if (Number.isFinite(asInt) && asInt >= 36 && asInt <= 96) {
    const feet = Math.floor(asInt / 12);
    const inches = asInt % 12;
    return `${feet}'${inches}"`;
  }

  return raw;
}

function formatWeight(weight) {
  if (weight == null) return null;
  const raw = typeof weight === 'string' ? weight.trim() : String(weight);
  const asInt = Number.parseInt(raw, 10);

  // If the API provides pounds (common in NFL data), show as "### lb".
  if (Number.isFinite(asInt) && asInt >= 80 && asInt <= 450) {
    return `${asInt} lb`;
  }

  return raw;
}

function InfoItem({ label, value }) {
  if (!value) return null;
  return (
    <Box sx={{ minWidth: 100 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', fontWeight: 700, letterSpacing: 0.3 }}
      >
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Box>
  );
}

function formatCurrency(value) {
  if (value == null || value === '') return null;
  const asNumber = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(asNumber)) return String(value);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(asNumber);
  } catch {
    return `$${Math.round(asNumber).toLocaleString('en-US')}`;
  }
}

function normalizeContractValue(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  const asNumber = Number.parseFloat(String(raw));
  return Number.isFinite(asNumber) ? asNumber : String(raw);
}

/**
 * PlayerInfo component displaying selected player details
 * @param {object} player - Selected player object
 */
export default function PlayerInfo({ player }) {
  if (!player) return null;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const jerseyNumber = player.jersey_number ?? player.jerseyNumber ?? player.jersey;
  const college = player.college_name ?? player.college ?? player.collegeName;
  const height = formatHeight(player.height);
  const weight = formatWeight(player.weight);
  const headshot = player.headshot ?? player.headshot_url ?? player.photo ?? player.photo_url;

  const [contractsOpen, setContractsOpen] = useState(false);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contractsError, setContractsError] = useState(null);
  const [contracts, setContracts] = useState([]);

  useEffect(() => {
    if (!contractsOpen) return;
    if (!player?.gsis_id) return;

    const controller = new AbortController();
    setContractsLoading(true);
    setContractsError(null);

    (async () => {
      try {
        const res = await fetch(`${apiUrl}/api/players/${player.gsis_id}/contracts`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Failed to fetch contract history');
        const data = await res.json();
        setContracts(Array.isArray(data) ? data : []);
      } catch (err) {
        if (err?.name === 'AbortError') return;
        setContracts([]);
        setContractsError(err?.message || 'Failed to fetch contract history');
      } finally {
        setContractsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [contractsOpen, player?.gsis_id, apiUrl]);

  const hasInfoItems = Boolean(jerseyNumber || college || height || weight);

  const contractRows = useMemo(() => {
    if (!Array.isArray(contracts)) return [];
    return contracts.map((c, idx) => {
      const yearSigned = c.year_signed ?? c.yearSigned ?? c.year;
      const years = c.years ?? c.contract_years ?? c.length;
      const value = normalizeContractValue(c.value);
      const apy = normalizeContractValue(c.apy);
      const guaranteed = normalizeContractValue(c.guaranteed);
      const team = c.team ?? c.draft_team ?? c.team_signed;
      return {
        key: c.id ?? `${yearSigned ?? 'na'}-${team ?? 'na'}-${idx}`,
        yearSigned: yearSigned != null ? String(yearSigned) : '',
        team: team != null ? String(team) : '',
        years: years != null ? String(years) : '',
        value: value,
        apy: apy,
        guaranteed: guaranteed,
      };
    });
  }, [contracts]);

  return (
    <Card sx={{ mb: 4 }}>
      <CardHeader
        sx={{
          '& .MuiCardHeader-action': {
            alignSelf: 'center',
            mt: 0,
          },
          '& .MuiCardHeader-content': {
            minWidth: 0,
          },
        }}
        avatar={
          headshot ? (
            <Avatar
              src={headshot}
              alt={player.name}
              sx={{ width: { xs: 64, sm: 80, md: 100 }, height: { xs: 64, sm: 80, md: 100 } }}
              imgProps={{ loading: 'lazy', referrerPolicy: 'no-referrer' }}
            />
          ) : (
            <Chip
              label={player.position}
              size="medium"
              variant="outlined"
              sx={{
                borderColor: getPositionColor(player.position),
                color: getPositionColor(player.position),
                fontWeight: 700,
                fontSize: '0.875rem',
              }}
            />
          )
        }
        title={
          <Box
            sx={{
              display: 'flex',
              alignItems: { xs: 'flex-start', sm: 'center' },
              gap: 1,
              flexWrap: 'wrap',
            }}
          >
            <Typography
              variant="h5"
              sx={{
                fontWeight: 700,
                lineHeight: 1.1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {player.name}
            </Typography>
            <Chip
              label={player.position}
              size="small"
              variant="outlined"
              sx={{
                borderColor: getPositionColor(player.position),
                color: getPositionColor(player.position),
                fontWeight: 700,
              }}
            />
          </Box>
        }
        subheader={`${player.position} • ${player.team_name || player.team || ''}`}
        action={
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 2,
              flexWrap: 'wrap',
              pr: { xs: 0, sm: 2 },
            }}
          >
            {hasInfoItems && (
              <Box
                sx={{
                  display: { xs: 'none', md: 'flex' },
                  gap: 2,
                  flexWrap: 'wrap',
                  justifyContent: 'flex-end',
                }}
              >
                <InfoItem label="Jersey" value={jerseyNumber ? `#${jerseyNumber}` : null} />
                <InfoItem label="College" value={college} />
                <InfoItem label="Height" value={height} />
                <InfoItem label="Weight" value={weight} />
              </Box>
            )}

            <Button
              variant="outlined"
              size="small"
              onClick={() => setContractsOpen(true)}
              sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
            >
              Contract History
            </Button>
          </Box>
        }
        subheaderTypographyProps={{
          variant: 'body1',
          sx: { mt: 0.5 },
        }}
      />

      <Dialog
        open={contractsOpen}
        onClose={() => setContractsOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Contract History</DialogTitle>
        <DialogContent dividers sx={{ p: 0, overflowX: 'hidden' }}>
          {contractsLoading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2 }}>
              <CircularProgress size={20} />
              <Typography variant="body2">Loading…</Typography>
            </Box>
          )}

          {!contractsLoading && contractsError && (
            <Typography variant="body2" color="error" sx={{ p: 2 }}>
              {contractsError}
            </Typography>
          )}

          {!contractsLoading && !contractsError && contractRows.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              No contract history found.
            </Typography>
          )}

          {!contractsLoading && !contractsError && contractRows.length > 0 && (
            <TableContainer
              sx={{
                overflowX: 'auto',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                '&::-webkit-scrollbar': { display: 'none' },
              }}
            >
              <Table size="small" aria-label="contract history" sx={{ minWidth: 720 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Year</TableCell>
                    <TableCell>Team</TableCell>
                    <TableCell align="right">Years</TableCell>
                    <TableCell align="right">Value</TableCell>
                    <TableCell align="right">APY</TableCell>
                    <TableCell align="right">Guaranteed</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {contractRows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell>{row.yearSigned || '—'}</TableCell>
                      <TableCell>{row.team || '—'}</TableCell>
                      <TableCell align="right">{row.years || '—'}</TableCell>
                      <TableCell align="right">{formatCurrency(row.value) || '—'}M</TableCell>
                      <TableCell align="right">{formatCurrency(row.apy) || '—'}M</TableCell>
                      <TableCell align="right">{formatCurrency(row.guaranteed) || '—'}M</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContractsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
