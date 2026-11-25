@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "REMOTO=https://github.com/desarrollotecnologia/Cajas_Colbeef.git"

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo Esta carpeta no es un repositorio de git.
  pause
  exit /b 1
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin "%REMOTO%"
) else (
  git remote set-url origin "%REMOTO%"
)

for /f "delims=" %%R in ('git branch --show-current') do set "RAMA=%%R"
if "%RAMA%"=="" (
  echo No hay una rama activa.
  pause
  exit /b 1
)

echo.
echo Se traeran los cambios de:
echo %REMOTO%
echo Rama: %RAMA%
echo.
echo Tus archivos locales .env y las claves no se reemplazan.
echo.
set /p "CONFIRMA=Escribe si para traer los cambios: "
if /i not "%CONFIRMA%"=="si" (
  echo Cancelado. No se trajo nada.
  pause
  exit /b 0
)

git pull origin "%RAMA%"
if errorlevel 1 (
  echo No se pudieron traer los cambios. Revisa tu acceso a GitHub o si tienes cambios locales sin guardar.
  pause
  exit /b 1
)

echo Cambios traidos desde %REMOTO% en la rama %RAMA%.
pause
