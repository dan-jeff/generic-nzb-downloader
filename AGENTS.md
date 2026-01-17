# Agent Guidelines for Generic NZB Downloader

This repository contains a generic NZB downloader application built with Electron, Vite, React, and TypeScript. It supports both Desktop (Electron) and Mobile (Capacitor/Android) targets.

## Build and Run Commands

### Development
- **Web/Renderer Dev**: `npm run dev`
  - Starts the Vite development server for the React application.
- **Electron Dev**: `npm run electron:dev`
  - Runs the Electron application in development mode with hot reloading.
  - Concurrently runs Vite, TypeScript watcher for Electron, and the Electron process.
- **Android Dev**: `npm run dev:android`
  - Runs the full Android build pipeline:
    1. `npm run build`: Builds the React web application.
    2. `npx cap sync android`: Syncs web assets to the Android native project.
    3. `npx cap build android`: Builds the native Android apk.

### Production Build
- **Web App**: `npm run build`
  - Builds the React application using Vite. Output: `dist/`.
- **Electron Main**: `npm run build:electron`
  - Compiles the Electron main process TypeScript code.
- **Electron App (Linux)**: `npm run electron:build:linux`
  - Builds the Linux application (AppImage, deb).
- **Electron App (Windows)**: `npm run electron:build:win`
  - Builds the Windows application (NSIS installer).
- **Electron App (All)**: `npm run electron:build`
  - Builds for the current platform.

### Testing
- **Status**: There are currently no automated tests configured in the `scripts` section.
- **Action**: When adding features, consider adding unit tests. If asked to run tests, inform the user that no test framework is currently set up.

## Code Style & Conventions

### Language & Syntax
- **TypeScript**: Use strict mode (enabled in `tsconfig.json`).
- **Indentation**: 2 spaces.
- **Quotes**: Single quotes `''` for strings.
- **Semicolons**: Always use semicolons.

### Imports
- **Extensions**: **CRITICAL**: Local imports in the `src` or `electron` folders MUST include the `.js` extension to ensure compatibility with ESM in Node/Electron environments.
  - Correct: `import { Foo } from './Foo.js';`
  - Incorrect: `import { Foo } from './Foo';`
- **Aliases**: Use path aliases defined in `tsconfig.json`:
  - `@/*` -> `./src/*`
  - `@core/*` -> `./src/core/*`

### Naming
- **Files**: PascalCase for React components (e.g., `DownloadManager.tsx`), camelCase for utilities (e.g., `format.ts`).
- **Classes/Interfaces**: PascalCase (e.g., `DownloadManager`, `IStorage`).
- **Variables/Functions**: camelCase (e.g., `downloadDirectory`, `initializeNewsreaders`).

### React Components
- Use Functional Components with Hooks.
- Prefer styled-components or CSS modules over inline styles unless necessary.
- Use explicit types for props: `interface Props { ... }`.

### Error Handling
- Use `try/catch` blocks for async operations.
- Throw `Error` objects with descriptive messages.
- Log errors using `console.error` for debugging purposes.

### Project Structure
- `/src`: React Renderer process code.
  - `/src/core`: Core logic shared between platforms.
  - `/src/mobile`: Mobile-specific adapters/utilities.
  - `/src/hooks`: React hooks.
- `/electron`: Electron Main process code.
- `/dist`: Vite build output.
- `/dist-electron`: Electron build output.

## Environment & Platform
- **Cross-Platform**: Code should be mindful of running in both Electron (Node.js access) and Mobile/Web (Browser environment).
- **Adapters**: Use the Adapter pattern (e.g., `IFileSystem`, `IStorage`, `INetwork`) to abstract platform-specific functionality.
