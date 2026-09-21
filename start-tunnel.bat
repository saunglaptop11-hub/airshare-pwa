@echo off
title AirShare Cloudflare Tunnel
echo ==============================================
echo   Memulai Cloudflare Tunnel untuk AirShare...
echo ==============================================
echo.
.\cloudflared.exe tunnel --url http://localhost:5173
pause
