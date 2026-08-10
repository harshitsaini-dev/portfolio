@echo off
REM Stops the portfolio dev servers: kills whatever is LISTENING on ports
REM 3000 (web) and 3001 (admin), then any stray workerd.exe - miniflare's
REM runtime, which can linger after a wedged dev server and hold the local
REM database state open.

for %%P in (3000 3001) do (
    for /f "tokens=5" %%I in ('netstat -ano ^| findstr /r /c:":%%P .*LISTENING"') do (
        taskkill /F /PID %%I >nul 2>&1
    )
)

taskkill /F /IM workerd.exe >nul 2>&1

echo Stopped the portfolio dev servers.
exit /b 0
