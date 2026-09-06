# Fleet Ops: Logistic Truck Route Visualizer

Fleet Ops is a React + TypeScript route simulation dashboard for logistics operations. It visualizes truck movement on an interactive map, tracks deliveries across multiple stops, and surfaces live telemetry such as ETA, route progress, speed, and vehicle status.

The app supports both single-route playback and multi-vehicle fleet mode, plus a custom route builder powered by map click waypoints.

## Demo

- Watch the demo video: https://drive.google.com/file/d/1KC-PBTssqaaPqYrzN7Q9qVhlBOYt7iWf/view?usp=sharing

## What This Project Does

- Simulates truck movement across preconfigured delivery routes
- Renders routes and stops on a Leaflet map with progress visualization
- Shows live telemetry (speed, bearing, distance covered, remaining distance, ETA)
- Displays vehicle system indicators (RPM, engine temperature, fuel estimate)
- Tracks cargo delivery status by stop
- Logs dispatch events and traffic advisories
- Supports custom route creation by placing waypoints on the map
- Supports fleet mode for concurrent visualization of multiple trucks

## Core Features

### 1) Preset Routes

Three prebuilt routes are included:

- RT-4471: East Bay Corridor
- RT-2290: SF Mission Run
- RT-6650: Silicon Valley Express

Each route includes:

- Stop list (origin + delivery points)
- Driver and vehicle metadata
- Cargo manifest per stop
- Route color and leg distances

### 2) Custom Route Builder

- Enable builder mode from the ROUTES panel
- Click the map to place waypoints
- Use Undo/Clear controls to edit waypoints
- Simulate the route after placing at least two waypoints
- Attempts OSRM street routing first
- Falls back to direct line routing if OSRM is unavailable

### 3) Fleet Mode

- Toggle from SINGLE to FLEET mode
- Simulates all preset routes in parallel
- Displays per-truck progress, current leg, driver, and vehicle
- Draws each fleet route and truck marker in distinct colors

### 4) Live Operations UI

- Live map overlays (active trail, completed path, pending path)
- Delivery geofences with next-stop highlighting
- Sidebar tabs: LIVE, ROUTES, LOGS
- Playback controls with simulation speed multipliers
- Fullscreen map mode and follow-truck mode
- Keyboard shortcuts for quick control

### 5) Persistent Session State

The app stores the following in localStorage:

- Active route
- Progress
- Playback rate
- Sidebar tab
- Custom waypoints

Storage key: fleet-ops-v2

## Tech Stack

- React 19
- TypeScript 5.7 (strict mode)
- Vite 8
- Tailwind CSS v4
- Leaflet 1.9

## Project Structure

- index.html: Vite HTML shell with Figma placeholder slots
- src/main.tsx: React entrypoint and stylesheet imports
- src/App.tsx: Main application logic, simulation engine, and UI components
- src/index.css: Theme variables, global styles, and Leaflet overrides
- src/imports/: Project image assets
- vite.config.ts: Vite config + Figma Make integration plugins
- tsconfig.json: TypeScript compiler settings
- .mise.toml: Node and pnpm toolchain versions

## How Simulation Works

### Route Data Source

- Preset routes start with embedded leg coordinates
- The app optionally fetches street-accurate geometry from the OSRM public API
- If OSRM fails for custom routes, it computes direct waypoint segments

### Motion and Progress

- Distances are computed using the Haversine formula
- The app builds cumulative distance arrays for interpolation
- Truck position is interpolated along the route based on normalized progress
- Playback speed is derived from:

  simulated_distance = speed_kmh * rate * delta_time

### Live Events

- Delivery confirmations fire when a stop boundary is crossed
- Approaching-stop alerts fire near the next destination
- Periodic traffic advisory events are injected while route playback is active

## Getting Started

### Prerequisites

- Node.js 22
- pnpm 10.34.3

If you use mise, versions are already defined in .mise.toml.

### Install

```bash
pnpm install
```

### Run Development Server

```bash
pnpm dev
```

Default host/port (from Vite config):

- Host: 0.0.0.0
- Port: 8443 (or value from PORT environment variable)

### Build for Production

```bash
pnpm build
```

### Preview Production Build

```bash
pnpm preview
```

### Format

```bash
pnpm format
```

## Keyboard Shortcuts

- Space: Play/Pause
- R: Reset current route
- F: Toggle map fullscreen

## Figma Make Integration Note

This project includes Figma Make specific Vite behavior and imports configuration from:

- .figma/make/site.json

If that file is missing, Vite can fail during startup/build because vite.config.ts imports it directly.

When moving this project to another GitHub repository, make sure to do one of the following:

1. Keep the .figma folder available in environments where you run dev/build.
2. Refactor vite.config.ts to make the Figma config optional.

## Known Limitations

- OSRM uses a public endpoint and may be rate-limited or temporarily unavailable.
- Telemetry values are simulated, not sourced from live hardware.
- No backend persistence or authentication is included.

## Future Improvements

- Add a backend for route/event persistence
- Add historical playback and route analytics
- Add unit/integration tests for route math and state transitions
- Add CSV/JSON import for route and cargo data

## License

No license file is currently included in this repository.
