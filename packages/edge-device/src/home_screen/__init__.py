"""Home Screen Platform.

Extensible app launcher platform for entertainment and utility apps.
"""

from home_screen.app_framework import (
    AppCategory,
    AppStatus,
    BaseApp,
    AppRegistry,
)
from home_screen.launcher import HomeScreenLauncher

__all__ = [
    "AppCategory",
    "AppStatus",
    "BaseApp",
    "AppRegistry",
    "HomeScreenLauncher",
]
