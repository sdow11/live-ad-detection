"""Home screen platform - App framework.

Provides a plugin-based application framework for the home screen.
Each app (trivia, karaoke, web browser, etc.) inherits from BaseApp.
"""

import logging
from abc import ABC, abstractmethod
from enum import Enum
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class AppStatus(str, Enum):
    """Application status."""
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    PAUSED = "paused"
    STOPPING = "stopping"
    ERROR = "error"


class AppCategory(str, Enum):
    """Application category."""
    ENTERTAINMENT = "entertainment"
    GAMES = "games"
    UTILITY = "utility"
    VIDEO = "video"
    SYSTEM = "system"


class BaseApp(ABC):
    """Base class for all home screen applications.

    Each app must implement:
    - start(): Launch the app
    - stop(): Stop the app
    - pause(): Pause the app (optional)
    - resume(): Resume from pause (optional)
    """

    def __init__(
        self,
        app_id: str,
        name: str,
        description: str,
        icon: str,
        category: AppCategory,
        version: str = "1.0.0"
    ):
        """Initialize base app.

        Args:
            app_id: Unique app identifier
            name: Display name
            description: App description
            icon: Path to icon file or emoji
            category: App category
            version: App version
        """
        self.app_id = app_id
        self.name = name
        self.description = description
        self.icon = icon
        self.category = category
        self.version = version

        self.status = AppStatus.STOPPED
        self.config: Dict[str, Any] = {}
        self.error_message: Optional[str] = None

    @abstractmethod
    async def start(self) -> bool:
        """Start the application.

        Returns:
            True if started successfully
        """
        pass

    @abstractmethod
    async def stop(self) -> bool:
        """Stop the application.

        Returns:
            True if stopped successfully
        """
        pass

    async def pause(self) -> bool:
        """Pause the application (optional).

        Returns:
            True if paused successfully
        """
        self.status = AppStatus.PAUSED
        return True

    async def resume(self) -> bool:
        """Resume the application (optional).

        Returns:
            True if resumed successfully
        """
        self.status = AppStatus.RUNNING
        return True

    def set_config(self, config: Dict[str, Any]) -> None:
        """Set application configuration.

        Args:
            config: Configuration dictionary
        """
        self.config = config
        logger.info(f"Updated config for {self.name}: {config}")

    def get_status(self) -> Dict[str, Any]:
        """Get application status.

        Returns:
            Status dictionary
        """
        return {
            "app_id": self.app_id,
            "name": self.name,
            "status": self.status,
            "version": self.version,
            "error_message": self.error_message
        }

    def to_dict(self) -> Dict[str, Any]:
        """Convert app to dictionary.

        Returns:
            App metadata dictionary
        """
        return {
            "app_id": self.app_id,
            "name": self.name,
            "description": self.description,
            "icon": self.icon,
            "category": self.category,
            "version": self.version,
            "status": self.status,
            "config": self.config
        }


class AppRegistry:
    """Registry for managing installed applications."""

    def __init__(self):
        """Initialize app registry."""
        self.apps: Dict[str, BaseApp] = {}
        self.active_app: Optional[str] = None

    def register_app(self, app: BaseApp) -> None:
        """Register an application.

        Args:
            app: Application instance
        """
        self.apps[app.app_id] = app
        logger.info(f"Registered app: {app.name} ({app.app_id})")

    def unregister_app(self, app_id: str) -> bool:
        """Unregister an application.

        Args:
            app_id: Application ID

        Returns:
            True if unregistered
        """
        if app_id in self.apps:
            del self.apps[app_id]
            logger.info(f"Unregistered app: {app_id}")
            return True
        return False

    def get_app(self, app_id: str) -> Optional[BaseApp]:
        """Get application by ID.

        Args:
            app_id: Application ID

        Returns:
            Application instance or None
        """
        return self.apps.get(app_id)

    def list_apps(self, category: Optional[AppCategory] = None) -> list[BaseApp]:
        """List all applications.

        Args:
            category: Filter by category (optional)

        Returns:
            List of applications
        """
        apps = list(self.apps.values())

        if category:
            apps = [app for app in apps if app.category == category]

        return apps

    async def launch_app(self, app_id: str) -> bool:
        """Launch an application.

        Args:
            app_id: Application ID

        Returns:
            True if launched successfully
        """
        app = self.get_app(app_id)

        if not app:
            logger.error(f"App not found: {app_id}")
            return False

        # Stop currently active app if any
        if self.active_app and self.active_app != app_id:
            await self.stop_app(self.active_app)

        # Start new app
        try:
            app.status = AppStatus.STARTING
            success = await app.start()

            if success:
                app.status = AppStatus.RUNNING
                self.active_app = app_id
                logger.info(f"Launched app: {app.name}")
            else:
                app.status = AppStatus.ERROR
                app.error_message = "Failed to start"
                logger.error(f"Failed to launch app: {app.name}")

            return success

        except Exception as e:
            app.status = AppStatus.ERROR
            app.error_message = str(e)
            logger.error(f"Error launching app {app.name}: {e}", exc_info=True)
            return False

    async def stop_app(self, app_id: str) -> bool:
        """Stop an application.

        Args:
            app_id: Application ID

        Returns:
            True if stopped successfully
        """
        app = self.get_app(app_id)

        if not app:
            logger.error(f"App not found: {app_id}")
            return False

        try:
            app.status = AppStatus.STOPPING
            success = await app.stop()

            if success:
                app.status = AppStatus.STOPPED

                if self.active_app == app_id:
                    self.active_app = None

                logger.info(f"Stopped app: {app.name}")
            else:
                app.status = AppStatus.ERROR
                app.error_message = "Failed to stop"
                logger.error(f"Failed to stop app: {app.name}")

            return success

        except Exception as e:
            app.status = AppStatus.ERROR
            app.error_message = str(e)
            logger.error(f"Error stopping app {app.name}: {e}", exc_info=True)
            return False

    async def return_to_home(self) -> bool:
        """Return to home screen (stop active app).

        Returns:
            True if successful
        """
        if self.active_app:
            return await self.stop_app(self.active_app)
        return True

    def get_active_app(self) -> Optional[BaseApp]:
        """Get currently active application.

        Returns:
            Active app or None
        """
        if self.active_app:
            return self.get_app(self.active_app)
        return None


# Global app registry
app_registry = AppRegistry()
