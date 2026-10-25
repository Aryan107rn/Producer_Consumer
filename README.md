# Last Circle — Producer–Consumer OS Simulator

An interactive top-down battle royale arena and an inspectable producer–consumer synchronization lab. Game input and Canvas rendering stay responsive while a separate scheduler processes game events through a bounded FIFO buffer.

## Run locally

```sh
npm run dev
```

Open `http://localhost:4173`. The app uses browser-native JavaScript modules and Node's built-in static server, so it has no package installation step or external runtime dependencies. Set `PORT=8080` to choose a different port.

## Deploy to Vercel

This project is configured as a static site; Vercel serves `index.html` and the files in `src/` directly. No serverless functions or build step are required.

1. Import this repository into Vercel and set the project root to the repository root.
2. Keep the framework preset as **Other**. The checked-in `vercel.json` disables the build command and sets the project root as the static output directory.
3. Deploy. Vercel will serve the site at the deployment URL; subsequent pushes to the connected Git branch trigger new deployments.

You can also deploy from the repository root with the Vercel CLI:

```sh
npx vercel
```

Use `npx vercel --prod` to deploy directly to production.

## Play and demonstrate

1. Press **Start battle**. Move with **WASD** or arrow keys, aim with the mouse, hold left click to shoot, and press **R** to reload. Pickups restore health or ammunition. Rocks block player and bot movement. The orange safe zone contracts and damages players outside it.
2. Keep the consumer paused while moving and shooting. Watch events fill the five or eight slot buffer; additional producer events wait in a pending list when it is full.
3. Press **Step operation** repeatedly. Observe FIFO removal, mutex acquisition, critical-section entry, shared-state update, exit, and mutex release. The explanation panel describes each operation.
4. Run the consumer continuously, change scheduler speed, and inspect the log by process or event ID. Click a log row to see the event payload and its lifecycle. Export the log as CSV.
5. Use **Reproduce lost update** to see two processes read the same isolated race-lab counter and overwrite one increment. Use **Safe comparison** to see the mutex serialize the next two increments.
6. Pause the match with **Space** or the button. Use **Restart** to reset gameplay and synchronization state.

## Architecture and correctness

- `src/game.js` owns the Canvas arena, provisional player controls, bots, projectiles, collisions, pickups, obstacles, and zone. Game actions submit typed event objects to the producer.
- `src/engine.js` owns the bounded buffer, producer backlog, FIFO consumer scheduler, mutex lifecycle, authoritative game state, bounded logs, measurements, and isolated race lab. It has no React dependency and calls a render callback after state changes.
- `src/main.js` connects the engines to the UI and controls. `src/style.css` contains the responsive dark dashboard styling.
- `empty = capacity - buffer.length`, `full = buffer.length`, so `0 ≤ full, empty ≤ capacity` and `empty + full = capacity` always hold. Pending producer events are not counted as buffer slots and are never dropped.
- Only the consumer owns the simulated mutex while applying queued game updates. Each teaching step advances exactly one scheduler operation. The race lab is deliberately isolated from match health, score, eliminations, and counters.
- This is a single-threaded JavaScript model of process scheduling and mutual exclusion, not real OS threads or a native mutex. Player position, bot damage, and visuals are provisional gameplay state for responsiveness; queued events update the dashboard's authoritative shared counters and health.
- Latency is measured from event creation until processing completion. Throughput is the measured number of inserted or processed events divided by elapsed time since reset, shown as events per minute. The occupancy chart samples actual buffer measurements. Logs and histories are bounded.

## Verification

Run the synchronization engine checks with:

```sh
npm test
```

The checks cover semaphore invariants, full-buffer producer blocking and FIFO promotion, empty-buffer consumer blocking, staged mutex ownership, restart, and the controlled lost-update demonstration. Browser controls and Canvas rendering still need an interactive browser session for a full visual check.
