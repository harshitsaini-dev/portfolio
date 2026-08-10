@echo off
REM Starts BOTH dev servers with the LOCAL database (miniflare state under
REM .wrangler/state) - web on http://localhost:3000, admin on
REM http://localhost:3001. Safe to run twice: if something is already
REM listening on port 3000 it assumes the servers are up and does nothing.
REM
REM The servers run in one minimized window titled "portfolio-dev".
REM Use STOP.BAT to stop them, RESTART.BAT to bounce them.

cd /d "%~dp0"

netstat -ano | findstr /r /c:":3000 .*LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo Already running:
    echo   web    http://localhost:3000
    echo   admin  http://localhost:3001
    exit /b 0
)

start "portfolio-dev" /min cmd /c "pnpm dev"
echo Starting the portfolio dev servers with LOCAL data...
echo   web    http://localhost:3000
echo   admin  http://localhost:3001
echo First page load compiles on demand - give it 20-30 seconds.
exit /b 0
