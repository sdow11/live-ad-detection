"""Dataset preparation for production model training.

Downloads labeled frames from cloud API and organizes them into
training/validation/test splits.
"""

import argparse
import logging
import random
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import httpx
from tqdm import tqdm

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class DatasetPreparer:
    """Prepares training dataset from cloud API."""

    def __init__(
        self,
        api_url: str,
        api_key: str,
        output_dir: str = "data/datasets/production",
        split_ratio: Tuple[float, float, float] = (0.7, 0.15, 0.15),
        random_seed: int = 42
    ):
        """Initialize dataset preparer.

        Args:
            api_url: Cloud API base URL
            api_key: API key for authentication
            output_dir: Output directory for dataset
            split_ratio: (train, val, test) split ratios
            random_seed: Random seed for reproducibility
        """
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key
        self.output_dir = Path(output_dir)
        self.split_ratio = split_ratio
        self.random_seed = random_seed

        # Validate split ratio
        assert abs(sum(split_ratio) - 1.0) < 0.01, "Split ratios must sum to 1.0"

        # HTTP client
        self.client = httpx.Client(
            headers={"Authorization": f"Bearer {self.api_key}"},
            timeout=60.0
        )

        random.seed(random_seed)

    def fetch_labeled_frames(
        self,
        min_confidence: float = 0.8,
        max_frames: Optional[int] = None
    ) -> List[Dict]:
        """Fetch labeled frames from cloud API.

        Args:
            min_confidence: Minimum labeling confidence
            max_frames: Maximum frames to fetch (None = all)

        Returns:
            List of frame metadata dicts
        """
        logger.info("Fetching labeled frames from cloud API...")

        # TODO: Implement actual API endpoint for fetching labeled frames
        # For now, this is a placeholder showing the expected structure

        frames = []
        page = 1
        page_size = 100

        while True:
            try:
                response = self.client.get(
                    f"{self.api_url}/api/v1/labeled-frames",
                    params={
                        "min_confidence": min_confidence,
                        "page": page,
                        "page_size": page_size
                    }
                )
                response.raise_for_status()

                data = response.json()
                batch = data.get("frames", [])

                if not batch:
                    break

                frames.extend(batch)

                logger.info(f"Fetched page {page}: {len(batch)} frames")

                if max_frames and len(frames) >= max_frames:
                    frames = frames[:max_frames]
                    break

                page += 1

            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    logger.warning(
                        "Labeled frames endpoint not implemented. "
                        "Using local frame collector instead."
                    )
                    break
                raise

            except Exception as e:
                logger.error(f"Error fetching frames: {e}")
                break

        logger.info(f"Fetched {len(frames)} labeled frames")

        return frames

    def collect_local_frames(
        self,
        data_dir: str,
        max_frames: Optional[int] = None
    ) -> List[Dict]:
        """Collect labeled frames from local directory.

        Args:
            data_dir: Directory containing labeled frames
            max_frames: Maximum frames to collect

        Returns:
            List of frame metadata dicts
        """
        logger.info(f"Collecting frames from {data_dir}...")

        data_path = Path(data_dir)
        if not data_path.exists():
            logger.error(f"Data directory not found: {data_dir}")
            return []

        frames = []

        # Look for labeled frames in ad/content subdirectories
        for label in ["ad", "content"]:
            label_dir = data_path / label
            if not label_dir.exists():
                logger.warning(f"Label directory not found: {label_dir}")
                continue

            # Find all image files
            for ext in ["*.jpg", "*.png", "*.jpeg"]:
                for img_path in label_dir.glob(ext):
                    frames.append({
                        "path": str(img_path),
                        "label": label,
                        "label_binary": 1 if label == "ad" else 0
                    })

            logger.info(f"Found {len(frames)} frames with label '{label}'")

        # Shuffle and limit
        random.shuffle(frames)

        if max_frames:
            frames = frames[:max_frames]

        logger.info(f"Collected {len(frames)} total frames")

        return frames

    def split_dataset(
        self,
        frames: List[Dict]
    ) -> Tuple[List[Dict], List[Dict], List[Dict]]:
        """Split frames into train/val/test sets.

        Args:
            frames: List of frame metadata

        Returns:
            Tuple of (train_frames, val_frames, test_frames)
        """
        logger.info("Splitting dataset...")

        # Shuffle frames
        random.shuffle(frames)

        # Calculate split indices
        n = len(frames)
        train_size = int(n * self.split_ratio[0])
        val_size = int(n * self.split_ratio[1])

        # Split
        train_frames = frames[:train_size]
        val_frames = frames[train_size:train_size + val_size]
        test_frames = frames[train_size + val_size:]

        logger.info(f"Train: {len(train_frames)} frames")
        logger.info(f"Val: {len(val_frames)} frames")
        logger.info(f"Test: {len(test_frames)} frames")

        return train_frames, val_frames, test_frames

    def organize_dataset(
        self,
        train_frames: List[Dict],
        val_frames: List[Dict],
        test_frames: List[Dict]
    ) -> None:
        """Organize frames into dataset directory structure.

        Args:
            train_frames: Training frames
            val_frames: Validation frames
            test_frames: Test frames
        """
        logger.info(f"Organizing dataset in {self.output_dir}...")

        # Create directory structure
        for split in ["train", "val", "test"]:
            for label in ["ad", "content"]:
                split_dir = self.output_dir / split / label
                split_dir.mkdir(parents=True, exist_ok=True)

        # Copy frames to appropriate directories
        splits = {
            "train": train_frames,
            "val": val_frames,
            "test": test_frames
        }

        for split_name, frames in splits.items():
            logger.info(f"Organizing {split_name} set...")

            for frame in tqdm(frames, desc=f"Copying {split_name}"):
                src_path = Path(frame["path"])
                label = frame["label"]
                dst_dir = self.output_dir / split_name / label

                # Generate unique filename
                dst_filename = f"{src_path.stem}_{frame.get('device_id', 'unknown')}{src_path.suffix}"
                dst_path = dst_dir / dst_filename

                # Copy file
                try:
                    shutil.copy2(src_path, dst_path)
                except Exception as e:
                    logger.warning(f"Failed to copy {src_path}: {e}")

        logger.info("Dataset organization complete")

    def create_calibration_set(
        self,
        train_frames: List[Dict],
        num_samples: int = 100
    ) -> None:
        """Create calibration dataset for quantization.

        Args:
            train_frames: Training frames
            num_samples: Number of calibration samples
        """
        logger.info("Creating calibration dataset...")

        calibration_dir = self.output_dir / "calibration"
        calibration_dir.mkdir(parents=True, exist_ok=True)

        # Sample frames randomly from training set
        calibration_frames = random.sample(
            train_frames,
            min(num_samples, len(train_frames))
        )

        for i, frame in enumerate(tqdm(calibration_frames, desc="Copying calibration")):
            src_path = Path(frame["path"])
            dst_path = calibration_dir / f"calib_{i:04d}{src_path.suffix}"

            try:
                shutil.copy2(src_path, dst_path)
            except Exception as e:
                logger.warning(f"Failed to copy {src_path}: {e}")

        logger.info(f"Created calibration set with {len(calibration_frames)} samples")

    def generate_dataset_stats(self) -> Dict:
        """Generate dataset statistics.

        Returns:
            Statistics dict
        """
        logger.info("Generating dataset statistics...")

        stats = {
            "splits": {}
        }

        for split in ["train", "val", "test"]:
            split_dir = self.output_dir / split

            if not split_dir.exists():
                continue

            split_stats = {
                "total": 0,
                "classes": {}
            }

            for label_dir in split_dir.iterdir():
                if not label_dir.is_dir():
                    continue

                label = label_dir.name
                num_samples = len(list(label_dir.glob("*.jpg"))) + len(list(label_dir.glob("*.png")))

                split_stats["classes"][label] = num_samples
                split_stats["total"] += num_samples

            stats["splits"][split] = split_stats

        # Print statistics
        logger.info("\nDataset Statistics:")
        logger.info("=" * 50)

        for split, split_stats in stats["splits"].items():
            logger.info(f"\n{split.upper()} SET:")
            logger.info(f"  Total: {split_stats['total']}")

            for label, count in split_stats["classes"].items():
                percentage = (count / split_stats['total'] * 100) if split_stats['total'] > 0 else 0
                logger.info(f"  {label}: {count} ({percentage:.1f}%)")

        return stats

    def prepare(
        self,
        source: str = "local",
        source_path: Optional[str] = None,
        max_frames: Optional[int] = None
    ) -> bool:
        """Prepare complete dataset.

        Args:
            source: Data source ("api" or "local")
            source_path: Path to local data (if source="local")
            max_frames: Maximum frames to include

        Returns:
            True if successful
        """
        try:
            # 1. Fetch/collect frames
            if source == "api":
                frames = self.fetch_labeled_frames(max_frames=max_frames)
            elif source == "local":
                if not source_path:
                    raise ValueError("source_path required for local source")
                frames = self.collect_local_frames(source_path, max_frames=max_frames)
            else:
                raise ValueError(f"Unknown source: {source}")

            if not frames:
                logger.error("No frames collected")
                return False

            # 2. Split dataset
            train_frames, val_frames, test_frames = self.split_dataset(frames)

            # 3. Organize dataset
            self.organize_dataset(train_frames, val_frames, test_frames)

            # 4. Create calibration set
            self.create_calibration_set(train_frames)

            # 5. Generate statistics
            self.generate_dataset_stats()

            logger.info("Dataset preparation complete!")
            return True

        except Exception as e:
            logger.error(f"Dataset preparation failed: {e}", exc_info=True)
            return False

        finally:
            self.client.close()


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Prepare training dataset from labeled frames"
    )
    parser.add_argument(
        "--source",
        type=str,
        choices=["api", "local"],
        default="local",
        help="Data source (api or local)"
    )
    parser.add_argument(
        "--source-path",
        type=str,
        help="Path to local data directory (for source=local)"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="data/datasets/production",
        help="Output directory for prepared dataset"
    )
    parser.add_argument(
        "--api-url",
        type=str,
        help="Cloud API URL (for source=api)"
    )
    parser.add_argument(
        "--api-key",
        type=str,
        help="API key (for source=api)"
    )
    parser.add_argument(
        "--max-frames",
        type=int,
        help="Maximum frames to include"
    )
    parser.add_argument(
        "--split-ratio",
        type=str,
        default="0.7,0.15,0.15",
        help="Train/val/test split ratio (comma-separated)"
    )

    args = parser.parse_args()

    # Parse split ratio
    split_ratio = tuple(map(float, args.split_ratio.split(",")))

    # Create preparer
    preparer = DatasetPreparer(
        api_url=args.api_url or "http://localhost:8000",
        api_key=args.api_key or "",
        output_dir=args.output_dir,
        split_ratio=split_ratio
    )

    # Prepare dataset
    success = preparer.prepare(
        source=args.source,
        source_path=args.source_path,
        max_frames=args.max_frames
    )

    if not success:
        exit(1)


if __name__ == "__main__":
    main()
