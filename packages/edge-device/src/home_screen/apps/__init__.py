"""Home Screen Apps.

Collection of built-in applications for the home screen platform.
"""

from home_screen.apps.ad_detection_app import AdDetectionApp
from home_screen.apps.trivia_app import TriviaApp
from home_screen.apps.karaoke_app import KaraokeApp
from home_screen.apps.web_browser_app import WebBrowserApp
from home_screen.apps.video_channels_app import VideoChannelsApp, VideoChannel

__all__ = [
    "AdDetectionApp",
    "TriviaApp",
    "KaraokeApp",
    "WebBrowserApp",
    "VideoChannelsApp",
    "VideoChannel",
]
