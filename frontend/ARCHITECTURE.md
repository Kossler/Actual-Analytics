# Frontend Architecture Documentation

## Overview

The Actual NFL Analytics frontend has been refactored to follow modern React best practices with a component-based architecture. This makes the codebase more maintainable, testable, and easier to extend with new features.

## Project Structure

```
frontend/
├── pages/              # Next.js pages (routing)
│   ├── _app.js         # App wrapper with providers
│   ├── _document.js    # HTML document wrapper
│   ├── index.js        # Main page (refactored)
│   └── index-old.js    # Backup of original implementation
├── components/         # Reusable UI components
│   ├── Header.js
│   ├── SearchBar.js
│   ├── PlayerInfo.js
│   ├── StatsTableWrapper.js
│   ├── WeeklyStatsTable.js
│   ├── YearlyStatsTable.js
│   └── AdvancedMetricsTable.js
├── hooks/              # Custom React hooks
│   └── usePlayerData.js
├── utils/              # Utility functions
│   └── statsUtils.js
├── theme/              # Theme configuration
│   └── theme.js
├── styles/             # Global styles
│   └── globals.css
└── public/             # Static assets
```

## Architecture Principles

### 1. **Component-Based Design**
- Each UI section is a separate, reusable component
- Components are self-contained and focused on a single responsibility
- Easy to test, modify, and reuse across the application

### 2. **Custom Hooks for Data**
- Data fetching logic is abstracted into custom hooks
- Promotes code reuse and cleaner component code
- Hooks handle loading states, errors, and data transformations

### 3. **Utility Functions**
- Common calculations and formatting logic lives in utility files
- Prevents code duplication
- Makes testing easier

### 4. **Centralized Theme**
- All styling decisions are in one place (`theme/theme.js`)
- Consistent design system across the app
- Easy to rebrand or adjust colors/spacing

## Key Files

### `pages/index.js`
The main application orchestrator. This file:
- Manages high-level state (selected player, search query)
- Uses custom hooks to fetch data
- Renders components in the correct order
- **~120 lines** (down from 916 lines!)

### `components/`

#### `Header.js`
- Displays the app logo and title
- Responsive sizing for mobile/tablet/desktop

#### `SearchBar.js`
- Autocomplete player search
- Filters and displays top 10 results
- Handles player selection

#### `PlayerInfo.js`
- Shows selected player details
- Position badge with color coding

#### `StatsTableWrapper.js`
- Reusable wrapper for all stat tables
- Handles loading states and empty data
- Provides consistent styling and scrollbars

#### `WeeklyStatsTable.js`
- Displays week-by-week stats for current season
- Conditionally shows columns based on position

#### `YearlyStatsTable.js`
- Shows season-aggregated statistics
- Highlights current season (2025)

#### `AdvancedMetricsTable.js`
- Displays EPA and success rate metrics
- Position-specific column visibility

### `hooks/usePlayerData.js`

Custom hooks for data fetching:

- `useAllPlayers()` - Fetches all players
- `usePlayerStats()` - Fetches player stats with loading state
- `useWeeklyStats()` - Fetches weekly stats for a season
- `useAdvancedMetrics()` - Fetches advanced metrics
- `useBackgroundImage()` - Manages background image randomization

### `utils/statsUtils.js`

Utility functions for:
- **Formatting**: `formatNumber()`, `formatPercentage()`, `formatYards()`
- **Calculations**: `calculateCompletionPercentage()`, `formatEPA()`
- **Position Logic**: `shouldShowPassingColumns()`, `shouldShowRushingColumns()`, `shouldShowReceivingColumns()`
- **Data Processing**: `groupStatsBySeason()`, `sortWeeklyStats()`

### `theme/theme.js`

Centralized Material-UI theme configuration:
- Color palette (dark mode)
- Typography settings
- Component overrides (Cards, Tables, Buttons, etc.)
- Glassmorphism effects
- Responsive breakpoints

## Adding New Features

### Adding a New Stat Table

1. **Create the component** in `components/`:

```javascript
// components/NewStatsTable.js
import StatsTableWrapper from './StatsTableWrapper';
import { TableHead, TableBody, TableRow, TableCell } from '@mui/material';

export default function NewStatsTable({ data, loading }) {
  return (
    <StatsTableWrapper
      title="New Stats"
      subtitle="Description"
      loading={loading}
      dataLength={data.length}
    >
      <TableHead>
        {/* Your table headers */}
      </TableHead>
      <TableBody>
        {/* Your table rows */}
      </TableBody>
    </StatsTableWrapper>
  );
}
```

2. **Import and use** in `pages/index.js`:

```javascript
import NewStatsTable from '../components/NewStatsTable';

// In the component:
<NewStatsTable data={someData} loading={someLoading} />
```

### Adding a New Data Hook

1. **Create the hook** in `hooks/usePlayerData.js`:

```javascript
export function useNewData(playerId, apiUrl) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!playerId || !apiUrl) return;

    setLoading(true);
    fetch(`${apiUrl}/api/players/${playerId}/newdata`)
      .then(r => r.json())
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [playerId, apiUrl]);

  return { data, loading, error };
}
```

2. **Use in `pages/index.js`**:

```javascript
const { data: newData, loading: newLoading } = useNewData(selectedPlayer?.id, apiUrl);
```

### Adding a New Utility Function

Add to `utils/statsUtils.js`:

```javascript
/**
 * Your new utility function
 * @param {type} param - Description
 * @returns {type} Description
 */
export function yourNewFunction(param) {
  // Your logic
  return result;
}
```

## Styling Guidelines

### Using the Theme

Always use theme values instead of hardcoded colors:

```javascript
// ✅ Good
sx={{ color: 'primary.main', bgcolor: 'background.paper' }}

// ❌ Bad
sx={{ color: '#1976d2', bgcolor: '#151b2d' }}
```

### Responsive Design

Use Material-UI breakpoints for responsive styling:

```javascript
sx={{
  fontSize: { xs: '1rem', sm: '1.25rem', md: '1.5rem' },
  padding: { xs: 2, md: 4 }
}}
```

Breakpoints:
- `xs`: 0px+ (mobile)
- `sm`: 600px+ (tablet)
- `md`: 960px+ (small desktop)
- `lg`: 1280px+ (desktop)
- `xl`: 1920px+ (large desktop)

## Performance Considerations

### Data Fetching
- Custom hooks automatically prevent unnecessary re-fetches
- Data is cached by React during the component lifecycle
- Consider adding React Query for more advanced caching

### Component Re-renders
- Components only re-render when their props change
- Use `React.memo()` for expensive components if needed
- Search is optimized with debouncing (10 result limit)

## Testing Strategy

### Component Testing
Each component can be tested in isolation:

```javascript
import { render, screen } from '@testing-library/react';
import Header from '../components/Header';

test('renders header', () => {
  render(<Header />);
  expect(screen.getByText('Actual NFL Analytics')).toBeInTheDocument();
});
```

### Hook Testing
Use `@testing-library/react-hooks` to test custom hooks

### Utility Testing
Pure functions in `utils/` are easy to test:

```javascript
import { formatNumber } from '../utils/statsUtils';

test('formats numbers correctly', () => {
  expect(formatNumber(123.456, 1)).toBe('123.5');
  expect(formatNumber(null)).toBe('-');
});
```

## Future Improvements

### Recommended Enhancements

1. **TypeScript Migration**
   - Add type safety
   - Better IDE support
   - Catch errors at compile time

2. **React Query Integration**
   - Advanced caching
   - Background refetching
   - Optimistic updates

3. **Error Boundaries**
   - Graceful error handling
   - Better user experience

4. **Unit Tests**
   - Jest + React Testing Library
   - Component tests
   - Hook tests
   - Utility tests

5. **Storybook**
   - Component documentation
   - Visual testing
   - Design system showcase

6. **Performance Monitoring**
   - React Profiler
   - Bundle size analysis
   - Lighthouse scores

7. **Accessibility (a11y)**
   - ARIA labels
   - Keyboard navigation
   - Screen reader support

8. **Dark/Light Mode Toggle**
   - User preference
   - System preference detection

## Troubleshooting

### Common Issues

**Issue**: Components not rendering
- Check if data is being fetched correctly
- Verify API URL is correct
- Check browser console for errors

**Issue**: Styling looks wrong
- Clear `.next` cache: `rm -rf .next`
- Restart dev server
- Check theme imports

**Issue**: TypeScript errors (if migrated)
- Run `npm run type-check`
- Check type definitions

## Migration from Old Code

The original `index.js` is backed up as `index-old.js`. Key differences:

| Old | New |
|-----|-----|
| 916 lines in one file | ~120 lines + modular components |
| Inline data fetching | Custom hooks |
| Repeated logic | Utility functions |
| Hardcoded theme | Centralized theme file |
| Difficult to test | Easy to test |
| Hard to extend | Easy to extend |

## Getting Help

- Check component documentation in comments
- Review utility function JSDoc comments
- See Material-UI docs: https://mui.com/
- Next.js docs: https://nextjs.org/docs

## Contributing

When adding new features:

1. Create components in `components/`
2. Add hooks in `hooks/`
3. Add utilities in `utils/`
4. Update this README
5. Add comments/JSDoc
6. Test locally before committing

---

**Last Updated**: November 17, 2025
**Version**: 2.0.0 (Refactored Architecture)
