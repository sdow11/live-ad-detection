"""Web-based labeling tool for video frames.

This tool provides a simple web interface for labeling video frames as
"ad" or "content". Labels are saved to a JSON file that can be used for
training.

Features:
- Display frames sequentially
- Keyboard shortcuts (A=ad, C=content, U=uncertain, S=skip)
- Progress tracking
- Auto-save labels
- Resume from last labeled frame
"""

import argparse
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class LabelingTool:
    """Web-based labeling tool for video frames."""

    def __init__(
        self,
        frames_dir: Path | str,
        labels_file: Path | str,
        frame_extensions: List[str] = None
    ):
        """Initialize labeling tool.

        Args:
            frames_dir: Directory containing frames to label
            labels_file: JSON file to save labels
            frame_extensions: List of valid image extensions
        """
        self.frames_dir = Path(frames_dir)
        self.labels_file = Path(labels_file)
        self.frame_extensions = frame_extensions or [".jpg", ".jpeg", ".png"]

        # Load existing labels
        self.labels = self._load_labels()

        # Get list of frames
        self.frames = self._get_frames()

        # Current index
        self.current_index = self._get_last_labeled_index() + 1

        logger.info(f"Found {len(self.frames)} frames in {self.frames_dir}")
        logger.info(f"Loaded {len(self.labels)} existing labels")
        logger.info(f"Starting from frame {self.current_index}/{len(self.frames)}")

    def _load_labels(self) -> Dict[str, str]:
        """Load existing labels from file.

        Returns:
            Dictionary mapping frame paths to labels
        """
        if self.labels_file.exists():
            with open(self.labels_file) as f:
                return json.load(f)
        return {}

    def _save_labels(self) -> None:
        """Save labels to file."""
        self.labels_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.labels_file, "w") as f:
            json.dump(self.labels, f, indent=2)
        logger.info(f"Saved {len(self.labels)} labels to {self.labels_file}")

    def _get_frames(self) -> List[Path]:
        """Get list of frames to label.

        Returns:
            Sorted list of frame paths
        """
        frames = []
        for ext in self.frame_extensions:
            frames.extend(self.frames_dir.glob(f"**/*{ext}"))

        # Sort by path
        frames.sort()

        return frames

    def _get_last_labeled_index(self) -> int:
        """Get index of last labeled frame.

        Returns:
            Index of last labeled frame, or -1 if none
        """
        if not self.labels:
            return -1

        # Find the highest index that has a label
        for i in range(len(self.frames) - 1, -1, -1):
            frame_path = str(self.frames[i].relative_to(self.frames_dir))
            if frame_path in self.labels:
                return i

        return -1

    def get_current_frame(self) -> Optional[Dict[str, Any]]:
        """Get current frame to label.

        Returns:
            Frame information or None if all frames labeled
        """
        if self.current_index >= len(self.frames):
            return None

        frame_path = self.frames[self.current_index]
        relative_path = frame_path.relative_to(self.frames_dir)

        return {
            "index": self.current_index,
            "total": len(self.frames),
            "path": str(relative_path),
            "absolute_path": str(frame_path),
            "existing_label": self.labels.get(str(relative_path))
        }

    def add_label(self, label: str) -> bool:
        """Add label for current frame.

        Args:
            label: Label to add ("ad", "content", "uncertain", or "skip")

        Returns:
            True if successful, False if all frames labeled
        """
        frame_info = self.get_current_frame()
        if not frame_info:
            return False

        # Save label (unless skip)
        if label != "skip":
            self.labels[frame_info["path"]] = label

        # Move to next frame
        self.current_index += 1

        # Auto-save every 10 labels
        if len(self.labels) % 10 == 0:
            self._save_labels()

        return True

    def go_to_previous(self) -> bool:
        """Go to previous frame.

        Returns:
            True if successful, False if at first frame
        """
        if self.current_index > 0:
            self.current_index -= 1
            return True
        return False

    def get_stats(self) -> Dict[str, Any]:
        """Get labeling statistics.

        Returns:
            Dictionary with statistics
        """
        # Count labels by type
        label_counts = {}
        for label in self.labels.values():
            label_counts[label] = label_counts.get(label, 0) + 1

        return {
            "total_frames": len(self.frames),
            "labeled_frames": len(self.labels),
            "unlabeled_frames": len(self.frames) - len(self.labels),
            "progress_percent": (len(self.labels) / len(self.frames) * 100) if self.frames else 0,
            "label_counts": label_counts,
            "current_index": self.current_index
        }


def create_app(labeling_tool: LabelingTool) -> FastAPI:
    """Create FastAPI app for labeling.

    Args:
        labeling_tool: LabelingTool instance

    Returns:
        FastAPI app
    """
    app = FastAPI(title="Frame Labeling Tool")

    @app.get("/", response_class=HTMLResponse)
    async def index():
        """Serve labeling interface."""
        return HTML_TEMPLATE

    @app.get("/api/current")
    async def get_current():
        """Get current frame to label."""
        frame_info = labeling_tool.get_current_frame()
        if not frame_info:
            return {"done": True}
        return {"done": False, "frame": frame_info}

    @app.get("/api/stats")
    async def get_stats():
        """Get labeling statistics."""
        return labeling_tool.get_stats()

    @app.post("/api/label/{label}")
    async def add_label(label: str):
        """Add label for current frame.

        Args:
            label: Label to add
        """
        valid_labels = ["ad", "content", "uncertain", "skip"]
        if label not in valid_labels:
            raise HTTPException(400, f"Invalid label. Must be one of: {valid_labels}")

        success = labeling_tool.add_label(label)
        if not success:
            return {"done": True}

        next_frame = labeling_tool.get_current_frame()
        return {"done": next_frame is None, "frame": next_frame}

    @app.post("/api/previous")
    async def go_previous():
        """Go to previous frame."""
        success = labeling_tool.go_to_previous()
        if not success:
            raise HTTPException(400, "Already at first frame")

        frame_info = labeling_tool.get_current_frame()
        return {"frame": frame_info}

    @app.post("/api/save")
    async def save_labels():
        """Manually save labels."""
        labeling_tool._save_labels()
        return {"status": "saved"}

    @app.get("/frames/{path:path}")
    async def get_frame(path: str):
        """Serve frame image.

        Args:
            path: Relative path to frame
        """
        frame_path = labeling_tool.frames_dir / path
        if not frame_path.exists():
            raise HTTPException(404, "Frame not found")
        return FileResponse(frame_path)

    return app


HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Frame Labeling Tool</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a1a;
            color: #fff;
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        .header {
            background: #2a2a2a;
            padding: 1rem 2rem;
            border-bottom: 2px solid #3a3a3a;
        }

        .header h1 {
            font-size: 1.5rem;
            margin-bottom: 0.5rem;
        }

        .stats {
            display: flex;
            gap: 2rem;
            font-size: 0.9rem;
            color: #aaa;
        }

        .stats .stat {
            display: flex;
            gap: 0.5rem;
        }

        .stats .stat-value {
            color: #4CAF50;
            font-weight: bold;
        }

        .main {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 2rem;
            overflow: hidden;
        }

        .image-container {
            max-width: 90%;
            max-height: 70vh;
            margin-bottom: 2rem;
        }

        .image-container img {
            max-width: 100%;
            max-height: 70vh;
            object-fit: contain;
            border: 2px solid #3a3a3a;
            border-radius: 8px;
        }

        .controls {
            display: flex;
            gap: 1rem;
            margin-bottom: 1rem;
        }

        button {
            padding: 1rem 2rem;
            font-size: 1rem;
            font-weight: bold;
            border: 2px solid;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
            min-width: 120px;
        }

        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .btn-ad {
            background: #f44336;
            color: white;
            border-color: #d32f2f;
        }

        .btn-content {
            background: #4CAF50;
            color: white;
            border-color: #388E3C;
        }

        .btn-uncertain {
            background: #FF9800;
            color: white;
            border-color: #F57C00;
        }

        .btn-skip {
            background: #757575;
            color: white;
            border-color: #616161;
        }

        .btn-previous {
            background: #2196F3;
            color: white;
            border-color: #1976D2;
        }

        .shortcuts {
            color: #aaa;
            font-size: 0.9rem;
            margin-top: 1rem;
            text-align: center;
        }

        .shortcuts kbd {
            background: #3a3a3a;
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
            font-family: monospace;
            margin: 0 0.2rem;
        }

        .progress {
            width: 100%;
            max-width: 800px;
            height: 8px;
            background: #3a3a3a;
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 0.5rem;
        }

        .progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #4CAF50, #8BC34A);
            transition: width 0.3s;
        }

        .frame-info {
            color: #aaa;
            font-size: 0.9rem;
            margin-bottom: 1rem;
        }

        .done {
            text-align: center;
        }

        .done h2 {
            font-size: 2rem;
            color: #4CAF50;
            margin-bottom: 1rem;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Frame Labeling Tool</h1>
        <div class="stats" id="stats">
            <div class="stat">
                <span>Progress:</span>
                <span class="stat-value" id="progress">0%</span>
            </div>
            <div class="stat">
                <span>Labeled:</span>
                <span class="stat-value" id="labeled">0</span>
            </div>
            <div class="stat">
                <span>Ads:</span>
                <span class="stat-value" id="ads">0</span>
            </div>
            <div class="stat">
                <span>Content:</span>
                <span class="stat-value" id="content">0</span>
            </div>
            <div class="stat">
                <span>Uncertain:</span>
                <span class="stat-value" id="uncertain">0</span>
            </div>
        </div>
    </div>

    <div class="main">
        <div id="labeling-view">
            <div class="progress">
                <div class="progress-bar" id="progress-bar" style="width: 0%"></div>
            </div>

            <div class="frame-info" id="frame-info">Loading...</div>

            <div class="image-container">
                <img id="frame-image" src="" alt="Frame to label">
            </div>

            <div class="controls">
                <button class="btn-previous" onclick="goPrevious()">← Previous</button>
                <button class="btn-ad" onclick="addLabel('ad')">Advertisement (A)</button>
                <button class="btn-content" onclick="addLabel('content')">Content (C)</button>
                <button class="btn-uncertain" onclick="addLabel('uncertain')">Uncertain (U)</button>
                <button class="btn-skip" onclick="addLabel('skip')">Skip (S)</button>
            </div>

            <div class="shortcuts">
                Keyboard shortcuts:
                <kbd>A</kbd> = Ad
                <kbd>C</kbd> = Content
                <kbd>U</kbd> = Uncertain
                <kbd>S</kbd> = Skip
                <kbd>←</kbd> = Previous
                <kbd>Ctrl+S</kbd> = Save
            </div>
        </div>

        <div id="done-view" style="display: none;" class="done">
            <h2>✓ All frames labeled!</h2>
            <p>Labels have been saved automatically.</p>
        </div>
    </div>

    <script>
        let currentFrame = null;

        async function loadCurrent() {
            const response = await fetch('/api/current');
            const data = await response.json();

            if (data.done) {
                showDone();
                return;
            }

            currentFrame = data.frame;
            displayFrame();
            updateStats();
        }

        function displayFrame() {
            const img = document.getElementById('frame-image');
            const info = document.getElementById('frame-info');

            img.src = `/frames/${currentFrame.path}`;

            const existingLabel = currentFrame.existing_label ? ` (currently: ${currentFrame.existing_label})` : '';
            info.textContent = `Frame ${currentFrame.index + 1} / ${currentFrame.total}${existingLabel}`;

            // Update progress bar
            const progressPercent = ((currentFrame.index) / currentFrame.total) * 100;
            document.getElementById('progress-bar').style.width = `${progressPercent}%`;
        }

        async function updateStats() {
            const response = await fetch('/api/stats');
            const stats = await response.json();

            document.getElementById('progress').textContent = `${stats.progress_percent.toFixed(1)}%`;
            document.getElementById('labeled').textContent = stats.labeled_frames;
            document.getElementById('ads').textContent = stats.label_counts.ad || 0;
            document.getElementById('content').textContent = stats.label_counts.content || 0;
            document.getElementById('uncertain').textContent = stats.label_counts.uncertain || 0;
        }

        async function addLabel(label) {
            const response = await fetch(`/api/label/${label}`, { method: 'POST' });
            const data = await response.json();

            if (data.done) {
                showDone();
                return;
            }

            currentFrame = data.frame;
            displayFrame();
            updateStats();
        }

        async function goPrevious() {
            const response = await fetch('/api/previous', { method: 'POST' });
            const data = await response.json();

            currentFrame = data.frame;
            displayFrame();
            updateStats();
        }

        async function saveLabels() {
            await fetch('/api/save', { method: 'POST' });
            console.log('Labels saved');
        }

        function showDone() {
            document.getElementById('labeling-view').style.display = 'none';
            document.getElementById('done-view').style.display = 'block';
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            switch (e.key.toLowerCase()) {
                case 'a':
                    addLabel('ad');
                    break;
                case 'c':
                    addLabel('content');
                    break;
                case 'u':
                    addLabel('uncertain');
                    break;
                case 's':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        saveLabels();
                    } else {
                        addLabel('skip');
                    }
                    break;
                case 'arrowleft':
                    goPrevious();
                    break;
            }
        });

        // Auto-save on page unload
        window.addEventListener('beforeunload', () => {
            saveLabels();
        });

        // Load initial frame
        loadCurrent();
    </script>
</body>
</html>
"""


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Web-based frame labeling tool")
    parser.add_argument(
        "frames_dir",
        type=Path,
        help="Directory containing frames to label"
    )
    parser.add_argument(
        "--labels-file",
        type=Path,
        default=Path("labels.json"),
        help="JSON file to save labels (default: labels.json)"
    )
    parser.add_argument(
        "--host",
        type=str,
        default="127.0.0.1",
        help="Host to bind to (default: 127.0.0.1)"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8080,
        help="Port to bind to (default: 8080)"
    )

    args = parser.parse_args()

    # Create labeling tool
    labeling_tool = LabelingTool(
        frames_dir=args.frames_dir,
        labels_file=args.labels_file
    )

    # Create app
    app = create_app(labeling_tool)

    # Run server
    logger.info(f"Starting labeling tool at http://{args.host}:{args.port}")
    logger.info(f"Labeling frames from: {args.frames_dir}")
    logger.info(f"Saving labels to: {args.labels_file}")
    logger.info("Press Ctrl+C to stop and save labels")

    try:
        uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    finally:
        # Save labels on exit
        labeling_tool._save_labels()
        logger.info("Labels saved. Goodbye!")


if __name__ == "__main__":
    main()
