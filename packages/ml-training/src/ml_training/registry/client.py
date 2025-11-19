"""Model registry client for uploading and managing models.

This module provides a client for interacting with the cloud model registry,
allowing training pipelines to upload models and edge devices to download them.
"""

import logging
from pathlib import Path
from typing import Optional, Dict, Any
import json
import hashlib

import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class ModelMetadata(BaseModel):
    """Model metadata for registry."""

    name: str = Field(..., description="Model name (e.g., 'base-ad-detector')")
    version: str = Field(..., description="Semantic version (e.g., '1.0.0')")
    description: str = Field(..., description="Model description")

    # Model details
    architecture: str = Field(..., description="Model architecture")
    input_shape: tuple[int, int, int] = Field(..., description="Input shape (H, W, C)")
    framework: str = Field(default="tensorflow_lite", description="Framework")

    # Performance metrics
    precision: float = Field(..., ge=0.0, le=1.0, description="Precision")
    recall: float = Field(..., ge=0.0, le=1.0, description="Recall")
    f1_score: float = Field(..., ge=0.0, le=1.0, description="F1 score")
    latency_ms: float = Field(..., gt=0.0, description="Average latency (ms)")

    # File info
    file_size_mb: float = Field(..., gt=0.0, description="File size (MB)")
    checksum: str = Field(..., description="SHA256 checksum")

    # Deployment info
    min_hardware: str = Field(
        default="Raspberry Pi 4",
        description="Minimum hardware requirement"
    )
    is_quantized: bool = Field(default=False, description="Is model quantized")
    quantization_type: Optional[str] = Field(
        default=None,
        description="Quantization type (int8, float16, etc.)"
    )

    # Training info
    dataset_name: Optional[str] = Field(default=None, description="Training dataset")
    training_date: Optional[str] = Field(default=None, description="Training date")
    training_config: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Training configuration"
    )

    # Tags for organization
    tags: list[str] = Field(default_factory=list, description="Model tags")


class ModelRegistryClient:
    """Client for interacting with model registry.

    Example:
        >>> client = ModelRegistryClient("https://api.example.com")
        >>> client.upload_model(
        ...     model_path="model.tflite",
        ...     metadata=metadata
        ... )
        >>> model = client.download_model("base-ad-detector", "1.0.0")
    """

    def __init__(
        self,
        api_url: str,
        api_key: Optional[str] = None,
        timeout: float = 30.0
    ):
        """Initialize model registry client.

        Args:
            api_url: Cloud API base URL
            api_key: API key for authentication
            timeout: Request timeout in seconds
        """
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

        # HTTP client
        headers = {"User-Agent": "ModelRegistryClient/0.1.0"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        self.client = httpx.Client(
            base_url=self.api_url,
            headers=headers,
            timeout=timeout
        )

    def _compute_checksum(self, file_path: Path) -> str:
        """Compute SHA256 checksum of file.

        Args:
            file_path: Path to file

        Returns:
            Hex-encoded SHA256 checksum
        """
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    def upload_model(
        self,
        model_path: Path | str,
        metadata: ModelMetadata,
        overwrite: bool = False
    ) -> Dict[str, Any]:
        """Upload model to registry.

        Args:
            model_path: Path to model file
            metadata: Model metadata
            overwrite: Overwrite existing version

        Returns:
            Upload response with model ID and download URL

        Raises:
            httpx.HTTPStatusError: If upload fails
        """
        model_path = Path(model_path)

        if not model_path.exists():
            raise FileNotFoundError(f"Model file not found: {model_path}")

        logger.info(f"Uploading model {metadata.name} v{metadata.version}...")

        # Compute file size and checksum
        file_size_mb = model_path.stat().st_size / (1024 * 1024)
        checksum = self._compute_checksum(model_path)

        # Update metadata
        metadata.file_size_mb = file_size_mb
        metadata.checksum = checksum

        # Upload metadata first
        logger.info("Uploading metadata...")
        metadata_response = self.client.post(
            "/api/v1/models",
            json=metadata.model_dump(),
            params={"overwrite": overwrite}
        )
        metadata_response.raise_for_status()
        model_info = metadata_response.json()
        model_id = model_info["id"]

        logger.info(f"Model registered with ID: {model_id}")

        # Get upload URL
        upload_url_response = self.client.get(
            f"/api/v1/models/{model_id}/upload-url"
        )
        upload_url_response.raise_for_status()
        upload_url = upload_url_response.json()["upload_url"]

        # Upload file
        logger.info(f"Uploading model file ({file_size_mb:.2f} MB)...")
        with open(model_path, "rb") as f:
            upload_response = httpx.put(
                upload_url,
                content=f,
                headers={"Content-Type": "application/octet-stream"},
                timeout=300.0  # 5 minute timeout for large files
            )
            upload_response.raise_for_status()

        # Confirm upload
        confirm_response = self.client.post(
            f"/api/v1/models/{model_id}/confirm-upload",
            json={"checksum": checksum}
        )
        confirm_response.raise_for_status()

        logger.info(f"✅ Model uploaded successfully!")
        logger.info(f"   Model ID: {model_id}")
        logger.info(f"   Download URL: {model_info.get('download_url')}")

        return model_info

    def download_model(
        self,
        model_name: str,
        version: str,
        output_path: Path | str
    ) -> Path:
        """Download model from registry.

        Args:
            model_name: Model name
            version: Model version
            output_path: Where to save model

        Returns:
            Path to downloaded model

        Raises:
            httpx.HTTPStatusError: If download fails
        """
        output_path = Path(output_path)

        logger.info(f"Downloading model {model_name} v{version}...")

        # Get model info
        response = self.client.get(
            f"/api/v1/models/{model_name}/{version}"
        )
        response.raise_for_status()
        model_info = response.json()

        download_url = model_info["download_url"]
        expected_checksum = model_info["checksum"]

        # Download file
        logger.info(f"Downloading from: {download_url}")
        download_response = httpx.get(download_url, follow_redirects=True)
        download_response.raise_for_status()

        # Save file
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(download_response.content)

        # Verify checksum
        actual_checksum = self._compute_checksum(output_path)
        if actual_checksum != expected_checksum:
            output_path.unlink()
            raise ValueError(
                f"Checksum mismatch! Expected {expected_checksum}, "
                f"got {actual_checksum}"
            )

        logger.info(f"✅ Model downloaded successfully to {output_path}")

        return output_path

    def list_models(
        self,
        tags: Optional[list[str]] = None,
        limit: int = 100
    ) -> list[Dict[str, Any]]:
        """List available models.

        Args:
            tags: Filter by tags
            limit: Maximum number of results

        Returns:
            List of model metadata
        """
        params = {"limit": limit}
        if tags:
            params["tags"] = ",".join(tags)

        response = self.client.get("/api/v1/models", params=params)
        response.raise_for_status()

        return response.json()

    def get_latest_version(
        self,
        model_name: str,
        stable_only: bool = True
    ) -> str:
        """Get latest version of a model.

        Args:
            model_name: Model name
            stable_only: Only consider stable versions

        Returns:
            Latest version string
        """
        response = self.client.get(
            f"/api/v1/models/{model_name}/latest",
            params={"stable_only": stable_only}
        )
        response.raise_for_status()

        return response.json()["version"]

    def promote_to_production(
        self,
        model_name: str,
        version: str
    ) -> Dict[str, Any]:
        """Promote model version to production.

        Args:
            model_name: Model name
            version: Version to promote

        Returns:
            Response with promotion status
        """
        logger.info(f"Promoting {model_name} v{version} to production...")

        response = self.client.post(
            f"/api/v1/models/{model_name}/{version}/promote"
        )
        response.raise_for_status()

        logger.info("✅ Model promoted to production!")

        return response.json()

    def deprecate_version(
        self,
        model_name: str,
        version: str,
        reason: str
    ) -> Dict[str, Any]:
        """Deprecate a model version.

        Args:
            model_name: Model name
            version: Version to deprecate
            reason: Deprecation reason

        Returns:
            Response with deprecation status
        """
        logger.info(f"Deprecating {model_name} v{version}...")

        response = self.client.post(
            f"/api/v1/models/{model_name}/{version}/deprecate",
            json={"reason": reason}
        )
        response.raise_for_status()

        logger.info("✅ Model version deprecated!")

        return response.json()

    def get_model_metrics(
        self,
        model_name: str,
        version: str
    ) -> Dict[str, Any]:
        """Get performance metrics for a model.

        Args:
            model_name: Model name
            version: Model version

        Returns:
            Model metrics
        """
        response = self.client.get(
            f"/api/v1/models/{model_name}/{version}/metrics"
        )
        response.raise_for_status()

        return response.json()

    def close(self) -> None:
        """Close HTTP client."""
        self.client.close()

    def __enter__(self) -> "ModelRegistryClient":
        """Context manager entry."""
        return self

    def __exit__(self, *args) -> None:
        """Context manager exit."""
        self.close()


# CLI entry point
def main():
    """CLI for model registry operations."""
    import argparse

    parser = argparse.ArgumentParser(description="Model Registry CLI")
    parser.add_argument("--api-url", required=True, help="Cloud API URL")
    parser.add_argument("--api-key", help="API key")

    subparsers = parser.add_subparsers(dest="command", help="Command")

    # Upload command
    upload_parser = subparsers.add_parser("upload", help="Upload model")
    upload_parser.add_argument("--model", required=True, help="Model file path")
    upload_parser.add_argument("--metadata", required=True, help="Metadata JSON file")
    upload_parser.add_argument("--overwrite", action="store_true", help="Overwrite existing")

    # Download command
    download_parser = subparsers.add_parser("download", help="Download model")
    download_parser.add_argument("--name", required=True, help="Model name")
    download_parser.add_argument("--version", required=True, help="Model version")
    download_parser.add_argument("--output", required=True, help="Output path")

    # List command
    list_parser = subparsers.add_parser("list", help="List models")
    list_parser.add_argument("--tags", help="Filter by tags (comma-separated)")

    # Promote command
    promote_parser = subparsers.add_parser("promote", help="Promote to production")
    promote_parser.add_argument("--name", required=True, help="Model name")
    promote_parser.add_argument("--version", required=True, help="Model version")

    args = parser.parse_args()

    # Create client
    client = ModelRegistryClient(
        api_url=args.api_url,
        api_key=args.api_key
    )

    # Execute command
    if args.command == "upload":
        # Load metadata
        with open(args.metadata) as f:
            metadata_dict = json.load(f)
        metadata = ModelMetadata(**metadata_dict)

        # Upload
        result = client.upload_model(
            model_path=args.model,
            metadata=metadata,
            overwrite=args.overwrite
        )
        print(json.dumps(result, indent=2))

    elif args.command == "download":
        client.download_model(
            model_name=args.name,
            version=args.version,
            output_path=args.output
        )

    elif args.command == "list":
        tags = args.tags.split(",") if args.tags else None
        models = client.list_models(tags=tags)
        for model in models:
            print(f"{model['name']} v{model['version']} - {model['description']}")

    elif args.command == "promote":
        client.promote_to_production(
            model_name=args.name,
            version=args.version
        )

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
