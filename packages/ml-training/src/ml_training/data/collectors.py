"""Data collection tools for extracting frames from video recordings.

This module provides tools to:
- Extract frames from video files
- Generate metadata for frames
- Organize frames into datasets
- Sample frames at various intervals
"""

import argparse
import hashlib
import json
import logging
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

import cv2
import numpy as np
from tqdm import tqdm

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@dataclass
class FrameMetadata:
    """Metadata for an extracted frame."""

    frame_id: str
    source_video: str
    frame_number: int
    timestamp_ms: int
    timestamp_str: str
    channel: Optional[str] = None
    show: Optional[str] = None
    recording_date: Optional[str] = None
    width: int = 0
    height: int = 0
    fps: float = 0.0


class VideoFrameExtractor:
    """Extract frames from video files."""

    def __init__(
        self,
        output_dir: Path | str,
        metadata_file: Optional[Path | str] = None,
        image_format: str = "jpg",
        jpeg_quality: int = 95
    ):
        """Initialize frame extractor.

        Args:
            output_dir: Directory to save extracted frames
            metadata_file: JSON file to save frame metadata
            image_format: Image format (jpg or png)
            jpeg_quality: JPEG quality (0-100)
        """
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        self.metadata_file = Path(metadata_file) if metadata_file else None
        self.image_format = image_format.lower()
        self.jpeg_quality = jpeg_quality

        self.metadata: List[FrameMetadata] = []

        if self.image_format not in ["jpg", "jpeg", "png"]:
            raise ValueError("image_format must be 'jpg' or 'png'")

    def extract_frames(
        self,
        video_path: Path | str,
        interval_seconds: float = 1.0,
        max_frames: Optional[int] = None,
        start_time_seconds: float = 0.0,
        end_time_seconds: Optional[float] = None,
        channel: Optional[str] = None,
        show: Optional[str] = None,
        recording_date: Optional[str] = None,
        resize: Optional[tuple] = None
    ) -> int:
        """Extract frames from video.

        Args:
            video_path: Path to video file
            interval_seconds: Interval between frames in seconds
            max_frames: Maximum number of frames to extract
            start_time_seconds: Start time in seconds
            end_time_seconds: End time in seconds (None = until end)
            channel: Channel name for metadata
            show: Show name for metadata
            recording_date: Recording date for metadata
            resize: Resize frames to (width, height)

        Returns:
            Number of frames extracted
        """
        video_path = Path(video_path)
        if not video_path.exists():
            raise FileNotFoundError(f"Video not found: {video_path}")

        logger.info(f"Extracting frames from {video_path}")

        # Open video
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise RuntimeError(f"Failed to open video: {video_path}")

        try:
            # Get video properties
            fps = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            duration_seconds = total_frames / fps if fps > 0 else 0

            logger.info(f"Video properties: {width}x{height}, {fps:.2f} fps, "
                       f"{duration_seconds:.1f}s, {total_frames} frames")

            # Calculate frame interval
            frame_interval = int(fps * interval_seconds)
            if frame_interval < 1:
                frame_interval = 1

            # Set start position
            if start_time_seconds > 0:
                start_frame = int(start_time_seconds * fps)
                cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
            else:
                start_frame = 0

            # Calculate end position
            if end_time_seconds is not None:
                end_frame = int(end_time_seconds * fps)
            else:
                end_frame = total_frames

            # Extract frames
            frames_extracted = 0
            frame_number = start_frame

            progress_bar = tqdm(
                total=min(max_frames or float('inf'), (end_frame - start_frame) // frame_interval),
                desc="Extracting frames",
                unit="frame"
            )

            while frame_number < end_frame:
                # Read frame
                ret, frame = cap.read()
                if not ret:
                    break

                # Check if we should extract this frame
                if (frame_number - start_frame) % frame_interval == 0:
                    # Resize if requested
                    if resize:
                        frame = cv2.resize(frame, resize)

                    # Generate frame ID
                    timestamp_ms = int((frame_number / fps) * 1000)
                    frame_id = self._generate_frame_id(video_path, frame_number)

                    # Save frame
                    frame_path = self._get_frame_path(frame_id)
                    self._save_frame(frame, frame_path)

                    # Create metadata
                    metadata = FrameMetadata(
                        frame_id=frame_id,
                        source_video=str(video_path.name),
                        frame_number=frame_number,
                        timestamp_ms=timestamp_ms,
                        timestamp_str=str(timedelta(milliseconds=timestamp_ms)),
                        channel=channel,
                        show=show,
                        recording_date=recording_date,
                        width=frame.shape[1],
                        height=frame.shape[0],
                        fps=fps
                    )
                    self.metadata.append(metadata)

                    frames_extracted += 1
                    progress_bar.update(1)

                    # Check max frames
                    if max_frames and frames_extracted >= max_frames:
                        break

                frame_number += 1

            progress_bar.close()

            logger.info(f"Extracted {frames_extracted} frames")

            return frames_extracted

        finally:
            cap.release()

    def _generate_frame_id(self, video_path: Path, frame_number: int) -> str:
        """Generate unique frame ID.

        Args:
            video_path: Video file path
            frame_number: Frame number

        Returns:
            Unique frame ID
        """
        # Use video name and frame number to create ID
        video_name = video_path.stem
        return f"{video_name}_frame_{frame_number:08d}"

    def _get_frame_path(self, frame_id: str) -> Path:
        """Get path for frame file.

        Args:
            frame_id: Frame ID

        Returns:
            Path to save frame
        """
        ext = "jpg" if self.image_format in ["jpg", "jpeg"] else "png"
        return self.output_dir / f"{frame_id}.{ext}"

    def _save_frame(self, frame: np.ndarray, path: Path) -> None:
        """Save frame to file.

        Args:
            frame: Frame image
            path: Path to save to
        """
        if self.image_format in ["jpg", "jpeg"]:
            cv2.imwrite(
                str(path),
                frame,
                [cv2.IMWRITE_JPEG_QUALITY, self.jpeg_quality]
            )
        else:
            cv2.imwrite(str(path), frame)

    def save_metadata(self, output_file: Optional[Path | str] = None) -> None:
        """Save metadata to JSON file.

        Args:
            output_file: Output file path (uses default if None)
        """
        output_file = Path(output_file) if output_file else self.metadata_file

        if not output_file:
            output_file = self.output_dir / "metadata.json"

        # Convert metadata to dict
        metadata_dicts = [asdict(m) for m in self.metadata]

        # Save to file
        with open(output_file, "w") as f:
            json.dump(metadata_dicts, f, indent=2)

        logger.info(f"Saved metadata for {len(self.metadata)} frames to {output_file}")

    def load_metadata(self, metadata_file: Path | str) -> List[FrameMetadata]:
        """Load metadata from JSON file.

        Args:
            metadata_file: Metadata file path

        Returns:
            List of frame metadata
        """
        with open(metadata_file) as f:
            metadata_dicts = json.load(f)

        self.metadata = [FrameMetadata(**m) for m in metadata_dicts]

        logger.info(f"Loaded metadata for {len(self.metadata)} frames")

        return self.metadata


class DatasetOrganizer:
    """Organize frames into train/val/test splits."""

    def __init__(
        self,
        source_dir: Path | str,
        output_dir: Path | str,
        train_ratio: float = 0.7,
        val_ratio: float = 0.15,
        test_ratio: float = 0.15
    ):
        """Initialize dataset organizer.

        Args:
            source_dir: Directory containing all frames
            output_dir: Output directory for organized dataset
            train_ratio: Ratio of training data
            val_ratio: Ratio of validation data
            test_ratio: Ratio of test data
        """
        self.source_dir = Path(source_dir)
        self.output_dir = Path(output_dir)

        if not (0 < train_ratio < 1 and 0 < val_ratio < 1 and 0 < test_ratio < 1):
            raise ValueError("Ratios must be between 0 and 1")

        total = train_ratio + val_ratio + test_ratio
        if abs(total - 1.0) > 0.01:
            raise ValueError(f"Ratios must sum to 1.0, got {total}")

        self.train_ratio = train_ratio
        self.val_ratio = val_ratio
        self.test_ratio = test_ratio

    def organize_by_labels(
        self,
        labels_file: Path | str,
        exclude_uncertain: bool = True
    ) -> Dict[str, int]:
        """Organize frames into train/val/test splits based on labels.

        Args:
            labels_file: JSON file with frame labels
            exclude_uncertain: Whether to exclude uncertain labels

        Returns:
            Dictionary with counts per split
        """
        # Load labels
        with open(labels_file) as f:
            labels = json.load(f)

        logger.info(f"Loaded {len(labels)} labeled frames")

        # Filter labels
        if exclude_uncertain:
            labels = {k: v for k, v in labels.items() if v != "uncertain"}
            logger.info(f"After filtering uncertain: {len(labels)} frames")

        # Group frames by label
        frames_by_label = {"ad": [], "content": []}
        for frame_path, label in labels.items():
            if label in frames_by_label:
                frames_by_label[label].append(frame_path)

        logger.info(f"Ads: {len(frames_by_label['ad'])}, "
                   f"Content: {len(frames_by_label['content'])}")

        # Split each label category
        counts = {"train": 0, "val": 0, "test": 0}

        for label, frames in frames_by_label.items():
            # Shuffle frames
            np.random.shuffle(frames)

            # Calculate split indices
            n_train = int(len(frames) * self.train_ratio)
            n_val = int(len(frames) * self.val_ratio)

            # Split frames
            train_frames = frames[:n_train]
            val_frames = frames[n_train:n_train + n_val]
            test_frames = frames[n_train + n_val:]

            # Copy frames to output directories
            self._copy_frames(train_frames, "train", label)
            self._copy_frames(val_frames, "val", label)
            self._copy_frames(test_frames, "test", label)

            counts["train"] += len(train_frames)
            counts["val"] += len(val_frames)
            counts["test"] += len(test_frames)

        logger.info(f"Dataset organized: train={counts['train']}, "
                   f"val={counts['val']}, test={counts['test']}")

        return counts

    def _copy_frames(
        self,
        frames: List[str],
        split: str,
        label: str
    ) -> None:
        """Copy frames to output directory.

        Args:
            frames: List of frame paths (relative to source_dir)
            split: Dataset split (train/val/test)
            label: Label (ad/content)
        """
        # Create output directory
        output_dir = self.output_dir / split / label
        output_dir.mkdir(parents=True, exist_ok=True)

        # Copy frames
        for frame_path in tqdm(frames, desc=f"Copying {split}/{label}", unit="frame"):
            source_path = self.source_dir / frame_path
            dest_path = output_dir / Path(frame_path).name

            if source_path.exists():
                # Read and write to copy
                import shutil
                shutil.copy2(source_path, dest_path)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Extract frames from videos")

    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # Extract command
    extract_parser = subparsers.add_parser("extract", help="Extract frames from video")
    extract_parser.add_argument("video", type=Path, help="Video file path")
    extract_parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        help="Output directory for frames"
    )
    extract_parser.add_argument(
        "--interval",
        type=float,
        default=1.0,
        help="Interval between frames in seconds (default: 1.0)"
    )
    extract_parser.add_argument(
        "--max-frames",
        type=int,
        help="Maximum number of frames to extract"
    )
    extract_parser.add_argument(
        "--start-time",
        type=float,
        default=0.0,
        help="Start time in seconds (default: 0)"
    )
    extract_parser.add_argument(
        "--end-time",
        type=float,
        help="End time in seconds (default: until end)"
    )
    extract_parser.add_argument(
        "--channel",
        type=str,
        help="Channel name for metadata"
    )
    extract_parser.add_argument(
        "--show",
        type=str,
        help="Show name for metadata"
    )
    extract_parser.add_argument(
        "--date",
        type=str,
        help="Recording date for metadata (YYYY-MM-DD)"
    )
    extract_parser.add_argument(
        "--resize",
        type=str,
        help="Resize frames to WIDTHxHEIGHT (e.g., 224x224)"
    )
    extract_parser.add_argument(
        "--format",
        type=str,
        default="jpg",
        choices=["jpg", "png"],
        help="Image format (default: jpg)"
    )

    # Organize command
    organize_parser = subparsers.add_parser("organize", help="Organize frames into dataset")
    organize_parser.add_argument(
        "--source-dir",
        type=Path,
        required=True,
        help="Source directory with all frames"
    )
    organize_parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        help="Output directory for organized dataset"
    )
    organize_parser.add_argument(
        "--labels-file",
        type=Path,
        required=True,
        help="JSON file with frame labels"
    )
    organize_parser.add_argument(
        "--train-ratio",
        type=float,
        default=0.7,
        help="Training data ratio (default: 0.7)"
    )
    organize_parser.add_argument(
        "--val-ratio",
        type=float,
        default=0.15,
        help="Validation data ratio (default: 0.15)"
    )
    organize_parser.add_argument(
        "--test-ratio",
        type=float,
        default=0.15,
        help="Test data ratio (default: 0.15)"
    )

    args = parser.parse_args()

    if args.command == "extract":
        # Parse resize if provided
        resize = None
        if args.resize:
            width, height = args.resize.split("x")
            resize = (int(width), int(height))

        # Extract frames
        extractor = VideoFrameExtractor(
            output_dir=args.output_dir,
            image_format=args.format
        )

        extractor.extract_frames(
            video_path=args.video,
            interval_seconds=args.interval,
            max_frames=args.max_frames,
            start_time_seconds=args.start_time,
            end_time_seconds=args.end_time,
            channel=args.channel,
            show=args.show,
            recording_date=args.date,
            resize=resize
        )

        # Save metadata
        extractor.save_metadata()

    elif args.command == "organize":
        # Organize dataset
        organizer = DatasetOrganizer(
            source_dir=args.source_dir,
            output_dir=args.output_dir,
            train_ratio=args.train_ratio,
            val_ratio=args.val_ratio,
            test_ratio=args.test_ratio
        )

        organizer.organize_by_labels(args.labels_file)

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
