@echo off
REM Restarts the portfolio dev servers: STOP, a short pause so the ports are
REM actually released, then START. Use this when a page 500s after a
REM packages/ui change - Turbopack caches failed package resolutions and only
REM a fresh server forgets them (see docs/DECISIONS.md).

call "%~dp0STOP.BAT"
REM ~3 second pause. `ping` rather than `timeout`: timeout needs an
REM interactive console and dies with "Input redirection is not supported"
REM when this script is run by a tool or scheduler.
ping -n 4 127.0.0.1 >nul
call "%~dp0START.BAT"
exit /b 0
