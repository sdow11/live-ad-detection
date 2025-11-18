# Video Pipeline Architecture

## Executive Summary

This document details the video signal handling architecture for the Live Ad Detection system, specifically the **pass-through approach** where the Raspberry Pi acts as an inline video processor between the source (cable box, streaming device) and the TV.

## Architectural Decision: Pass-Through vs. Splitter

### Approach Comparison

| Aspect | Pass-Through (CHOSEN) | Splitter |
|--------|----------------------|----------|
| **Video Control** | Full control of output signal | Limited to TV's native PiP |
| **PiP Simulation** | Hardware-based, seamless | Requires TV remote control |
| **Latency** | Adds processing delay (~50-100ms) | No additional latency |
| **Alternate Content** | Can overlay/composite directly | Requires separate TV input |
| **Hardware Complexity** | Higher (input + output + processing) | Lower (input only) |
| **User Experience** | Seamless, no visible switching | May see input switching |
| **Cost** | Higher ($80-150 per device) | Lower ($30-60 per device) |

### Why Pass-Through?

1. **Complete Video Control**: We can manipulate the video signal in real-time
2. **Seamless PiP**: Overlay alternate content without switching TV inputs
3. **Better UX**: No visible channel changing or input switching
4. **Future Flexibility**: Can add other video features (overlays, effects, etc.)
5. **Independence**: Doesn't rely on TV's built-in PiP support

## Hardware Architecture

### Signal Flow

```
Cable Box / Streaming Device
         ↓ HDMI
   ┌─────────────────────────┐
   │   HDMI Input Capture    │
   │   (CSI-2 or USB 3.0)    │
   └───────────┬─────────────┘
               ↓
   ┌─────────────────────────┐
   │   Raspberry Pi 5        │
   │                         │
   │  ┌──────────────────┐   │
   │  │ Video Decoder    │   │
   │  │ (H.264/HEVC)     │   │
   │  └────────┬─────────┘   │
   │           ↓             │
   │  ┌──────────────────┐   │
   │  │ ML Inference     │   │
   │  │ Ad Detection     │   │
   │  └────────┬─────────┘   │
   │           ↓             │
   │  ┌──────────────────┐   │
   │  │ Video Compositor │   │
   │  │ (PiP Overlay)    │   │
   │  └────────┬─────────┘   │
   │           ↓             │
   │  ┌──────────────────┐   │
   │  │ Video Encoder    │   │
   │  │ (H.264/HEVC)     │   │
   │  └────────┬─────────┘   │
   └───────────┼─────────────┘
               ↓
   ┌─────────────────────────┐
   │   HDMI Output           │
   │   (via GPIO/USB-C)      │
   └───────────┬─────────────┘
               ↓ HDMI
            TV Display
```

### Required Hardware Components

#### 1. HDMI Input Capture

**Option A: Auvidea B101 HDMI to CSI-2 Bridge** (RECOMMENDED)
- **Interface**: CSI-2 camera interface (RPi 5 has 2x CSI ports)
- **Resolution**: Up to 1080p60
- **Latency**: ~20-30ms
- **Cost**: ~$100
- **Pros**:
  - Low latency via direct CSI connection
  - Hardware decoding support
  - Reliable for 24/7 operation
- **Cons**:
  - No 4K support
  - Requires custom device tree overlay
  - Limited to 1080p

**Option B: USB 3.0 HDMI Capture Card**
- **Interface**: USB 3.0 (RPi 5 has USB 3.0 ports)
- **Resolution**: Up to 4K30 or 1080p60
- **Latency**: ~40-60ms
- **Cost**: $40-80 (Elgato Cam Link, Magewell USB Capture)
- **Pros**:
  - Easier software integration (V4L2)
  - Potential 4K support
  - More vendor options
- **Cons**:
  - Higher latency than CSI
  - USB bandwidth contention
  - May have driver issues

**Decision**: Start with **Auvidea B101** for production, USB capture for prototyping

#### 2. Raspberry Pi 5 (Required)

**Why RPi 5 specifically:**
- **VideoCore VII GPU**: Hardware H.264/HEVC decode + encode
- **Dual CSI-2 interfaces**: Can handle input capture + optional secondary camera
- **8GB RAM option**: Needed for video buffering + ML models
- **PCIe Gen 2**: Can add HAT+ for AI acceleration
- **Dual 4Kp60 HDMI output**: Built-in video output capability

**Configuration:**
- Raspberry Pi 5 (8GB RAM): $80
- Active cooling: $5-10
- Power supply (27W USB-C PD): $12
- Case with cooling: $15

#### 3. HDMI Output

**Built-in HDMI Output on RPi 5:**
- 2x micro HDMI ports
- Supports 4Kp60, but we'll use 1080p60 to match input
- DRM/KMS for video output (no X11 overhead)
- Direct rendering via V4L2 M2M

#### 4. Optional: AI HAT+ for Acceleration

**Raspberry Pi AI HAT+:**
- Hailo-8L AI accelerator (13 TOPS)
- PCIe Gen 2 interface
- Accelerates ML inference, frees CPU for video processing
- Cost: ~$70
- **Benefit**: Can run heavier models or multiple models simultaneously

**Total Hardware Cost per Device:**
- Base: RPi 5 (8GB) + Auvidea B101 + IR blaster + case = ~$220
- With AI HAT+: ~$290
- Production volume (100+ units): ~$180-240 per device

## Software Architecture

### Video Processing Pipeline

#### 1. Input Stage: Video Capture

```python
# packages/edge-device/src/video/capture.py

class HDMICapture:
    """HDMI video capture using V4L2 interface."""

    def __init__(
        self,
        device: str = "/dev/video0",
        width: int = 1920,
        height: int = 1080,
        fps: int = 60
    ):
        self.device = device
        self.cap = cv2.VideoCapture(device, cv2.CAP_V4L2)
        self.cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc('H', '2', '6', '4'))
        self.cap.set(cv2.CAP_PROP_FPS, fps)

    async def capture_frame(self) -> np.ndarray:
        """Capture a single frame."""
        ret, frame = self.cap.read()
        if not ret:
            raise CaptureError("Failed to capture frame")
        return frame
```

**Key Technologies:**
- **V4L2 (Video4Linux2)**: Linux video capture API
- **OpenCV**: For frame acquisition and processing
- **Direct DMA**: Zero-copy video buffers where possible

#### 2. Analysis Stage: ML Inference

```python
# packages/edge-device/src/video/analyzer.py

class VideoAnalyzer:
    """Analyze video frames for ad detection."""

    def __init__(self, model_path: str):
        self.interpreter = tflite.Interpreter(model_path=model_path)
        self.interpreter.allocate_tensors()

    async def analyze_frame(self, frame: np.ndarray) -> AdDetectionResult:
        """Run inference on a frame."""
        # Preprocess
        input_frame = self.preprocess(frame)

        # Run inference
        self.interpreter.set_tensor(self.input_index, input_frame)
        self.interpreter.invoke()
        output = self.interpreter.get_tensor(self.output_index)

        return AdDetectionResult(
            is_ad=output[0] > 0.5,
            confidence=float(output[0]),
            timestamp=time.time()
        )
```

**Optimization Strategies:**
- **Inference Frequency**: Analyze every 2nd or 3rd frame (30fps input → 10-15fps inference)
- **Frame Downsampling**: Resize to 224x224 or 320x320 for inference
- **Temporal Smoothing**: Average predictions over 1-2 seconds to avoid false positives
- **Hardware Acceleration**: Use AI HAT+ if available, else CPU/GPU

#### 3. Composition Stage: PiP Overlay

```python
# packages/edge-device/src/video/compositor.py

class VideoCompositor:
    """Compose video with PiP overlay."""

    def __init__(self,
                 pip_width: int = 480,
                 pip_height: int = 270,
                 pip_position: Tuple[int, int] = (1400, 750)):
        self.pip_width = pip_width
        self.pip_height = pip_height
        self.pip_position = pip_position

    async def compose(
        self,
        main_frame: np.ndarray,
        pip_frame: Optional[np.ndarray] = None
    ) -> np.ndarray:
        """Compose main video with PiP overlay."""

        if pip_frame is None:
            return main_frame

        # Resize PiP frame
        pip_resized = cv2.resize(pip_frame, (self.pip_width, self.pip_height))

        # Composite onto main frame
        output = main_frame.copy()
        x, y = self.pip_position
        output[y:y+self.pip_height, x:x+self.pip_width] = pip_resized

        # Optional: Add border
        cv2.rectangle(output,
                     (x-2, y-2),
                     (x+self.pip_width+2, y+self.pip_height+2),
                     (255, 255, 255), 2)

        return output
```

**PiP Modes:**
1. **Ad Detected**: Show alternate content in full screen, original feed in small PiP
2. **Content Detected**: Show original feed full screen
3. **Manual Override**: Allow staff to manually enable/disable PiP

#### 4. Output Stage: HDMI Output

```python
# packages/edge-device/src/video/output.py

class HDMIOutput:
    """HDMI video output using DRM/KMS."""

    def __init__(self,
                 device: str = "/dev/dri/card0",
                 width: int = 1920,
                 height: int = 1080,
                 fps: int = 60):
        self.device = device
        self.drm_fd = self._init_drm()
        self.crtc = self._find_crtc()

    async def display_frame(self, frame: np.ndarray) -> None:
        """Display a frame on HDMI output."""
        # Convert to DRM framebuffer
        fb = self._frame_to_framebuffer(frame)

        # Page flip (vsync)
        self._page_flip(fb)
```

**Key Technologies:**
- **DRM/KMS (Direct Rendering Manager)**: Linux graphics API
- **V4L2 M2M (Mem2Mem)**: Hardware video encoding/decoding
- **VSync**: Synchronize with display refresh rate to avoid tearing

### Complete Pipeline Flow

```python
# packages/edge-device/src/video/pipeline.py

class VideoPassthroughPipeline:
    """Complete video passthrough pipeline with ad detection."""

    def __init__(self):
        self.capture = HDMICapture()
        self.analyzer = VideoAnalyzer(model_path="models/ad_detector.tflite")
        self.compositor = VideoCompositor()
        self.output = HDMIOutput()

        # State
        self.ad_detected = False
        self.alternate_feed = None  # Could be another channel

    async def run(self) -> None:
        """Main pipeline loop."""

        frame_count = 0

        while True:
            # Capture frame
            frame = await self.capture.capture_frame()

            # Analyze every 3rd frame (20fps inference at 60fps input)
            if frame_count % 3 == 0:
                result = await self.analyzer.analyze_frame(frame)

                # Update state based on detection
                if result.is_ad and not self.ad_detected:
                    logger.info("Ad detected, switching to PiP mode")
                    self.ad_detected = True
                    await self.on_ad_start()

                elif not result.is_ad and self.ad_detected:
                    logger.info("Content resumed, exiting PiP mode")
                    self.ad_detected = False
                    await self.on_ad_end()

            # Compose output
            if self.ad_detected and self.alternate_feed:
                # Show alternate content full screen, original in PiP
                output_frame = await self.compositor.compose(
                    main_frame=self.alternate_feed.get_frame(),
                    pip_frame=frame
                )
            else:
                # Show original feed
                output_frame = frame

            # Display
            await self.output.display_frame(output_frame)

            frame_count += 1

    async def on_ad_start(self) -> None:
        """Called when ad is detected."""
        # Initialize alternate feed (could be different channel)
        self.alternate_feed = AlternateFeedSource(channel="301")

    async def on_ad_end(self) -> None:
        """Called when content resumes."""
        # Cleanup alternate feed
        if self.alternate_feed:
            self.alternate_feed.close()
            self.alternate_feed = None
```

## Latency Analysis

### Target: < 100ms End-to-End Latency

| Stage | Latency | Notes |
|-------|---------|-------|
| HDMI Capture | 20-30ms | Auvidea B101 CSI-2 bridge |
| Frame Buffer | 16ms | At 60fps, 1 frame = 16.67ms |
| ML Inference | 20-40ms | TFLite on RPi 5 (224x224 input) |
| Composition | 5-10ms | GPU-accelerated if possible |
| HDMI Output | 16ms | VSync at 60fps |
| **Total** | **77-112ms** | Within acceptable range |

**Optimization Strategies:**
1. **Skip Inference**: Only analyze every Nth frame
2. **Pipeline Parallelism**: Capture, analyze, and output in parallel threads
3. **Hardware Decode/Encode**: Use VideoCore VII for zero-copy processing
4. **Reduced Resolution**: 720p60 instead of 1080p60 reduces processing
5. **AI HAT+**: Offload inference to dedicated accelerator

## Alternate Content Strategy

### Option 1: Pre-loaded Content
- Store video clips locally (sports highlights, restaurant promos)
- Loop during ad breaks
- Pros: No additional hardware, instant switching
- Cons: Limited content variety

### Option 2: Second HDMI Input
- Use USB HDMI capture for second input (alternate channel)
- Switch between inputs during ads
- Pros: Live content, more variety
- Cons: Requires second capture device (~$50)

### Option 3: Network Streaming
- Stream alternate content from local server or cloud
- Buffer ahead of time
- Pros: Unlimited content options
- Cons: Network dependency, buffering latency

**Recommended**: Start with Option 1 (pre-loaded), add Option 2 later

## Development Roadmap

### Phase 1: Basic Passthrough (Week 1-2)
- [ ] Set up RPi 5 with Auvidea B101
- [ ] Implement basic video capture (V4L2)
- [ ] Implement basic HDMI output (DRM/KMS)
- [ ] Test latency with simple passthrough (no processing)
- [ ] Target: < 50ms latency

### Phase 2: ML Integration (Week 3-4)
- [ ] Add frame preprocessing pipeline
- [ ] Integrate TFLite inference
- [ ] Implement frame skipping for performance
- [ ] Add temporal smoothing for detection
- [ ] Target: < 100ms latency with inference

### Phase 3: PiP Composition (Week 5-6)
- [ ] Implement video compositor
- [ ] Add PiP overlay rendering
- [ ] Integrate alternate content source
- [ ] Add smooth transitions
- [ ] Target: Seamless switching experience

### Phase 4: Optimization (Week 7-8)
- [ ] Profile pipeline for bottlenecks
- [ ] Optimize with hardware acceleration
- [ ] Add AI HAT+ support
- [ ] Multi-threading for parallel processing
- [ ] Target: 720p60 or 1080p60 stable

## Testing Strategy

### 1. Latency Testing
```bash
# Use latency-test.sh to measure end-to-end latency
./scripts/latency-test.sh
```

**Method**:
- Display millisecond counter on input
- Capture output with high-speed camera
- Calculate difference

### 2. Stress Testing
- Run 24+ hours continuous operation
- Monitor CPU temperature, throttling
- Check for frame drops or artifacts
- Memory leak detection

### 3. Integration Testing
- Test with real cable box/streaming device
- Various resolutions (720p, 1080p)
- Various frame rates (30fps, 60fps)
- HDCP handling (may need HDCP stripper for testing)

## Known Challenges & Mitigations

### Challenge 1: HDCP (High-bandwidth Digital Content Protection)

**Problem**: Most cable/streaming content is HDCP-protected, preventing capture

**Solutions**:
1. **HDCP Stripper** ($20-40): Small device that removes HDCP
   - Legal for personal use in most jurisdictions
   - May be gray area for commercial deployment
2. **HDCP-compatible Capture**: Some devices pass through HDCP
3. **Alternative**: Work with content providers for licensing

**Recommendation**: For prototyping, use HDCP stripper. For production, evaluate legal/licensing requirements per deployment location.

### Challenge 2: Video Quality Degradation

**Problem**: Encoding/decoding cycle may reduce quality

**Mitigation**:
- Use high bitrate for encoding (10-15 Mbps for 1080p)
- Hardware H.264 encoder on RPi 5 minimizes quality loss
- Test with side-by-side comparison

### Challenge 3: CPU/GPU Load

**Problem**: Video processing + ML inference is CPU-intensive

**Mitigation**:
- AI HAT+ offloads ML inference
- Hardware video encode/decode offloads video processing
- Optimize model (quantization, pruning)
- Reduce inference frequency (every 2-3 frames)

### Challenge 4: Power Consumption

**Problem**: RPi 5 + capture + output = ~15-20W

**Mitigation**:
- Use official 27W power supply
- Consider active cooling in enclosed spaces
- Monitor temperature, throttle if needed

## Cost Analysis

### Per-Device Cost Breakdown

| Component | Prototype | Production (100+) |
|-----------|-----------|-------------------|
| Raspberry Pi 5 (8GB) | $80 | $65 |
| Auvidea B101 HDMI-CSI | $100 | $85 |
| IR Blaster Module | $15 | $10 |
| Power Supply (27W) | $12 | $8 |
| Case + Cooling | $15 | $10 |
| MicroSD (64GB) | $12 | $8 |
| Cables (HDMI, power) | $10 | $5 |
| **Subtotal (Base)** | **$244** | **$191** |
| | | |
| Optional: AI HAT+ | $70 | $60 |
| Optional: 2nd HDMI Capture | $50 | $40 |
| **Total (Full Featured)** | **$364** | **$291** |

### Splitter Approach (for comparison)

| Component | Prototype | Production (100+) |
|-----------|-----------|-------------------|
| Raspberry Pi 5 (4GB) | $60 | $50 |
| USB HDMI Capture | $50 | $35 |
| HDMI Splitter | $15 | $10 |
| IR Blaster Module | $15 | $10 |
| Power Supply | $12 | $8 |
| Case + Cooling | $15 | $10 |
| MicroSD (32GB) | $8 | $5 |
| **Total** | **$175** | **$128** |

**Pass-through premium**: ~$60-100 per device, but provides significantly better UX and capabilities.

## Conclusion

The **pass-through architecture** is the right choice for this application because:

1. **User Experience**: Seamless PiP without visible switching
2. **Control**: Complete control over video output
3. **Flexibility**: Can add overlays, effects, branding in the future
4. **Independence**: Doesn't rely on TV capabilities

While it adds ~$60-100 per device in hardware costs and increases complexity, the superior user experience and future flexibility justify the investment for a bar/restaurant deployment where UX is critical.

**Next Steps**:
1. Order prototype hardware (RPi 5 + Auvidea B101)
2. Build basic passthrough test rig
3. Measure latency and video quality
4. Iterate on pipeline optimization
5. Add ML inference integration
