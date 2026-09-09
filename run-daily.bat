@echo off
title Quarry Studio — All Channels
cd /d "C:\Users\Revnix\Documents\youtube-automation"
echo ════════════════════════════════════════
echo   QUARRY STUDIO — ALL CHANNELS
echo   Started: %date% %time%
echo ════════════════════════════════════════
node run-all-channels.mjs
echo.
echo ════════════════════════════════════════
echo   DONE — %date% %time%
echo ════════════════════════════════════════
pause
