# Ami Desktop App

Desktop application for Ami — AI-powered browser automation agent.

## Tech Stack

- **Frontend**: React 18 + Vite + Zustand
- **Desktop Runtime**: Electron 33
- **Backend Daemon**: Node.js + Express + TypeScript
- **Browser Automation**: Playwright (connects to Electron's Chromium via CDP)

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
# Install frontend dependencies
npm install

# Install daemon dependencies
cd daemon-ts
npm install
```

### Run in Development Mode

```bash
# Quick start (macOS)
./scripts/run_desktop_app.sh

# Or manually
npm run electron:dev
```

### Build for Production

```bash
# macOS
./scripts/build_app_macos.sh

# Windows (PowerShell)
.\scripts\build_app_windows.ps1
```

## Project Structure

```
ami-desktop/
├── electron/          # Electron main process
├── daemon-ts/         # TypeScript daemon (Express + Playwright)
├── src/               # React frontend
├── icons/             # App icons
├── scripts/           # Build and run scripts
├── docs/              # Design documents
├── .github/           # CI/CD workflows
├── package.json       # Frontend manifest
├── electron-builder.json
├── vite.config.js
└── index.html
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AMI_DEV_MODE` | Enable dev mode (tsx daemon) | - |
| `APP_BACKEND_CLOUD_API_URL` | Cloud backend URL | Production URL |
| `BROWSER_CDP_PORT` | CDP port (auto-detected) | - |
