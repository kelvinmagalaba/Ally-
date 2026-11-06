@echo off
REM ============================================================
REM   Gas Delivery App — Windows one-click starter
REM
REM   Double-click this file to start BOTH the backend and the
REM   frontend in separate windows. Closing either window stops
REM   that server. Closing this launcher does nothing — the two
REM   servers keep running.
REM ============================================================

echo.
echo  Starting backend  (Node + Express + MySQL) ...
start "Gas App - Backend (port 5000)" cmd /k "cd /d %~dp0backend && npm start"

REM Give the backend a head start so the frontend's first health
REM check finds it already up.
timeout /t 4 /nobreak >nul

echo  Starting frontend (Vite + React)         ...
start "Gas App - Frontend (port 8080)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo  Both servers launching. Two new windows will open.
echo.
echo  When ready, open:   http://localhost:8080
echo.
echo  To use on your phone over the same Wi-Fi, look at the
echo  backend window for the "Network: http://192.168.x.x:5000"
echo  line, set that as VITE_API_URL in frontend\.env, then
echo  refresh.
echo.
pause
