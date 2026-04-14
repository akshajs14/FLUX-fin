@echo off
SET PATH=C:\Program Files\nodejs;%PATH%
cd /d "%~dp0frontend"
"C:\Program Files\nodejs\node.exe" node_modules\vite\bin\vite.js --port 8080 --host
