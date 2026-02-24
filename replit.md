# PoultryScale - Poultry Farm Weight Tracker

## Overview
Mobile application for recording bird weight measurements during poultry selling day. Built with Expo + React Native (TypeScript).

## Architecture
- **Frontend**: Expo Router (file-based routing), React Native
- **Backend**: Express.js (serves landing page + API placeholder)
- **Storage**: AsyncStorage for local data persistence
- **State**: useState for local state, no global state needed
- **Fonts**: Outfit (Google Fonts)

## Project Structure
```
app/
  _layout.tsx        - Root layout with fonts, providers
  index.tsx          - Home screen (sales history + FAB)
  measurement.tsx    - Core measurement screen (weight input, row list)
  report.tsx         - Report summary screen (save to history)
  +not-found.tsx     - 404 handler

lib/
  types.ts           - TypeScript interfaces (MeasurementRow, SaleRecord)
  storage.ts         - AsyncStorage CRUD for sales data
  utils.ts           - Formatting utilities (weight, time, date)
  useTheme.ts        - Theme hook (dark/light mode)
  query-client.ts    - React Query client setup

constants/
  colors.ts          - Theme colors (light + dark, earthy green/gold palette)

components/
  ErrorBoundary.tsx  - Error boundary wrapper
  ErrorFallback.tsx  - Error fallback UI

server/
  index.ts           - Express server
  routes.ts          - API routes
  storage.ts         - Server-side storage
```

## App Flow
1. **Home** - View sales history, tap FAB (+) to start new measurement
2. **Measurement** - Add weight rows (KG + PCS), see live totals, end measurement
3. **Report** - View summary, save to history, return to home

## Key Features
- Live weight calculation as rows are added
- Auto-updating relative timestamps on rows
- Dark/Light mode support
- Confirmation dialogs before destructive actions
- Delete last row, delete sales from history
- Data persists across app restarts via AsyncStorage

## Dependencies
- expo-crypto (UUIDs), expo-haptics (feedback)
- @expo-google-fonts/outfit (typography)
- @react-native-async-storage/async-storage (persistence)
- react-native-reanimated (animations)
- react-native-keyboard-controller (keyboard handling)

## Ports
- Frontend: 8081 (Expo dev server)
- Backend: 5000 (Express)
