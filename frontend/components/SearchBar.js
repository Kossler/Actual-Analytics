import { useEffect } from 'react';
import { Card, CardContent, Box, TextField, Autocomplete, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { formatPlayerLabel } from '../utils/statsUtils';

/**
 * SearchBar component for player search
 * @param {Array} players - List of all players
 * @param {object} selectedPlayer - Currently selected player
 * @param {function} onSelectPlayer - Callback when a player is selected
 * @param {string} searchQuery - Current search query
 * @param {function} onSearchChange - Callback when search query changes
 */
export default function SearchBar({ 
  players, 
  selectedPlayer, 
  onSelectPlayer, 
  searchQuery, 
  onSearchChange 
}) {
  // Focus input on mount for better UX
  useEffect(() => {
    const input = document.querySelector('input[placeholder="Search for a player..."]');
    if (input) input.focus();
  }, []);

  return (
    <Card sx={{ mb: 4 }}>
      <CardContent>
        <Box sx={{ maxWidth: '600px' }}>
          <Autocomplete
            options={players}
            getOptionLabel={formatPlayerLabel}
            filterOptions={(options, state) => options}
            value={null}
            onChange={(event, newValue) => {
              if (newValue && newValue.gsis_id) {
                window.location.href = `/players/${newValue.gsis_id}`;
                onSearchChange('');
              } else if (newValue) {
                console.warn('Selected player is missing a gsis_id:', newValue);
              }
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
