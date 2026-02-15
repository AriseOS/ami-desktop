@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM Quick start script for Ami Desktop App - Electron (Windows)

REM Parse arguments
SET "USE_LOCAL_CLOUD=false"
FOR %%A IN (%*) DO (
    IF "%%A"=="--local" (
        SET "USE_LOCAL_CLOUD=true"
    )
)

REM Ensure daemon sees local cloud setting before it starts
IF "%USE_LOCAL_CLOUD%"=="true" (
    SET "APP_BACKEND_CLOUD_API_URL=http://localhost:9090"
)

REM Logging + daemon health check configuration
set "AMI_LOG_DIR=%USERPROFILE%\.ami\logs"
if not exist "%AMI_LOG_DIR%" mkdir "%AMI_LOG_DIR%" >nul 2>&1
set "DAEMON_BOOT_LOG=%AMI_LOG_DIR%\daemon-boot.log"
set "DAEMON_HOST=127.0.0.1"
set "DAEMON_DEFAULT_PORT=8765"
set "DAEMON_HEALTH_PATH=/api/v1/health"
set "DAEMON_PORT_FILE=%USERPROFILE%\.ami\daemon.port"
set "DAEMON_TIMEOUT_SECONDS=12"

REM Resolve project root from script location
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "PROJECT_ROOT=%%~fI"

echo.
echo Starting Ami Desktop App...
IF "%USE_LOCAL_CLOUD%"=="true" (
    echo    Mode: Using LOCAL Cloud Backend (http://localhost:9090^)
) ELSE (
    echo    Mode: Using REMOTE Cloud Backend
)
echo.

REM Check if node_modules exists
IF NOT EXIST "%PROJECT_ROOT%\node_modules" (
    echo Installing dependencies...
    pushd "%PROJECT_ROOT%"
    call npm install
    popd
)

REM Start the app in development mode
echo Starting Electron app (Development Mode)...
echo    AMI_DEV_MODE=1 -^> Using TypeScript daemon (tsx)

echo.

REM Set environment variables and run
pushd "%PROJECT_ROOT%"
IF "%USE_LOCAL_CLOUD%"=="true" (
    echo    APP_BACKEND_CLOUD_API_URL=http://localhost:9090
    echo.
    set AMI_DEV_MODE=1
    set APP_BACKEND_CLOUD_API_URL=http://localhost:9090
    call npm run electron:dev
) ELSE (
    echo.
    set AMI_DEV_MODE=1
    call npm run electron:dev
)
popd

goto :EOF
