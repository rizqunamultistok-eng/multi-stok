@echo off
title Buka Pantau Stok Kasir / Gudang Offline
color 0B
set "SERVER_IP=%~1"
if "%SERVER_IP%"=="" set /p SERVER_IP="Masukkan IP Komputer Server (contoh 192.168.88.16): "
if "%SERVER_IP%"=="" (
	echo IP server wajib diisi.
	pause
	exit /b 1
)
echo Menghubungkan ke Server Komputer Utama %SERVER_IP%...

echo Membuka aplikasi kasir di http://%SERVER_IP%:3000 ...
start msedge --app=http://%SERVER_IP%:3000 || start chrome --app=http://%SERVER_IP%:3000 || start http://%SERVER_IP%:3000
exit
