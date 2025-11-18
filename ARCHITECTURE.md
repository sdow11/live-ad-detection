# Live Ad Detection System - Architecture

## Executive Summary

A distributed edge ML system for real-time advertisement detection on live TV, deployed on Raspberry Pi devices with enterprise management capabilities for bars and restaurants.

## System Overview

### Core Functionality
1. **Real-time Ad Detection**: ML models detect advertisements in live TV streams
2. **Automated Response**: Trigger channel changes, PiP mode, or content switching
3. **Edge Processing**: All inference happens on-device for low latency
4. **Distributed Management**: Centralized control of multiple deployed devices
5. **Model Lifecycle**: Training, optimization, delivery, and versioning

## Architecture Layers

### 1. Edge Layer (Raspberry Pi Devices)
```
┌─────────────────────────────────────────────────────────┐
│                  Raspberry Pi Device                      │
├─────────────────────────────────────────────────────────┤
│  Video Capture → Frame Processing → ML Inference         │
│       ↓                                ↓                 │
│  Ad Detection Engine ←→ Model Manager                    │
│       ↓                                                   │
│  Action Controller → TV Interface (IR/BT/API)            │
│       ↓                                                   │
│  Telemetry & Logging                                     │
└─────────────────────────────────────────────────────────┘
```

**Components:**
- **Video Capture Service**: Capture frames from HDMI/streaming source
- **Frame Processor**: Preprocessing, resizing, optimization
- **ML Inference Engine**: Run detection models (TensorFlow Lite, ONNX Runtime)
- **Model Manager**: Download, cache, and switch models dynamically
- **Action Controller**: Execute responses based on detection
- **TV Interface**: Control via IR blaster, Bluetooth, HTTP APIs
- **Device Agent**: Health monitoring, telemetry, updates

**Hardware:**
- Raspberry Pi 4/5 (4GB+ RAM)
- Optional: Raspberry Pi AI HAT for acceleration
- HDMI capture device OR network streaming
- IR blaster module
- Bluetooth adapter (if not built-in)

### 2. Cloud/Server Layer

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  ML Training     │  │  Model Registry  │  │  Enterprise      │
│  Pipeline        │→ │  & CDN           │← │  Dashboard       │
└──────────────────┘  └──────────────────┘  └──────────────────┘
         ↓                     ↓                      ↓
    ┌────────────────────────────────────────────────────┐
    │           Device Management & Orchestration         │
    │  (Fleet management, deployment, monitoring)        │
    └────────────────────────────────────────────────────┘
                            ↓
                 ┌──────────────────────┐
                 │   Edge Devices       │
                 │   (Raspberry Pis)    │
                 └──────────────────────┘
```

**Components:**
- **ML Training Infrastructure**: Train and validate models
- **Model Optimization Pipeline**: Convert to edge-optimized formats
- **Model Registry**: Version control and artifact storage
- **CDN/Delivery**: Fast model distribution
- **Enterprise Dashboard**: Management UI for customers
- **Device Orchestration**: Fleet management, configuration
- **Telemetry Analytics**: Aggregated performance metrics

### 3. ML Model Architecture

**Multi-Tier Detection Strategy:**

```
Live TV Stream
     ↓
┌────────────────────────┐
│  Tier 1: General       │  Always running
│  Ad Detector           │  Lightweight, fast
│  (Base Model)          │  Detects: ad vs content
└────────────┬───────────┘
             ↓ (if ad detected)
┌────────────────────────┐
│  Tier 2: Context       │  Loaded per channel/show
│  Specific Models       │  More accurate
│  (Show/Sport Models)   │  Confirms detection
└────────────────────────┘
```

**Model Types:**

1. **General Ad Detector (Base Model)**
   - Trained on common ad patterns (logos, black frames, audio signatures)
   - Runs continuously
   - ~5-10 MB model size
   - <100ms inference time

2. **Show-Specific Models**
   - Trained on specific syndicated shows (Friends, Seinfeld, etc.)
   - Knows typical ad break patterns
   - ~10-20 MB per show

3. **Sports-Specific Models**
   - Trained per sport (NFL, NBA, MLB, etc.)
   - Recognizes scoreboards, field markings
   - Understands game flow and commercial break timing
   - ~15-30 MB per sport

4. **Channel-Specific Models**
   - Network-specific ad patterns (ESPN, CBS, NBC, etc.)
   - Logo detection
   - ~5-10 MB per channel

**Model Switching Strategy:**
- Load base model on startup
- Pre-load context models based on schedule/channel
- Keep 2-3 models in memory (base + current context + next context)
- Use vLLM-inspired dynamic loading for quick swaps

## Technology Stack

### Edge (Raspberry Pi)

**Runtime & ML:**
- **Python 3.11+** - Main application language
- **TensorFlow Lite** - Primary inference engine
- **ONNX Runtime** - Alternative inference engine
- **OpenCV** - Video processing
- **PyTorch** (optional) - For some preprocessing

**System Services:**
- **systemd** - Service management
- **Docker** (optional) - Containerized deployment
- **gRPC** - Communication with cloud
- **MQTT** - Lightweight messaging
- **SQLite** - Local state/cache

**TV Control:**
- **LIRC** - IR blaster control
- **BlueZ** - Bluetooth communication
- **python-cec** - HDMI CEC control
- **requests** - HTTP API calls

### Cloud/Server

**Backend:**
- **Python/FastAPI** - API services
- **Go** (optional) - High-performance services
- **PostgreSQL** - Primary database
- **Redis** - Caching and queuing
- **S3/MinIO** - Model storage
- **CloudFront/CDN** - Model distribution

**ML Training:**
- **PyTorch** - Model training
- **TensorFlow** - Alternative framework
- **MLflow** - Experiment tracking
- **DVC** - Data version control
- **Kubernetes** - Training job orchestration
- **Ray** - Distributed training

**Model Optimization:**
- **TensorFlow Model Optimization Toolkit** - Quantization, pruning
- **ONNX** - Model conversion
- **TensorRT** (if using Jetson) - GPU optimization
- **Neural Network Compression Framework**

**Monitoring & Ops:**
- **Prometheus** - Metrics collection
- **Grafana** - Visualization
- **ELK Stack** - Logging
- **Docker/K8s** - Orchestration

### Frontend

- **React/Next.js** - Enterprise dashboard
- **TypeScript** - Type safety
- **TailwindCSS** - Styling
- **Recharts/D3** - Analytics visualization

## Data Flow

### Training Pipeline
```
1. Data Collection
   ↓ (labeled TV recordings)
2. Data Processing & Augmentation
   ↓
3. Model Training (PyTorch/TF)
   ↓
4. Model Evaluation & Validation
   ↓
5. Model Optimization (quantization, pruning)
   ↓
6. Conversion to Edge Format (TFLite/ONNX)
   ↓
7. Model Registry Upload
   ↓
8. CDN Distribution
```

### Inference Pipeline (Edge)
```
1. Video Frame Capture (30 FPS)
   ↓
2. Frame Preprocessing (resize, normalize)
   ↓
3. Model Inference (every N frames)
   ↓
4. Temporal Smoothing (avoid false positives)
   ↓
5. Confidence Threshold Check
   ↓
6. Action Trigger (if ad detected)
   ↓
7. TV Control Command
   ↓
8. Telemetry Upload
```

### Model Update Flow
```
1. Device checks for updates (periodic)
   ↓
2. Cloud provides available models based on:
   - Current schedule
   - Channel
   - Location
   ↓
3. Device downloads models (differential updates)
   ↓
4. Validates checksums
   ↓
5. Loads into memory/cache
   ↓
6. Swaps model when appropriate
```

## Key Technical Challenges & Solutions

### 1. Real-time Performance
**Challenge**: Process video frames and run ML inference with <200ms latency

**Solutions:**
- Frame sampling: Analyze every 3rd-5th frame (not every frame)
- Model quantization: INT8 quantization for 4x speedup
- Hardware acceleration: Use Raspberry Pi AI HAT when available
- Optimized preprocessing: Use OpenCV with hardware acceleration
- Multi-threading: Separate capture, inference, and action threads

### 2. Model Size Constraints
**Challenge**: Raspberry Pi has limited RAM (~2-4GB available)

**Solutions:**
- Model compression: Pruning + quantization
- Target size: <10MB for base model, <30MB total loaded
- Dynamic loading: Swap models on-demand using mmap
- Model distillation: Train smaller models from larger teachers
- Shared feature extractors: Reuse base layers across models

### 3. Network Bandwidth
**Challenge**: Many devices downloading large models

**Solutions:**
- CDN distribution for geographic proximity
- Differential updates: Only send changed weights
- Compression: GZIP/Brotli for transfer
- Pre-caching: Schedule-aware prefetching
- P2P distribution: Devices share models locally (optional)

### 4. Model Accuracy
**Challenge**: High accuracy needed to avoid false positives

**Solutions:**
- Temporal smoothing: Require N consecutive detections
- Multi-model voting: Combine base + context models
- Confidence thresholds: Configurable per deployment
- Continuous learning: Feedback loop for improvements
- Ensemble methods: Combine audio + visual signals

### 5. Channel Switching Logic
**Challenge**: Seamless model transitions when channel changes

**Solutions:**
- Electronic Program Guide (EPG) integration
- Schedule-aware pre-loading
- Channel detection: OCR on channel number
- Quick model swaps using pre-loaded memory
- Fallback to general model during transitions

### 6. TV Control Reliability
**Challenge**: Different TVs use different control methods

**Solutions:**
- Multi-protocol support: IR, Bluetooth, CEC, HTTP
- Device fingerprinting: Auto-detect TV capabilities
- Retry logic with exponential backoff
- Manual configuration UI for edge cases
- Fallback methods if primary fails

## Enterprise Features

### Multi-Tenant Support
- Separate deployments per customer
- Custom configuration per location
- Usage-based billing tracking
- Data isolation and privacy

### Fleet Management
- Remote device provisioning
- OTA updates for software and models
- Health monitoring and alerts
- Configuration management
- Remote debugging and logs

### Analytics Dashboard
- Ad detection accuracy metrics
- Device health and uptime
- Model performance tracking
- Channel switching statistics
- Customer-facing reports

### Scalability
- Support for 1,000+ devices per customer
- Multi-region deployment
- High-availability architecture
- Auto-scaling inference capacity
- Database sharding for large fleets

## Development Principles

### Test-Driven Development (TDD)
- Unit tests for all modules (>80% coverage)
- Integration tests for pipelines
- End-to-end tests for critical flows
- Mock services for external dependencies
- CI/CD with automated testing

### SOLID Principles
- **Single Responsibility**: Each module has one clear purpose
- **Open/Closed**: Extensible without modification
- **Liskov Substitution**: Proper abstraction hierarchies
- **Interface Segregation**: Minimal, focused interfaces
- **Dependency Inversion**: Depend on abstractions, not concretions

### DRY (Don't Repeat Yourself)
- Shared libraries for common functionality
- Configuration-driven behavior
- Code generation where appropriate
- Template-based deployments

### Additional Practices
- Type hints throughout Python code
- Comprehensive API documentation
- Logging and observability
- Security by default
- Graceful degradation

## Security & Privacy

- End-to-end encryption for model downloads
- Secure device authentication (mutual TLS)
- No video data sent to cloud (edge-only processing)
- Anonymized telemetry
- Regular security audits
- GDPR/CCPA compliance
- Secure boot and updates

## Deployment Models

### Development
- Single Raspberry Pi with test TV
- Local cloud services (Docker Compose)
- Sample video files for testing

### Staging
- 5-10 devices in test environment
- Cloud services in staging environment
- Real TV integration testing

### Production
- Distributed edge devices
- Multi-region cloud deployment
- CDN for model distribution
- 24/7 monitoring and support

## Cost Optimization

### Edge
- Use open-source software exclusively
- Optimize for Raspberry Pi 4 (lower cost than 5)
- Reuse models across devices
- Local caching to minimize bandwidth

### Cloud
- Serverless where possible (Lambda, Cloud Functions)
- Spot instances for training
- S3 lifecycle policies for old models
- Auto-scaling for variable load
- Open-source tools (avoid vendor lock-in)

## Future Enhancements

1. **Audio Detection**: Analyze volume changes and audio fingerprints
2. **Content Insertion**: Show custom content instead of ads
3. **Multi-Stream**: Handle multiple TVs per device
4. **Predictive Loading**: ML for predicting next channel/show
5. **Federated Learning**: Train models on-device data
6. **Mobile App**: Customer control and monitoring
7. **A/B Testing**: Experiment with different models
8. **Real-time Training**: Adapt to new ad patterns quickly

## Success Metrics

### Technical
- Inference latency: <100ms
- Model accuracy: >95% precision, >90% recall
- Device uptime: >99.5%
- Model download time: <30 seconds
- False positive rate: <1%

### Business
- Deployment time: <30 minutes per device
- Customer satisfaction: >4.5/5
- Cost per device: <$200 hardware + <$5/month cloud
- Support ticket rate: <1 per 100 devices per month

## Conclusion

This architecture provides a solid foundation for a scalable, distributed edge ML system. The modular design allows for incremental development and deployment while maintaining flexibility for future enhancements.
