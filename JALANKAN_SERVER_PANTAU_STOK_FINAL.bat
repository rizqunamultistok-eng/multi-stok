@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title Pantau Stok - Background Setup
set "SETUP_SCRIPT=%~dp0setup-pantau-stok-task.ps1"

if /I "%~1"=="/remove" goto remove_task

echo ============================================================
echo  PANTAU STOK - AUTO START BACKGROUND
echo ============================================================
echo.

fltmc >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Jalankan file ini dengan klik kanan ^> Run as administrator.
    echo Ini hanya diperlukan sekali untuk mendaftarkan task Windows.
    echo.
    pause
    exit /b 1
)

if not exist "%~dp0package.json" (
    echo [ERROR] package.json tidak ditemukan di folder launcher.
    pause
    exit /b 1
)

set "NODE_PATH="
for /f "delims=" %%N in ('where.exe node 2^>nul') do if not defined NODE_PATH set "NODE_PATH=%%N"
if not defined NODE_PATH (
    echo [ERROR] Node.js tidak ditemukan di PATH.
    pause
    exit /b 1
)

if not exist "%~dp0node_modules" (
    echo [1/3] Dependency belum tersedia, menjalankan npm install...
    call npm.cmd install
    if errorlevel 1 (
        echo [ERROR] npm install gagal.
        pause
        exit /b 1
    )
)

echo [2/3] Build aplikasi...
call npm.cmd run build
if errorlevel 1 (
    echo [ERROR] Build gagal. Scheduled Task tidak diubah.
    pause
    exit /b 1
)

echo.
echo [3/3] Mendaftarkan task saat Windows mulai...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SETUP_SCRIPT%" -ProjectPath "%CD%" -NodePath "%NODE_PATH%"
if errorlevel 1 (
    echo [ERROR] Gagal mendaftarkan Scheduled Task.
    pause
    exit /b 1
)

echo.
echo [OK] PantauStokServer terdaftar untuk berjalan otomatis tanpa jendela.
echo URL lokal: http://localhost:3000
echo Log: %~dp0logs\server-service.log
echo Hapus task: jalankan file ini dengan argumen /remove sebagai Administrator.
echo.
pause
exit /b 0

:remove_task
fltmc >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Jalankan file ini dengan klik kanan ^> Run as administrator.
    pause
    exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SETUP_SCRIPT%" -Remove
if errorlevel 1 (
    echo [ERROR] Gagal menghapus Scheduled Task.
    pause
    exit /b 1
)
echo [OK] Scheduled Task PantauStokServer sudah dihapus.
pause
exit /b 0
