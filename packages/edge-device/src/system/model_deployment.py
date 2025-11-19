"""Automated model deployment system.

Automatically checks for and deploys new ML models from the cloud API.
Supports safe rollback and gradual rollout.
"""

import asyncio
import logging
import shutil
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class DeploymentStatus(str, Enum):
    """Model deployment status."""

    CHECKING = "checking"
    DOWNLOADING = "downloading"
    DEPLOYING = "deploying"
    DEPLOYED = "deployed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


@dataclass
class ModelInfo:
    """Model information."""

    name: str
    version: str
    file_path: Path
    deployed_at: datetime
    checksum: Optional[str] = None


class ModelDeploymentService:
    """Automated model deployment service."""

    def __init__(
        self,
        models_dir: Path,
        check_interval: int = 3600,  # Check every hour
        auto_deploy: bool = True
    ):
        """Initialize model deployment service.

        Args:
            models_dir: Directory to store models
            check_interval: Interval between update checks (seconds)
            auto_deploy: Whether to automatically deploy updates
        """
        self.models_dir = models_dir
        self.check_interval = check_interval
        self.auto_deploy = auto_deploy

        self.models_dir.mkdir(parents=True, exist_ok=True)
        self.backup_dir = self.models_dir / "backups"
        self.backup_dir.mkdir(exist_ok=True)

        self.deployed_models: Dict[str, ModelInfo] = {}
        self.deployment_status: Dict[str, DeploymentStatus] = {}

        self.running = False
        self.check_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        """Start model deployment service."""
        self.running = True

        # Load currently deployed models
        self._load_deployed_models()

        # Start background checking
        if self.auto_deploy:
            self.check_task = asyncio.create_task(self._check_loop())
            logger.info("Automated model deployment started")
        else:
            logger.info("Manual model deployment mode")

    async def stop(self) -> None:
        """Stop model deployment service."""
        self.running = False

        if self.check_task:
            self.check_task.cancel()
            try:
                await self.check_task
            except asyncio.CancelledError:
                pass

        logger.info("Model deployment service stopped")

    async def check_and_deploy_updates(self, model_name: str) -> bool:
        """Check for and deploy model updates.

        Args:
            model_name: Name of model to check

        Returns:
            True if update was deployed
        """
        from system.cloud_client import get_cloud_client

        cloud_client = get_cloud_client()
        if not cloud_client:
            logger.warning("Cloud client not initialized")
            return False

        try:
            self.deployment_status[model_name] = DeploymentStatus.CHECKING

            # Check for updates
            logger.info(f"Checking for updates to {model_name}")
            update_info = await cloud_client.check_model_updates(model_name)

            if not update_info:
                logger.debug(f"No updates available for {model_name}")
                return False

            new_version = update_info["version"]
            current_version = self.deployed_models.get(model_name)

            # Check if already deployed
            if current_version and current_version.version == new_version:
                logger.debug(f"{model_name} already at version {new_version}")
                return False

            logger.info(f"New version available: {model_name} v{new_version}")

            # Check rollout percentage
            rollout_pct = update_info.get("rollout_percentage", 100.0)
            if rollout_pct < 100.0:
                # For gradual rollout, could implement device selection logic
                logger.info(f"Model is in gradual rollout ({rollout_pct}%)")

            # Deploy if auto_deploy is enabled
            if self.auto_deploy:
                success = await self.deploy_model(model_name, new_version)
                return success
            else:
                logger.info(f"Auto-deploy disabled, skipping deployment of {model_name}")
                return False

        except Exception as e:
            logger.error(f"Failed to check/deploy updates for {model_name}: {e}")
            self.deployment_status[model_name] = DeploymentStatus.FAILED
            return False

    async def deploy_model(self, model_name: str, version: str) -> bool:
        """Deploy a specific model version.

        Args:
            model_name: Name of model
            version: Version to deploy

        Returns:
            True if successful
        """
        from system.cloud_client import get_cloud_client

        cloud_client = get_cloud_client()
        if not cloud_client:
            logger.error("Cloud client not initialized")
            return False

        try:
            self.deployment_status[model_name] = DeploymentStatus.DOWNLOADING

            # Determine file paths
            model_filename = f"{model_name}_{version}.tflite"
            temp_path = self.models_dir / f"{model_filename}.tmp"
            final_path = self.models_dir / model_filename
            active_link = self.models_dir / f"{model_name}_active.tflite"

            # Download model
            logger.info(f"Downloading {model_name} v{version}")
            success = await cloud_client.download_model(
                model_name, version, temp_path
            )

            if not success:
                logger.error(f"Failed to download {model_name} v{version}")
                self.deployment_status[model_name] = DeploymentStatus.FAILED
                return False

            # Backup current model if it exists
            if model_name in self.deployed_models:
                await self._backup_model(model_name)

            # Move to final location
            self.deployment_status[model_name] = DeploymentStatus.DEPLOYING
            shutil.move(str(temp_path), str(final_path))

            # Update symlink
            if active_link.exists() or active_link.is_symlink():
                active_link.unlink()

            active_link.symlink_to(model_filename)

            # Update deployment info
            model_info = ModelInfo(
                name=model_name,
                version=version,
                file_path=final_path,
                deployed_at=datetime.now()
            )

            self.deployed_models[model_name] = model_info
            self.deployment_status[model_name] = DeploymentStatus.DEPLOYED

            # Save deployment info
            self._save_deployment_info(model_name, model_info)

            logger.info(f"Successfully deployed {model_name} v{version}")
            return True

        except Exception as e:
            logger.error(f"Failed to deploy {model_name} v{version}: {e}", exc_info=True)
            self.deployment_status[model_name] = DeploymentStatus.FAILED

            # Cleanup temp file
            if temp_path.exists():
                temp_path.unlink()

            return False

    async def rollback_model(self, model_name: str) -> bool:
        """Rollback model to previous version.

        Args:
            model_name: Name of model to rollback

        Returns:
            True if successful
        """
        try:
            # Find backup
            backup_files = sorted(
                self.backup_dir.glob(f"{model_name}_*.tflite"),
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )

            if not backup_files:
                logger.error(f"No backup found for {model_name}")
                return False

            backup_file = backup_files[0]

            # Extract version from backup filename
            version = backup_file.stem.split("_")[-1]

            # Restore from backup
            active_link = self.models_dir / f"{model_name}_active.tflite"

            if active_link.exists() or active_link.is_symlink():
                active_link.unlink()

            # Copy backup to models dir
            restored_file = self.models_dir / backup_file.name
            shutil.copy2(backup_file, restored_file)

            # Update symlink
            active_link.symlink_to(restored_file.name)

            # Update deployment info
            model_info = ModelInfo(
                name=model_name,
                version=version,
                file_path=restored_file,
                deployed_at=datetime.now()
            )

            self.deployed_models[model_name] = model_info
            self.deployment_status[model_name] = DeploymentStatus.ROLLED_BACK

            logger.info(f"Rolled back {model_name} to version {version}")
            return True

        except Exception as e:
            logger.error(f"Failed to rollback {model_name}: {e}", exc_info=True)
            return False

    def get_model_path(self, model_name: str) -> Optional[Path]:
        """Get path to active model file.

        Args:
            model_name: Name of model

        Returns:
            Path to model file or None
        """
        active_link = self.models_dir / f"{model_name}_active.tflite"

        if active_link.exists():
            return active_link

        return None

    def get_model_info(self, model_name: str) -> Optional[ModelInfo]:
        """Get information about deployed model.

        Args:
            model_name: Name of model

        Returns:
            Model info or None
        """
        return self.deployed_models.get(model_name)

    def get_deployment_status(self, model_name: str) -> Optional[DeploymentStatus]:
        """Get deployment status for model.

        Args:
            model_name: Name of model

        Returns:
            Deployment status or None
        """
        return self.deployment_status.get(model_name)

    async def _backup_model(self, model_name: str) -> None:
        """Backup current model.

        Args:
            model_name: Name of model to backup
        """
        if model_name not in self.deployed_models:
            return

        current = self.deployed_models[model_name]

        if not current.file_path.exists():
            return

        # Create backup with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"{model_name}_{current.version}_{timestamp}.tflite"
        backup_path = self.backup_dir / backup_name

        shutil.copy2(current.file_path, backup_path)
        logger.info(f"Backed up {model_name} v{current.version}")

        # Keep only last 5 backups
        backup_files = sorted(
            self.backup_dir.glob(f"{model_name}_*.tflite"),
            key=lambda p: p.stat().st_mtime,
            reverse=True
        )

        for old_backup in backup_files[5:]:
            old_backup.unlink()
            logger.debug(f"Removed old backup: {old_backup.name}")

    def _save_deployment_info(self, model_name: str, model_info: ModelInfo) -> None:
        """Save deployment information to file.

        Args:
            model_name: Name of model
            model_info: Model information
        """
        import json

        info_file = self.models_dir / f"{model_name}_info.json"

        data = {
            "name": model_info.name,
            "version": model_info.version,
            "file_path": str(model_info.file_path),
            "deployed_at": model_info.deployed_at.isoformat(),
            "checksum": model_info.checksum
        }

        with open(info_file, "w") as f:
            json.dump(data, f, indent=2)

    def _load_deployed_models(self) -> None:
        """Load information about currently deployed models."""
        import json

        for info_file in self.models_dir.glob("*_info.json"):
            try:
                with open(info_file) as f:
                    data = json.load(f)

                model_info = ModelInfo(
                    name=data["name"],
                    version=data["version"],
                    file_path=Path(data["file_path"]),
                    deployed_at=datetime.fromisoformat(data["deployed_at"]),
                    checksum=data.get("checksum")
                )

                # Verify file still exists
                if model_info.file_path.exists():
                    self.deployed_models[model_info.name] = model_info
                    self.deployment_status[model_info.name] = DeploymentStatus.DEPLOYED
                    logger.info(
                        f"Loaded deployed model: {model_info.name} v{model_info.version}"
                    )

            except Exception as e:
                logger.error(f"Failed to load deployment info from {info_file}: {e}")

    async def _check_loop(self) -> None:
        """Background model update checking loop."""
        # Common models to check
        models_to_check = [
            "ad_detection",
            "scene_classification",
            "audio_classification"
        ]

        while self.running:
            try:
                for model_name in models_to_check:
                    await self.check_and_deploy_updates(model_name)

                await asyncio.sleep(self.check_interval)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in model check loop: {e}", exc_info=True)
                await asyncio.sleep(self.check_interval)


# Global model deployment service instance
model_deployment_service: Optional[ModelDeploymentService] = None


def initialize_model_deployment(
    models_dir: Path,
    check_interval: int = 3600,
    auto_deploy: bool = True
) -> ModelDeploymentService:
    """Initialize global model deployment service.

    Args:
        models_dir: Directory to store models
        check_interval: Interval between update checks
        auto_deploy: Whether to automatically deploy updates

    Returns:
        Model deployment service instance
    """
    global model_deployment_service
    model_deployment_service = ModelDeploymentService(
        models_dir, check_interval, auto_deploy
    )
    return model_deployment_service


def get_model_deployment_service() -> Optional[ModelDeploymentService]:
    """Get global model deployment service instance.

    Returns:
        Model deployment service or None if not initialized
    """
    return model_deployment_service
