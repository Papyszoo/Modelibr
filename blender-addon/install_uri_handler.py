#!/usr/bin/env python3
"""
Modelibr URI Handler Installer

This script registers the modelibr:// URI scheme on your operating system,
allowing the "Open in Blender" button in the web app to launch Blender
with the correct model context.

Usage:
    python install_uri_handler.py [blender_path]

Arguments:
    blender_path: Path to Blender executable (optional, will attempt auto-detection)
"""

import os
import sys
import platform
import subprocess
import argparse


def find_blender_path():
    """Attempt to find Blender installation path."""
    import glob
    system = platform.system()
    
    common_paths = []
    
    if system == "Windows":
        # Search for any Blender version in Program Files
        program_files = os.path.expandvars(r"%ProgramFiles%\Blender Foundation")
        if os.path.isdir(program_files):
            pattern = os.path.join(program_files, "Blender*", "blender.exe")
            found = glob.glob(pattern)
            # Sort to get latest version first
            common_paths.extend(sorted(found, reverse=True))
        # Also check direct path
        common_paths.append(os.path.expandvars(r"%ProgramFiles%\Blender Foundation\Blender\blender.exe"))
    elif system == "Darwin":  # macOS
        common_paths = [
            "/Applications/Blender.app/Contents/MacOS/Blender",
            os.path.expanduser("~/Applications/Blender.app/Contents/MacOS/Blender"),
        ]
    else:  # Linux
        common_paths = [
            "/usr/bin/blender",
            "/usr/local/bin/blender",
            os.path.expanduser("~/blender/blender"),
            "/snap/bin/blender",
            "/opt/blender/blender",
        ]
        # Search for versioned installations
        opt_pattern = "/opt/blender*/blender"
        common_paths.extend(sorted(glob.glob(opt_pattern), reverse=True))
    
    for path in common_paths:
        if os.path.isfile(path):
            return path
    
    # Try finding in PATH
    try:
        if system == "Windows":
            result = subprocess.run(["where", "blender"], capture_output=True, text=True)
        else:
            result = subprocess.run(["which", "blender"], capture_output=True, text=True)
        if result.returncode == 0:
            return result.stdout.strip().split('\n')[0]
    except Exception:
        pass
    
    return None


def install_windows(blender_path):
    """Install URI handler on Windows using registry."""
    import winreg
    
    try:
        # Create key for modelibr protocol
        key_path = r"SOFTWARE\Classes\modelibr"
        
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
            winreg.SetValue(key, "", winreg.REG_SZ, "URL:Modelibr Protocol")
            winreg.SetValueEx(key, "URL Protocol", 0, winreg.REG_SZ, "")
        
        # Create DefaultIcon key
        icon_path = f"{key_path}\\DefaultIcon"
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, icon_path) as key:
            winreg.SetValue(key, "", winreg.REG_SZ, f'"{blender_path}",0')
        
        # Create shell\open\command key
        command_path = f"{key_path}\\shell\\open\\command"
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, command_path) as key:
            winreg.SetValue(key, "", winreg.REG_SZ, f'"{blender_path}" "%1"')
        
        print("Successfully registered modelibr:// URI handler on Windows")
        return True
        
    except Exception as e:
        print(f"Failed to register URI handler: {e}")
        return False


def install_macos(blender_path):
    """Install URI handler on macOS."""
    # Create a simple application bundle that handles the URI
    app_dir = os.path.expanduser("~/Applications/ModelibrLauncher.app")
    contents_dir = os.path.join(app_dir, "Contents")
    macos_dir = os.path.join(contents_dir, "MacOS")
    
    os.makedirs(macos_dir, exist_ok=True)
    
    # Create Info.plist
    info_plist = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>launcher</string>
    <key>CFBundleIdentifier</key>
    <string>com.modelibr.launcher</string>
    <key>CFBundleName</key>
    <string>Modelibr Launcher</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleURLTypes</key>
    <array>
        <dict>
            <key>CFBundleURLName</key>
            <string>Modelibr Protocol</string>
            <key>CFBundleURLSchemes</key>
            <array>
                <string>modelibr</string>
            </array>
        </dict>
    </array>
    <key>LSBackgroundOnly</key>
    <true/>
</dict>
</plist>
"""
    
    with open(os.path.join(contents_dir, "Info.plist"), "w") as f:
        f.write(info_plist)
    
    # Create launcher script
    launcher_script = f"""#!/bin/bash
"{blender_path}" "$1"
"""
    
    launcher_path = os.path.join(macos_dir, "launcher")
    with open(launcher_path, "w") as f:
        f.write(launcher_script)
    os.chmod(launcher_path, 0o755)
    
    # Register the app with Launch Services
    subprocess.run([
        "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
        "-R", "-f", app_dir
    ], capture_output=True)
    
    print(f"Successfully created URI handler app at: {app_dir}")
    print("The modelibr:// protocol should now be registered.")
    return True


def install_linux(blender_path):
    """Install URI handler on Linux using .desktop file."""
    # Create .desktop file
    desktop_content = f"""[Desktop Entry]
Name=Modelibr Launcher
Exec={blender_path} %u
Type=Application
NoDisplay=true
MimeType=x-scheme-handler/modelibr;
"""
    
    # Create applications directory if needed
    apps_dir = os.path.expanduser("~/.local/share/applications")
    os.makedirs(apps_dir, exist_ok=True)
    
    desktop_path = os.path.join(apps_dir, "modelibr-handler.desktop")
    with open(desktop_path, "w") as f:
        f.write(desktop_content)
    os.chmod(desktop_path, 0o755)
    
    # Register the handler with xdg-mime
    try:
        subprocess.run([
            "xdg-mime", "default", "modelibr-handler.desktop", "x-scheme-handler/modelibr"
        ], check=True, capture_output=True)
        print(f"Successfully registered modelibr:// URI handler")
        print(f"Desktop file created at: {desktop_path}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"Failed to register with xdg-mime: {e}")
        print(f"Desktop file created at: {desktop_path}")
        print("You may need to manually run:")
        print(f"  xdg-mime default modelibr-handler.desktop x-scheme-handler/modelibr")
        return False
    except FileNotFoundError:
        print("xdg-mime not found. Desktop file created but not registered.")
        print(f"Desktop file created at: {desktop_path}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Install modelibr:// URI handler for Blender"
    )
    parser.add_argument(
        "blender_path",
        nargs="?",
        help="Path to Blender executable (optional, will attempt auto-detection)"
    )
    args = parser.parse_args()
    
    blender_path = args.blender_path
    
    if not blender_path:
        print("Searching for Blender installation...")
        blender_path = find_blender_path()
    
    if not blender_path:
        print("Could not find Blender installation.")
        print("Please provide the path to Blender as an argument:")
        print("  python install_uri_handler.py /path/to/blender")
        sys.exit(1)
    
    if not os.path.isfile(blender_path):
        print(f"Blender not found at: {blender_path}")
        sys.exit(1)
    
    print(f"Using Blender at: {blender_path}")
    
    system = platform.system()
    
    if system == "Windows":
        success = install_windows(blender_path)
    elif system == "Darwin":
        success = install_macos(blender_path)
    else:
        success = install_linux(blender_path)
    
    if success:
        print("\nInstallation complete!")
        print("You can now use the 'Open in Blender' button from the Modelibr web app.")
    else:
        print("\nInstallation completed with warnings.")
        sys.exit(1)


if __name__ == "__main__":
    main()
