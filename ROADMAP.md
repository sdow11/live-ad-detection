# Implementation Roadmap

## Overview

This roadmap breaks down the Live Ad Detection system into manageable phases, following TDD, SOLID, and DRY principles throughout.

## Phase 0: Foundation (Weeks 1-2)

**Goal**: Set up monorepo infrastructure and development environment

### Tasks

1. **Monorepo Setup**
   - Initialize directory structure
   - Set up build system (Makefile, scripts)
   - Configure Python packaging (pyproject.toml, Poetry)
   - Configure Node.js workspace (for frontend)
   - Set up pre-commit hooks

2. **Development Tooling**
   - Linting: pylint, flake8, black, isort
   - Type checking: mypy
   - Testing: pytest, coverage
   - Documentation: Sphinx
   - CI/CD: GitHub Actions workflows

3. **Shared Libraries**
   - Create `shared/python-common` package
   - Define common interfaces and protocols
   - Set up logging utilities
   - Create configuration management
   - Define gRPC/Protocol Buffer schemas

4. **Local Development Environment**
   - Docker Compose for local services
   - PostgreSQL database
   - Redis cache
   - MinIO (S3-compatible storage)
   - Setup scripts

**Deliverables**:
- ✅ Working monorepo structure
- ✅ CI/CD pipelines
- ✅ Developer documentation
- ✅ Local dev environment

---

## Phase 1: MVP - Single Device Proof of Concept (Weeks 3-6)

**Goal**: Build a working prototype on a single Raspberry Pi that can detect ads and change channels

### 1.1 Basic Video Capture (Week 3)

**TDD Approach**:
- Write tests for frame capture
- Mock video sources
- Test frame rate, resolution handling

**Implementation**:
- Set up OpenCV video capture
- Support file input (for testing)
- Support HDMI capture device
- Frame preprocessing pipeline
- Circular buffer for frames

**Code** (`packages/edge-device/src/video/`):
```python
# Tests first!
def test_video_capture_opens_file():
    """Test that VideoCapture can open a test file"""

def test_frame_preprocessing_resizes():
    """Test frame is resized to model input size"""

# Then implementation
class VideoCapture:
    def capture_frame(self) -> np.ndarray:
        ...
```

### 1.2 Simple ML Model (Week 3-4)

**TDD Approach**:
- Write tests with sample frames
- Test model loading
- Test inference outputs

**Implementation**:
- Train a simple binary classifier (ad vs. content)
- Use MobileNetV2 or EfficientNet-Lite as backbone
- Train on ~1000 labeled frames
- Convert to TensorFlow Lite
- Quantize to INT8

**Code** (`packages/ml-training/src/`):
```python
# Tests
def test_model_loads():
    """Test TFLite model loads correctly"""

def test_model_inference_shape():
    """Test model output shape is correct"""

# Implementation
class AdDetectorTrainer:
    def train(self, dataset: Dataset) -> Model:
        ...
```

### 1.3 Inference Engine (Week 4)

**TDD Approach**:
- Mock model outputs
- Test inference pipeline
- Test performance metrics

**Implementation**:
- TensorFlow Lite runtime
- Frame batching and preprocessing
- Temporal smoothing (5-frame window)
- Confidence thresholding

**Code** (`packages/edge-device/src/inference/`):
```python
# Tests
def test_inference_engine_detects_ad():
    """Test engine detects ad from mock frames"""

def test_temporal_smoothing():
    """Test false positives are smoothed out"""

# Implementation
class InferenceEngine:
    def predict(self, frame: np.ndarray) -> float:
        ...
```

### 1.4 TV Control - IR Blaster (Week 5)

**TDD Approach**:
- Mock LIRC commands
- Test command sequences
- Test retry logic

**Implementation**:
- Install and configure LIRC
- IR blaster hardware setup
- Channel change commands
- Basic TV brand support (Samsung, LG, Sony)

**Code** (`packages/edge-device/src/tv_control/`):
```python
# Tests
def test_ir_blaster_sends_command():
    """Test IR command is sent via LIRC"""

def test_channel_change_sequence():
    """Test channel change with multi-digit channels"""

# Implementation
class IRBlaster:
    def send_command(self, command: str) -> bool:
        ...
```

### 1.5 End-to-End Integration (Week 6)

**TDD Approach**:
- Integration tests with all components
- End-to-end tests with sample videos
- Performance benchmarks

**Implementation**:
- Connect all components
- State machine for detection → action
- Configuration file (YAML)
- Simple CLI interface
- Logging and metrics

**Code** (`packages/edge-device/src/main.py`):
```python
# Tests
def test_e2e_ad_detection_triggers_action():
    """Test full pipeline from video to TV control"""

# Implementation
class AdDetectionSystem:
    def run(self):
        while True:
            frame = self.video_capture.capture_frame()
            prediction = self.inference_engine.predict(frame)
            if prediction > threshold:
                self.tv_controller.change_channel()
```

**Deliverables**:
- ✅ Working prototype on Raspberry Pi
- ✅ Can detect simple ads in test videos
- ✅ Can change TV channels via IR
- ✅ Basic performance metrics
- ✅ Unit test coverage >80%

---

## Phase 2: Cloud Infrastructure (Weeks 7-10)

**Goal**: Build cloud services to support device management and model delivery

### 2.1 Cloud API Service (Week 7-8)

**TDD Approach**:
- API tests with FastAPI TestClient
- Mock database interactions
- Test authentication

**Implementation**:
- FastAPI application
- Device registration endpoints
- Authentication (JWT)
- PostgreSQL database with SQLAlchemy
- Alembic migrations

**Endpoints**:
```python
POST   /api/v1/devices/register
GET    /api/v1/devices/{device_id}
GET    /api/v1/devices/{device_id}/config
POST   /api/v1/telemetry
```

### 2.2 Model Registry (Week 8)

**TDD Approach**:
- Test model upload/download
- Test version management
- Test checksum validation

**Implementation**:
- Model upload API
- S3/MinIO storage
- Model metadata database
- Version management
- CDN integration (CloudFront)

**Endpoints**:
```python
POST   /api/v1/models/upload
GET    /api/v1/models/{model_id}/download
GET    /api/v1/models/latest
```

### 2.3 Device Agent (Week 9)

**TDD Approach**:
- Mock cloud API responses
- Test update mechanism
- Test rollback logic

**Implementation**:
- Background service on device
- Heartbeat to cloud (every 5 minutes)
- Model update checking
- Configuration sync
- Telemetry upload

**Code** (`packages/edge-device/src/device/agent.py`):
```python
class DeviceAgent:
    async def heartbeat(self):
        """Send health status to cloud"""

    async def check_for_updates(self):
        """Check for model/config updates"""

    async def upload_telemetry(self):
        """Upload metrics to cloud"""
```

### 2.4 Telemetry & Monitoring (Week 10)

**Implementation**:
- Prometheus metrics
- Grafana dashboards
- ELK stack for logs
- Alert rules
- Device health monitoring

**Deliverables**:
- ✅ Cloud API deployed (staging)
- ✅ Model registry working
- ✅ Devices communicate with cloud
- ✅ Basic monitoring dashboards

---

## Phase 3: Advanced ML Models (Weeks 11-14)

**Goal**: Improve detection accuracy with context-specific models

### 3.1 Data Collection & Labeling (Week 11)

**Tasks**:
- Record TV content (various channels, shows, sports)
- Label ad segments vs. content
- Create balanced dataset (~10,000 frames)
- Data augmentation pipeline
- Train/val/test splits

**Tools**:
- Custom labeling UI (simple React app)
- Scripts for data processing
- DVC for data version control

### 3.2 Enhanced Base Model (Week 11-12)

**Improvements**:
- Larger dataset
- Better architecture (EfficientNet-B0)
- Multi-feature detection:
  - Logo detection
  - Black frame detection
  - Audio volume changes
  - Scene transition patterns
- Ensemble approach

**Target Metrics**:
- Precision: >95%
- Recall: >90%
- Inference time: <50ms

### 3.3 Show-Specific Models (Week 12-13)

**Implementation**:
- Train models for popular syndicated shows:
  - Friends
  - Seinfeld
  - The Office
  - Family Guy
  - etc.
- Learn show-specific patterns
- Model size: <20MB each
- Use transfer learning from base model

### 3.4 Sports-Specific Models (Week 13-14)

**Implementation**:
- Train models for major sports:
  - NFL
  - NBA
  - MLB
  - NHL
- Detect scoreboards, field markings
- Understand game flow
- Model size: <30MB each

### 3.5 Dynamic Model Loading (Week 14)

**TDD Approach**:
- Test model switching
- Test memory management
- Test pre-loading logic

**Implementation**:
- Model cache manager
- LRU eviction policy
- Pre-load based on schedule
- Quick swapping (<1 second)
- Memory-mapped files for efficiency

**Code** (`packages/edge-device/src/models/manager.py`):
```python
class ModelManager:
    def load_model(self, model_id: str) -> Model:
        """Load model from cache or download"""

    def preload_models(self, schedule: Schedule):
        """Pre-load models based on TV schedule"""

    def switch_model(self, new_model_id: str):
        """Hot-swap to new model"""
```

**Deliverables**:
- ✅ High-accuracy base model (>95% precision)
- ✅ 10+ show-specific models
- ✅ 5+ sports-specific models
- ✅ Dynamic model switching working
- ✅ Improved edge detection performance

---

## Phase 4: Advanced TV Control (Weeks 15-16)

**Goal**: Support multiple TV control methods and PiP mode

### 4.1 Multi-Protocol TV Control (Week 15)

**TDD Approach**:
- Test each protocol independently
- Test fallback logic
- Test auto-detection

**Implementation**:
- HDMI CEC support (python-cec)
- Bluetooth support (BlueZ)
- Smart TV HTTP APIs (Samsung, LG webOS, Roku)
- Device fingerprinting
- Automatic protocol selection

**Code** (`packages/edge-device/src/tv_control/controller.py`):
```python
class TVController:
    protocols: List[TVProtocol]

    def detect_tv_capabilities(self) -> List[str]:
        """Auto-detect available control methods"""

    def send_command(self, cmd: Command) -> bool:
        """Send command using best available protocol"""
```

### 4.2 Picture-in-Picture Mode (Week 16)

**Challenges**:
- Not all TVs support PiP
- Different implementations per brand
- May require external hardware

**Implementation**:
- Detect PiP capability
- Alternative: HDMI switch with overlay
- Content source management
- Smooth transitions

**Deliverables**:
- ✅ Multi-protocol TV control
- ✅ PiP mode on supported devices
- ✅ Graceful fallback for unsupported features

---

## Phase 5: Enterprise Features (Weeks 17-20)

**Goal**: Build features for commercial deployment to bars/restaurants

### 5.1 Fleet Management (Week 17)

**TDD Approach**:
- Test bulk operations
- Test deployment rollouts
- Test rollback scenarios

**Implementation**:
- Bulk device provisioning
- Group management
- Configuration templates
- Staged rollouts
- Health monitoring dashboard

**Code** (`packages/orchestrator/src/fleet/manager.py`):
```python
class FleetManager:
    def provision_device(self, device_info: DeviceInfo):
        """Provision new device"""

    def deploy_update(self, update: Update, group: str):
        """Deploy update to device group"""

    def rollback(self, deployment_id: str):
        """Rollback failed deployment"""
```

### 5.2 Enterprise Dashboard (Week 18-19)

**Features**:
- Device list and status
- Real-time monitoring
- Model management
- Configuration editor
- Analytics and reports
- Alert management

**Tech Stack**:
- Next.js 14 (App Router)
- TypeScript
- TailwindCSS
- Recharts for analytics
- Real-time updates (WebSocket or SSE)

**Pages**:
```
/dashboard              - Overview
/devices                - Device list
/devices/:id            - Device details
/models                 - Model management
/analytics              - Performance analytics
/settings               - Configuration
```

### 5.3 Multi-Tenancy (Week 20)

**Implementation**:
- Customer account management
- Data isolation per customer
- Role-based access control (RBAC)
- Custom branding per customer
- Usage tracking and billing

**Deliverables**:
- ✅ Fleet management system
- ✅ Enterprise dashboard
- ✅ Multi-tenant support
- ✅ Customer onboarding flow

---

## Phase 6: Optimization & Scale (Weeks 21-24)

**Goal**: Optimize for production deployment at scale

### 6.1 Performance Optimization (Week 21)

**Edge Device**:
- Profile CPU/GPU usage
- Optimize frame processing pipeline
- Reduce memory footprint
- Hardware acceleration (AI HAT)
- Multi-threading optimization

**Targets**:
- CPU usage: <50% on Raspberry Pi 4
- Memory: <1GB RAM
- Inference latency: <50ms
- Model loading: <2 seconds

### 6.2 Model Optimization (Week 22)

**Techniques**:
- Aggressive quantization (INT8)
- Pruning (remove 40-60% weights)
- Knowledge distillation
- Architecture search
- Benchmark on actual hardware

**Targets**:
- Base model: <5MB
- Context models: <15MB
- Accuracy loss: <2%

### 6.3 Cloud Scalability (Week 23)

**Implementation**:
- Kubernetes deployment
- Horizontal pod autoscaling
- Database read replicas
- Redis cluster for caching
- CDN for model distribution
- Load testing (simulate 10,000 devices)

### 6.4 Cost Optimization (Week 24)

**Strategies**:
- Serverless functions for infrequent tasks
- Spot instances for ML training
- S3 lifecycle policies
- CloudFront caching
- Database query optimization

**Target Costs**:
- Per device: <$5/month cloud costs
- ML training: <$50/model
- Total infrastructure: <$1000/month for 1000 devices

**Deliverables**:
- ✅ Optimized edge performance
- ✅ Compressed models
- ✅ Scalable cloud infrastructure
- ✅ Cost-effective operations

---

## Phase 7: Advanced Features (Weeks 25-28)

**Goal**: Add intelligent features for better user experience

### 7.1 Schedule Integration (Week 25)

**Implementation**:
- Electronic Program Guide (EPG) API integration
- Parse TV schedules
- Pre-load models based on upcoming shows
- Handle schedule changes
- Time zone support

**APIs**:
- Gracenote
- TVmaze
- XMLTV

### 7.2 Content Insertion (Week 26)

**Implementation**:
- Play custom content during ad breaks
- Support multiple content sources
- Smooth transitions
- Content scheduling
- A/B testing support

**Requirements**:
- HDMI switch or overlay hardware
- Content library management
- Playback engine

### 7.3 Multi-Stream Support (Week 27)

**Implementation**:
- Handle multiple TV inputs
- Parallel inference
- Resource management
- Independent control per stream

**Hardware**:
- Multiple capture devices OR
- Network streaming OR
- Use multiple Raspberry Pis

### 7.4 Mobile App (Week 28)

**Features**:
- Device management
- Real-time status
- Manual overrides
- Notifications
- Performance reports

**Tech Stack**:
- React Native OR
- Flutter

**Deliverables**:
- ✅ Schedule-aware model loading
- ✅ Content insertion capability
- ✅ Multi-stream support (optional)
- ✅ Mobile app (iOS/Android)

---

## Phase 8: Production Hardening (Weeks 29-32)

**Goal**: Prepare for production deployment

### 8.1 Security Hardening (Week 29)

**Tasks**:
- Security audit
- Penetration testing
- Secure boot on Raspberry Pi
- Encrypted model distribution
- Mutual TLS for device auth
- Secrets management (HashiCorp Vault)
- GDPR/CCPA compliance review

### 8.2 Testing & QA (Week 30)

**Tasks**:
- Comprehensive integration tests
- End-to-end tests
- Load testing (1000+ devices)
- Chaos engineering
- Real-world testing in bars/restaurants
- Beta program with 10-20 devices

### 8.3 Documentation (Week 31)

**Deliverables**:
- API documentation (OpenAPI/Swagger)
- Deployment guides
- Troubleshooting guides
- Video tutorials
- Customer onboarding materials
- Developer documentation

### 8.4 Operations & Support (Week 32)

**Setup**:
- Monitoring and alerting
- On-call rotation
- Incident response procedures
- Customer support system
- Knowledge base
- SLA definitions

**Deliverables**:
- ✅ Security audit completed
- ✅ Comprehensive test suite
- ✅ Complete documentation
- ✅ Operations runbooks

---

## Phase 9: Launch (Week 33-36)

**Goal**: Commercial launch and initial customer acquisition

### 9.1 Pilot Deployment (Week 33-34)

**Tasks**:
- Deploy to 5-10 pilot customers
- On-site installation and training
- Gather feedback
- Fix critical issues
- Refine installation process

### 9.2 Production Launch (Week 35)

**Tasks**:
- Launch marketing website
- Open to new customers
- Set up sales process
- Customer onboarding automation
- Monitor closely for issues

### 9.3 Continuous Improvement (Week 36+)

**Ongoing**:
- Monitor metrics and KPIs
- Collect customer feedback
- Regular model updates
- New show/sport models
- Feature enhancements
- Scale infrastructure as needed

---

## Success Metrics

### Technical KPIs
- **Accuracy**: >95% precision, >90% recall
- **Latency**: <100ms inference time
- **Uptime**: >99.5% device availability
- **Performance**: <50% CPU usage on RPi4

### Business KPIs
- **Customer Satisfaction**: >4.5/5 rating
- **Installation Time**: <30 minutes
- **Support Tickets**: <1 per 100 devices/month
- **Churn Rate**: <5% monthly

### Operational KPIs
- **Deployment Speed**: <5 minutes per device
- **Model Update Time**: <2 minutes
- **Cloud Costs**: <$5 per device/month
- **Incident Response**: <1 hour MTTR

---

## Risk Mitigation

### Technical Risks
1. **ML Accuracy**: Continuous model training, ensemble methods, feedback loop
2. **Performance**: Extensive optimization, hardware acceleration, benchmarking
3. **Hardware Compatibility**: Support multiple RPi versions, extensive testing
4. **TV Control Reliability**: Multiple protocol support, fallback mechanisms

### Business Risks
1. **Market Fit**: Pilot program, customer feedback, iterative development
2. **Competition**: Fast iteration, unique features, excellent support
3. **Regulatory**: Legal review, privacy by design, compliance documentation
4. **Scaling**: Cloud-native architecture, load testing, gradual rollout

---

## Team & Resources

### Recommended Team (MVP)
- **1 ML Engineer**: Model development and training
- **2 Software Engineers**: Edge and cloud development
- **1 DevOps Engineer**: Infrastructure and deployment
- **1 QA Engineer**: Testing and quality assurance
- **1 Product Manager**: Requirements and roadmap

### Infrastructure Costs (Estimated)
- **Development**: $500/month (AWS/GCP credits)
- **Staging**: $1,000/month
- **Production**: Scales with devices (~$5/device/month)
- **ML Training**: $500-2,000/month (spot instances)

### Hardware Needs
- **Development**: 5-10 Raspberry Pi 4/5, TVs, capture cards
- **Testing**: Various TV brands and models
- **Pilot**: 20-30 complete device kits

---

## Next Steps

1. **Immediate** (Week 1):
   - Set up monorepo structure ✅
   - Initialize GitHub repository ✅
   - Set up CI/CD pipelines
   - Create project board

2. **Short-term** (Weeks 2-6):
   - Build MVP on single device
   - Train initial model
   - Get end-to-end demo working

3. **Medium-term** (Weeks 7-20):
   - Build cloud infrastructure
   - Improve ML models
   - Develop enterprise features

4. **Long-term** (Weeks 21+):
   - Optimize and scale
   - Production deployment
   - Continuous improvement

---

## Appendix: Technology Alternatives

### ML Frameworks
- **Primary**: TensorFlow Lite (best RPi support)
- **Alternative**: ONNX Runtime, PyTorch Mobile
- **Future**: Custom inference engine

### Cloud Platforms
- **Primary**: AWS (mature, extensive services)
- **Alternative**: GCP (ML tools), Azure
- **Hybrid**: Multi-cloud for redundancy

### Communication
- **Primary**: gRPC (efficient, type-safe)
- **Alternative**: MQTT (lightweight), REST (simple)

### Database
- **Primary**: PostgreSQL (robust, open-source)
- **Alternative**: MySQL, CockroachDB (distributed)

This roadmap is ambitious but achievable with focused execution. Adjust timeline based on team size and resources!
