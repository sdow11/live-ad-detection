"""Tests for automated model deployment."""

import asyncio
import pytest
from pathlib import Path
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from system.model_deployment import (
    ModelDeploymentService,
    ModelInfo,
    DeploymentStatus,
    initialize_model_deployment,
    get_model_deployment_service
)


@pytest.fixture
def models_dir(tmp_path):
    """Create temporary models directory."""
    return tmp_path / "models"


@pytest.fixture
def deployment_service(models_dir):
    """Create test deployment service."""
    return ModelDeploymentService(
        models_dir=models_dir,
        check_interval=3600,
        auto_deploy=True
    )


class TestModelInfo:
    """Test ModelInfo dataclass."""

    def test_model_info_creation(self):
        """Test creating model info."""
        info = ModelInfo(
            name="ad_detection",
            version="1.0.0",
            file_path=Path("/models/ad_detection_1.0.0.tflite"),
            deployed_at=datetime.now(),
            checksum="abc123"
        )

        assert info.name == "ad_detection"
        assert info.version == "1.0.0"
        assert info.checksum == "abc123"


class TestModelDeploymentService:
    """Test ModelDeploymentService functionality."""

    def test_initialization(self, deployment_service, models_dir):
        """Test service initialization."""
        assert deployment_service.models_dir == models_dir
        assert deployment_service.check_interval == 3600
        assert deployment_service.auto_deploy is True
        assert deployment_service.running is False

        # Directories should be created
        assert models_dir.exists()
        assert (models_dir / "backups").exists()

    @pytest.mark.asyncio
    async def test_start_stop(self, deployment_service):
        """Test starting and stopping service."""
        await deployment_service.start()

        assert deployment_service.running is True
        assert deployment_service.check_task is not None

        await deployment_service.stop()

        assert deployment_service.running is False
        assert deployment_service.check_task.cancelled()

    @pytest.mark.asyncio
    async def test_start_manual_mode(self, models_dir):
        """Test starting in manual deployment mode."""
        service = ModelDeploymentService(
            models_dir=models_dir,
            check_interval=3600,
            auto_deploy=False
        )

        await service.start()

        assert service.running is True
        assert service.check_task is None  # No background task in manual mode

        await service.stop()

    @pytest.mark.asyncio
    async def test_check_and_deploy_updates_no_cloud(self, deployment_service):
        """Test checking updates without cloud client."""
        with patch('system.cloud_client.get_cloud_client', return_value=None):
            result = await deployment_service.check_and_deploy_updates("ad_detection")

            assert result is False

    @pytest.mark.asyncio
    async def test_check_and_deploy_updates_no_update(self, deployment_service):
        """Test checking when no update is available."""
        mock_cloud_client = MagicMock()
        mock_cloud_client.check_model_updates = AsyncMock(return_value=None)

        with patch('system.cloud_client.get_cloud_client', return_value=mock_cloud_client):
            result = await deployment_service.check_and_deploy_updates("ad_detection")

            assert result is False
            mock_cloud_client.check_model_updates.assert_called_once_with("ad_detection")

    @pytest.mark.asyncio
    async def test_check_and_deploy_updates_already_deployed(self, deployment_service):
        """Test checking when already at latest version."""
        # Set up existing deployment
        deployment_service.deployed_models["ad_detection"] = ModelInfo(
            name="ad_detection",
            version="1.0.0",
            file_path=Path("/models/ad_detection_1.0.0.tflite"),
            deployed_at=datetime.now()
        )

        mock_cloud_client = MagicMock()
        mock_cloud_client.check_model_updates = AsyncMock(return_value={
            "version": "1.0.0",  # Same version
            "rollout_percentage": 100.0
        })

        with patch('system.cloud_client.get_cloud_client', return_value=mock_cloud_client):
            result = await deployment_service.check_and_deploy_updates("ad_detection")

            assert result is False

    @pytest.mark.asyncio
    async def test_deploy_model_success(self, deployment_service, models_dir):
        """Test successful model deployment."""
        mock_cloud_client = MagicMock()
        mock_cloud_client.download_model = AsyncMock(return_value=True)

        # Create a temporary model file to simulate download
        temp_path = models_dir / "ad_detection_1.0.0.tflite.tmp"
        temp_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path.write_text("model data")

        with patch('system.cloud_client.get_cloud_client', return_value=mock_cloud_client), \
             patch('shutil.move') as mock_move:

            # Setup move to simulate successful file move
            def side_effect(src, dst):
                Path(dst).write_text("model data")

            mock_move.side_effect = side_effect

            result = await deployment_service.deploy_model("ad_detection", "1.0.0")

            assert result is True
            assert "ad_detection" in deployment_service.deployed_models
            assert deployment_service.deployment_status["ad_detection"] == DeploymentStatus.DEPLOYED

    @pytest.mark.asyncio
    async def test_deploy_model_download_failure(self, deployment_service):
        """Test model deployment with download failure."""
        mock_cloud_client = MagicMock()
        mock_cloud_client.download_model = AsyncMock(return_value=False)

        with patch('system.cloud_client.get_cloud_client', return_value=mock_cloud_client):
            result = await deployment_service.deploy_model("ad_detection", "1.0.0")

            assert result is False
            assert deployment_service.deployment_status["ad_detection"] == DeploymentStatus.FAILED

    @pytest.mark.asyncio
    async def test_rollback_model_success(self, deployment_service, models_dir):
        """Test successful model rollback."""
        # Create backup directory with a backup file
        backup_dir = models_dir / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)

        backup_file = backup_dir / "ad_detection_1.0.0_20250101_120000.tflite"
        backup_file.write_text("old model data")

        # Deploy current model
        deployment_service.deployed_models["ad_detection"] = ModelInfo(
            name="ad_detection",
            version="2.0.0",
            file_path=models_dir / "ad_detection_2.0.0.tflite",
            deployed_at=datetime.now()
        )

        result = await deployment_service.rollback_model("ad_detection")

        assert result is True
        assert deployment_service.deployment_status["ad_detection"] == DeploymentStatus.ROLLED_BACK

    @pytest.mark.asyncio
    async def test_rollback_model_no_backup(self, deployment_service):
        """Test rollback when no backup exists."""
        result = await deployment_service.rollback_model("ad_detection")

        assert result is False

    def test_get_model_path_exists(self, deployment_service, models_dir):
        """Test getting model path when it exists."""
        # Create active symlink
        models_dir.mkdir(parents=True, exist_ok=True)
        model_file = models_dir / "ad_detection_1.0.0.tflite"
        model_file.write_text("model data")

        active_link = models_dir / "ad_detection_active.tflite"
        active_link.symlink_to("ad_detection_1.0.0.tflite")

        path = deployment_service.get_model_path("ad_detection")

        assert path is not None
        assert path.exists()
        assert path.name == "ad_detection_active.tflite"

    def test_get_model_path_not_exists(self, deployment_service):
        """Test getting model path when it doesn't exist."""
        path = deployment_service.get_model_path("nonexistent_model")

        assert path is None

    def test_get_model_info(self, deployment_service):
        """Test getting model information."""
        model_info = ModelInfo(
            name="ad_detection",
            version="1.0.0",
            file_path=Path("/models/ad_detection_1.0.0.tflite"),
            deployed_at=datetime.now()
        )

        deployment_service.deployed_models["ad_detection"] = model_info

        retrieved_info = deployment_service.get_model_info("ad_detection")

        assert retrieved_info == model_info
        assert retrieved_info.name == "ad_detection"
        assert retrieved_info.version == "1.0.0"

    def test_get_deployment_status(self, deployment_service):
        """Test getting deployment status."""
        deployment_service.deployment_status["ad_detection"] = DeploymentStatus.DEPLOYED

        status = deployment_service.get_deployment_status("ad_detection")

        assert status == DeploymentStatus.DEPLOYED

    def test_save_load_deployment_info(self, deployment_service, models_dir):
        """Test saving and loading deployment info."""
        model_info = ModelInfo(
            name="ad_detection",
            version="1.0.0",
            file_path=models_dir / "ad_detection_1.0.0.tflite",
            deployed_at=datetime.now(),
            checksum="abc123"
        )

        # Create the model file
        models_dir.mkdir(parents=True, exist_ok=True)
        model_info.file_path.write_text("model data")

        # Save deployment info
        deployment_service._save_deployment_info("ad_detection", model_info)

        # Verify file was created
        info_file = models_dir / "ad_detection_info.json"
        assert info_file.exists()

        # Load deployment info
        deployment_service.deployed_models.clear()
        deployment_service._load_deployed_models()

        # Verify loaded
        assert "ad_detection" in deployment_service.deployed_models
        loaded_info = deployment_service.deployed_models["ad_detection"]
        assert loaded_info.name == "ad_detection"
        assert loaded_info.version == "1.0.0"
        assert loaded_info.checksum == "abc123"

    @pytest.mark.asyncio
    async def test_backup_model(self, deployment_service, models_dir):
        """Test backing up a model."""
        # Create current model
        models_dir.mkdir(parents=True, exist_ok=True)
        model_file = models_dir / "ad_detection_1.0.0.tflite"
        model_file.write_text("model data")

        model_info = ModelInfo(
            name="ad_detection",
            version="1.0.0",
            file_path=model_file,
            deployed_at=datetime.now()
        )

        deployment_service.deployed_models["ad_detection"] = model_info

        # Backup the model
        await deployment_service._backup_model("ad_detection")

        # Verify backup was created
        backup_dir = models_dir / "backups"
        backups = list(backup_dir.glob("ad_detection_*.tflite"))
        assert len(backups) >= 1

    @pytest.mark.asyncio
    async def test_backup_limits(self, deployment_service, models_dir):
        """Test that old backups are removed."""
        # Create current model
        models_dir.mkdir(parents=True, exist_ok=True)
        backup_dir = models_dir / "backups"
        backup_dir.mkdir(exist_ok=True)

        model_file = models_dir / "ad_detection_1.0.0.tflite"
        model_file.write_text("model data")

        model_info = ModelInfo(
            name="ad_detection",
            version="1.0.0",
            file_path=model_file,
            deployed_at=datetime.now()
        )

        deployment_service.deployed_models["ad_detection"] = model_info

        # Create 6 backups (should keep only 5)
        for i in range(6):
            await deployment_service._backup_model("ad_detection")
            await asyncio.sleep(0.01)  # Ensure different timestamps

        # Check only 5 backups remain
        backups = list(backup_dir.glob("ad_detection_*.tflite"))
        assert len(backups) == 5


class TestGlobalFunctions:
    """Test global helper functions."""

    def test_initialize_model_deployment(self, models_dir):
        """Test initializing global deployment service."""
        service = initialize_model_deployment(
            models_dir=models_dir,
            check_interval=1800,
            auto_deploy=False
        )

        assert service is not None
        assert isinstance(service, ModelDeploymentService)
        assert get_model_deployment_service() == service

    def test_get_model_deployment_service_not_initialized(self):
        """Test getting service when not initialized."""
        # Reset global
        import system.model_deployment
        system.model_deployment.model_deployment_service = None

        result = get_model_deployment_service()
        assert result is None
