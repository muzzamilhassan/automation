@echo off
title 🚀 Multi-Brand Content Machine Launcher
color 0A
cls
echo ================================================================
echo        AUTONOMOUS VALUE-DENSE CONTENT MACHINE LAUNCHER
echo ================================================================
echo.
echo  [1] Trigger Single Scheduled Rotation (via n8n Webhook)
echo  [2] Publish All 5 Facebook Pages + Instagram (Full Batch)
echo  [3] Publish Single Brand on Demand (Select 1 to 5)
echo  [4] Publish 🏆 Earned Achievement Milestone Reel
echo  [5] Publish ✍️ Highlight Text Posts on All 5 Pages
echo  [6] Exit
echo.
echo ================================================================
set /p choice="Enter your choice (1-6): "

if "%choice%"=="1" goto N8N_FIRE
if "%choice%"=="2" goto ALL_PAGES
if "%choice%"=="3" goto SELECT_PAGE
if "%choice%"=="4" goto ACHIEVEMENT_REEL
if "%choice%"=="5" goto TEXT_POSTS
if "%choice%"=="6" exit

:N8N_FIRE
echo.
echo [1/1] Firing Content Machine Webhook...
curl -s -X POST http://localhost:5678/webhook/category-post -H "Content-Type: application/json" -d "{}"
echo.
echo   ✓ Webhook Fired! Your Photo Post, Reel, Story, Instagram, and TikTok post will be published in 2-3 minutes.
echo   Check your Facebook, Instagram, and TikTok profiles shortly.
echo.
pause
exit

:ALL_PAGES
echo.
echo [1/5] Launching Full 5-Brand Multi-Format Engine (Photo + Reel + Story + Groups)...
node -e "
const { execSync } = require('child_process');
for (let i = 0; i < 5; i++) {
  console.log('\n>>> EXECUTING BRAND ' + (i+1) + ' OF 5...');
  execSync('node run-content-machine.mjs ' + i, { stdio: 'inherit' });
}
"
echo.
echo   ✓ All 5 Pages (Silent Wealth, Strategic Silence, Eon Ventures, Reliq North, Boundaries Club) Successfully Published!
echo.
pause
exit

:SELECT_PAGE
echo.
echo  Select Page to Publish:
echo   [0] Silent Wealth
echo   [1] Strategic Silence
echo   [2] Eon Ventures
echo   [3] Reliq North
echo   [4] The Boundaries Club
echo.
set /p pageIdx="Enter Page Number (0-4): "
node run-content-machine.mjs %pageIdx%
echo.
echo   ✓ Execution Finished!
echo.
pause
exit

:ACHIEVEMENT_REEL
echo.
echo  Select Brand for 🏆 Earned Achievement Milestone Reel:
echo   [0] Silent Wealth
echo   [1] Strategic Silence
echo   [2] Eon Ventures
echo   [3] Reliq North
echo   [4] The Boundaries Club
echo.
set /p pageIdx="Enter Page Number (0-4): "
node run-content-machine.mjs %pageIdx% --achievement
echo.
echo   ✓ 🏆 Earned Achievement Milestone Reel Live!
echo.
pause
exit

:TEXT_POSTS
echo.
echo [1/5] Launching ✍️ Highlight Text Post Engine Across All 5 Brands...
node post-text-engine.mjs
echo.
echo   ✓ Highlight Text Posts Published Live on All 5 Facebook Pages!
echo.
pause
exit
