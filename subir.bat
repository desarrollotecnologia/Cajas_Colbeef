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

echo.
echo Los archivos .env y las claves no se suben.
echo.
set /p "MENSAJE=Escribe el mensaje del commit: "
if "%MENSAJE%"=="" (
  echo El mensaje no puede quedar vacio.
  pause
  exit /b 1
)

echo.
echo Repositorio: %REMOTO%
echo Commit: %MENSAJE%
echo.
set /p "CONFIRMA=Escribe si para subir los cambios: "
if /i not "%CONFIRMA%"=="si" (
  echo Cancelado. No se subio nada.
  pause
  exit /b 0
)

git add -A
git diff --cached --quiet
if not errorlevel 1 (
  echo No hay cambios para subir.
  pause
  exit /b 0
)

git commit -m "%MENSAJE%"
if errorlevel 1 (
  echo No se pudo crear el commit.
  pause
  exit /b 1
)

for /f "delims=" %%R in ('git branch --show-current') do set "RAMA=%%R"
git push -u origin "%RAMA%"
if errorlevel 1 (
  echo No se pudo subir. Revisa tu acceso a GitHub.
  pause
  exit /b 1
)

echo Cambios subidos a %REMOTO% en la rama %RAMA%.
pause
