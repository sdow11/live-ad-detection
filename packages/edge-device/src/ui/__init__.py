"""UI framework for home screen and mode management.

This package provides the UI layer for the application, including:
- Mode management (home screen vs passthrough vs other modes)
- Home screen rendering
- Navigation system
"""

from ui.mode_manager import UIMode, UIModeManager
from ui.home_screen import HomeScreen

__all__ = [
    "UIMode",
    "UIModeManager",
    "HomeScreen",
]
