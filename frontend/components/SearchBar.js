import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, Box, TextField, Autocomplete, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import { formatPlayerLabel } from '../utils/statsUtils';

/**
 * SearchBar component for player search
 * @param {object} selectedPlayer - Currently selected player
 * @param {function} onSelectPlayer - Callback when a player is selected
 * @param {string} searchQuery - Current search query
 * @param {function} onSearchChange - Callback when search query changes
 */
export default function SearchBar({ 
  selectedPlayer, 
  onSelectPlayer, 
  searchQuery, 
  onSearchChange 
}) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef();
  // Focus input on mount for better UX
  useEffect(() => {
    const input = document.querySelector('input[placeholder="Search for a player..."]');
    if (input) input.focus();
  }, []);

  // Fetch players from API as user types
  useEffect(() => {
    if (!searchQuery) {
      setPlayers([]);
      return;
    }
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
      fetch(`${apiBase}/api/players/search?q=${encodeURIComponent(searchQuery)}`)
        .then((res) => res.json())
        .then((data) => {
          setPlayers(Array.isArray(data) ? data : []);
          setLoading(false);
        })
        .catch(() => {
          setPlayers([]);
          setLoading(false);
        });
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery]);

  return (
    <Card sx={{ mb: 4 }}>
      <CardContent>
        <Box sx={{ maxWidth: '600px' }}>
          <Autocomplete
            options={players}
            getOptionLabel={formatPlayerLabel}
            filterOptions={(options, state) => options}
            value={null}
            loading={loading}
            slotProps={{
              listbox: {
                sx: (theme) => {
                  const thumb = alpha(theme.palette.primary.main, 0.45);
                  const thumbHover = alpha(theme.palette.primary.main, 0.65);

                  return {
                    // Firefox
                    scrollbarWidth: 'thin',
                    scrollbarColor: `${thumb} transparent`,

                    // Chromium/Safari
                    '&::-webkit-scrollbar': {
                      width: 10,
                    },
                    '&::-webkit-scrollbar-button, &::-webkit-scrollbar-button:single-button': {
                      width: 0,
                      height: 0,
                      backgroundColor: 'transparent',
                      backgroundImage: 'none',
                      display: 'none',
                    },
                    '&::-webkit-scrollbar-track': {
                      backgroundColor: 'transparent',
                    },
                    '&::-webkit-scrollbar-thumb': {
                      backgroundColor: thumb,
                      borderRadius: 999,
                      border: `3px solid ${theme.palette.background.paper}`,
                      backgroundClip: 'padding-box',
                    },
                    '&::-webkit-scrollbar-thumb:hover': {
                      backgroundColor: thumbHover,
                    },
                  };
                },
              },
              paper: {
                sx: (theme) => {
                  const thumb = alpha(theme.palette.primary.main, 0.45);
                  const thumbHover = alpha(theme.palette.primary.main, 0.65);

                  return {
                    // In some browsers the scrolling element is the Paper, not the listbox.
                    scrollbarWidth: 'thin',
                    scrollbarColor: `${thumb} transparent`,
                    '&::-webkit-scrollbar': {
                      width: 10,
                    },
                    '&::-webkit-scrollbar-button, &::-webkit-scrollbar-button:single-button': {
                      width: 0,
                      height: 0,
                      backgroundColor: 'transparent',
                      backgroundImage: 'none',
                      display: 'none',
                    },
                    '&::-webkit-scrollbar-track': {
                      backgroundColor: 'transparent',
                    },
                    '&::-webkit-scrollbar-thumb': {
                      backgroundColor: thumb,
                      borderRadius: 999,
                      border: `3px solid ${theme.palette.background.paper}`,
                      backgroundClip: 'padding-box',
                    },
                    '&::-webkit-scrollbar-thumb:hover': {
                      backgroundColor: thumbHover,
                    },
                  };
                },
              },
            }}
            onChange={(event, newValue) => {
              if (!newValue) return;
              if (!newValue.gsis_id) {
                console.warn('Selected player is missing a gsis_id:', newValue);
                return;
              }

              // Prefer parent-controlled selection (avoids full page reload).
              if (typeof onSelectPlayer === 'function') {
                onSelectPlayer(newValue);
              } else {
                window.location.href = `/players/${newValue.gsis_id}`;
              }
              onSearchChange('');
            }}
            inputValue={searchQuery}
            onInputChange={(event, newInputValue) => {
              onSearchChange(newInputValue);
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Search for a player..."
                variant="outlined"
                size="medium"
                InputProps={{
                  ...params.InputProps,
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'primary.main' }} />,
                }}
              />
            )}
            renderOption={(props, option) => {
              // Extract key from props and pass it directly
              const { key, ...rest } = props;
              return (
                <Box
                  key={key}
                  {...rest}
                  component="li"
                >
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {option.display_name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {option.position} • {option.team_name || option.latest_team}
                    </Typography>
                  </Box>
                </Box>
              );
            }}
            noOptionsText={searchQuery ? "No players found" : "Type to search players"}
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
              },
            }}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
