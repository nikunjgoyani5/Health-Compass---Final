#!/usr/bin/env python3
"""
Python Dependencies Installation Script for Health Compass AI System

This script helps install all required Python dependencies and fixes common
installation issues that might occur.
"""

import os
import sys
import subprocess
import platform
from pathlib import Path

def check_python_version():
    """Check if Python version is compatible"""
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print(f"❌ Python 3.8+ required, found {version.major}.{version.minor}")
        return False
    
    print(f"✅ Python {version.major}.{version.minor}.{version.micro} - Compatible")
    return True

def check_pip():
    """Check if pip is available"""
    try:
        import pip
        print("✅ pip is available")
        return True
    except ImportError:
        print("❌ pip not found")
        return False

def upgrade_pip():
    """Upgrade pip to latest version"""
    try:
        print("🔄 Upgrading pip...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "--upgrade", "pip"])
        print("✅ pip upgraded successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to upgrade pip: {e}")
        return False

def install_dependencies():
    """Install all required dependencies"""
    requirements_file = Path("requirements.txt")
    
    if not requirements_file.exists():
        print("❌ requirements.txt not found")
        return False
    
    try:
        print("🔄 Installing Python dependencies...")
        
        # First, try to install with --user flag (safer)
        try:
            subprocess.check_call([
                sys.executable, "-m", "pip", "install", 
                "--user", "-r", "requirements.txt"
            ])
            print("✅ Dependencies installed successfully with --user flag")
            return True
        except subprocess.CalledProcessError:
            print("⚠️  --user installation failed, trying without --user...")
            
            # Try without --user flag
            subprocess.check_call([
                sys.executable, "-m", "pip", "install", 
                "-r", "requirements.txt"
            ])
            print("✅ Dependencies installed successfully")
            return True
            
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install dependencies: {e}")
        return False

def install_specific_packages():
    """Install specific packages that might fail"""
    critical_packages = [
        "fastapi",
        "uvicorn[standard]",
        "aiohttp",
        "motor",
        "openai"
    ]
    
    print("🔄 Installing critical packages individually...")
    
    for package in critical_packages:
        try:
            print(f"Installing {package}...")
            subprocess.check_call([
                sys.executable, "-m", "pip", "install", package
            ])
            print(f"✅ {package} installed successfully")
        except subprocess.CalledProcessError as e:
            print(f"❌ Failed to install {package}: {e}")
            return False
    
    return True

def verify_installation():
    """Verify that all critical packages are installed"""
    critical_packages = [
        "fastapi",
        "uvicorn",
        "aiohttp",
        "motor",
        "openai",
        "pydantic"
    ]
    
    print("🔍 Verifying installation...")
    missing_packages = []
    
    for package in critical_packages:
        try:
            __import__(package)
            print(f"✅ {package} - OK")
        except ImportError:
            print(f"❌ {package} - Missing")
            missing_packages.append(package)
    
    if missing_packages:
        print(f"\n❌ Missing packages: {', '.join(missing_packages)}")
        return False
    
    print("\n✅ All critical packages are installed!")
    return True

def create_virtual_environment():
    """Create a virtual environment if needed"""
    venv_path = Path("venv")
    
    if venv_path.exists():
        print("✅ Virtual environment already exists")
        return True
    
    try:
        print("🔄 Creating virtual environment...")
        subprocess.check_call([
            sys.executable, "-m", "venv", "venv"
        ])
        print("✅ Virtual environment created successfully")
        print("\n📝 To activate the virtual environment:")
        if platform.system() == "Windows":
            print("   venv\\Scripts\\activate")
        else:
            print("   source venv/bin/activate")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to create virtual environment: {e}")
        return False

def main():
    """Main installation function"""
    print("🐍 Health Compass AI System - Python Dependencies Installation")
    print("=" * 60)
    
    # Check Python version
    if not check_python_version():
        sys.exit(1)
    
    # Check pip
    if not check_pip():
        print("Please install pip first")
        sys.exit(1)
    
    # Upgrade pip
    upgrade_pip()
    
    # Try to install dependencies
    if not install_dependencies():
        print("\n⚠️  Bulk installation failed, trying individual packages...")
        if not install_specific_packages():
            print("\n❌ Installation failed completely")
            sys.exit(1)
    
    # Verify installation
    if not verify_installation():
        print("\n❌ Some packages are still missing")
        sys.exit(1)
    
    print("\n🎉 Python dependencies installation completed successfully!")
    print("\n📝 Next steps:")
    print("1. Set up your .env file with API keys")
    print("2. Start the application: python start.py")
    print("3. Or run the demo: python demo.py")

if __name__ == "__main__":
    main()
