@echo off
echo ========================================
echo Health Compass AI System - Windows Setup
echo ========================================
echo.

echo Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python not found! Please install Python 3.8+ first
    echo Download from: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo ✅ Python found
echo.

echo Upgrading pip...
python -m pip install --upgrade pip
if errorlevel 1 (
    echo ❌ Failed to upgrade pip
    pause
    exit /b 1
)

echo ✅ pip upgraded
echo.

echo Installing Python dependencies...
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo ❌ Failed to install dependencies
    echo.
    echo Trying individual packages...
    python -m pip install fastapi uvicorn[standard] aiohttp motor openai pydantic
    if errorlevel 1 (
        echo ❌ Failed to install critical packages
        pause
        exit /b 1
    )
)

echo ✅ Dependencies installed
echo.

echo Creating virtual environment...
python -m venv venv
if errorlevel 1 (
    echo ❌ Failed to create virtual environment
    pause
    exit /b 1
)

echo ✅ Virtual environment created
echo.

echo ========================================
echo 🎉 Installation completed successfully!
echo ========================================
echo.
echo To activate the virtual environment:
echo   venv\Scripts\activate
echo.
echo To start the application:
echo   python start.py
echo.
echo To run the demo:
echo   python demo.py
echo.
pause
