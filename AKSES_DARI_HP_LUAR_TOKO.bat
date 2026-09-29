@echo off
title Akses HP Dari Luar Toko (Cloudflare Tunnel Gratis)
color 0E
echo ========================================================
echo  MENGHUBUNGKAN SERVER KE INTERNET AGAR HP BISA PANTAU
echo  (Gratis, Aman, Tanpa Perlu Langganan IP Publik)
echo ========================================================
echo.
echo Menjalankan tunnel port 3000...
npx untun@latest tunnel http://localhost:3000
pause
