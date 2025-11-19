# ML Model Training and Deployment Workflow

Complete guide for training, optimizing, and deploying ML models for ad detection.

## Table of Contents

1. [Overview](#overview)
2. [Data Collection](#data-collection)
3. [Data Labeling](#data-labeling)
4. [Model Training](#model-training)
5. [Model Evaluation](#model-evaluation)
6. [Model Optimization](#model-optimization)
7. [Model Registry](#model-registry)
8. [Deployment](#deployment)
9. [A/B Testing](#ab-testing)
10. [Continuous Improvement](#continuous-improvement)

## Overview

### ML Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Data Collection                             │
│  TV Broadcasts → Video Frames → Storage (S3/MinIO)              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                       Data Labeling                              │
│  Web UI → Human Labels → Validated Dataset                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                     Model Training                               │
│  PyTorch/TensorFlow → Trained Model → Metrics                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                   Model Optimization                             │
│  TFLite Conversion → Quantization → Validation                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                     Model Registry                               │
│  Upload → Versioning → Distribution (CDN)                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                        Deployment                                │
│  Edge Devices → Download → Inference → Telemetry                │
└──────────────────────────────────────────────────────────────────┘
```

## Data Collection

### 1. Recording TV Broadcasts

**Manual Recording:**
```bash
# Record TV broadcast with timestamps
ffmpeg -i /dev/video0 \
  -c:v h264 -preset fast -crf 23 \
  -c:a aac -b:a 128k \
  -f segment -segment_time 600 \
  recordings/%Y%m%d_%H%M%S.mp4
```

**Automated Recording:**
```python
# Use existing edge devices to collect data
from ml_training.data.collectors import TVRecorder

recorder = TVRecorder(
    device_id="rpi-001",
    output_dir="recordings/",
    schedule={
        "channels": ["2-1", "5-1", "7-1"],
        "times": ["18:00-23:00"],  # Prime time
        "days": ["weekday"]
    }
)

await recorder.start()
```

### 2. Frame Extraction

Extract frames for labeling (1 FPS is usually sufficient):

```bash
# Extract frames from recordings
python -m ml_training.data.collectors extract \
  --video-dir recordings/ \
  --output-dir data/raw_frames/ \
  --fps 1.0 \
  --format jpg
```

This creates a dataset structure:
```
data/raw_frames/
├── 20251119_180000/
│   ├── frame_000000.jpg
│   ├── frame_000001.jpg
│   └── ...
├── 20251119_190000/
│   └── ...
└── metadata.json  # Timestamps, channels, etc.
```

### 3. Storage and Versioning

**Use DVC for dataset versioning:**

```bash
# Initialize DVC
cd packages/ml-training
dvc init

# Add dataset to DVC
dvc add data/raw_frames
git add data/raw_frames.dvc .gitignore
git commit -m "Add raw frames dataset v1"

# Push to remote storage (S3, GCS, etc.)
dvc remote add -d storage s3://my-bucket/ad-detection-data
dvc push
```

## Data Labeling

### 1. Web-based Labeling Tool

**Start labeling server:**

```bash
python -m ml_training.data.labeling server \
  --data-dir data/raw_frames \
  --output data/labels.json \
  --port 8080
```

**Access labeling UI:**
```
open http://localhost:8080
```

**Keyboard shortcuts:**
- `A` - Mark as Ad
- `C` - Mark as Content
- `U` - Mark as Uncertain (skip)
- `←/→` - Previous/Next frame
- `S` - Save progress

### 2. Automated Pre-labeling

Use existing model to speed up labeling:

```bash
# Pre-label with existing model
python -m ml_training.data.labeling auto_label \
  --model models/previous_version/model.tflite \
  --data-dir data/raw_frames \
  --output data/pre_labels.json \
  --confidence-threshold 0.9
```

This creates labels for high-confidence predictions. You only need to review:
- Low confidence predictions (0.4-0.6)
- Uncertain frames
- Random sample for quality control

### 3. Label Quality Control

**Check label distribution:**

```bash
python -m ml_training.data.labeling stats \
  --labels data/labels.json
```

Output:
```
Total frames: 10,000
Labeled: 9,500 (95%)
- Ad: 3,800 (40%)
- Content: 5,700 (60%)
Unlabeled: 500 (5%)

Label distribution by channel:
- Channel 2-1: 45% ad, 55% content
- Channel 5-1: 35% ad, 65% content
- Channel 7-1: 40% ad, 60% content
```

**Validate labels:**

```bash
# Find potential labeling errors
python -m ml_training.data.labeling validate \
  --labels data/labels.json \
  --model models/previous_version/model.tflite
```

Flags frames where model strongly disagrees with human label.

### 4. Dataset Splitting

```bash
# Split into train/val/test
python -m ml_training.data.dataset split \
  --labels data/labels.json \
  --output-dir data/dataset \
  --train 0.7 \
  --val 0.15 \
  --test 0.15 \
  --stratify channel  # Ensure balanced channels in each split
```

Creates:
```
data/dataset/
├── train/
│   ├── ad/
│   └── content/
├── val/
│   ├── ad/
│   └── content/
└── test/
    ├── ad/
    └── content/
```

## Model Training

### 1. Configure Training

Edit `configs/base_model.yaml`:

```yaml
# Key parameters to adjust
training:
  epochs: 50
  batch_size: 32
  learning_rate: 0.001

model:
  architecture: "efficientnet_lite0"  # or mobilenet_v3, resnet50
  use_pretrained: true
  freeze_backbone: false
```

### 2. Train Model

**Using provided configuration:**

```bash
# Train from scratch
python -m ml_training.training.train \
  --config configs/base_model.yaml \
  --output-dir models/base_v2

# Or use convenience script
cd packages/ml-training
./scripts/train_base_model.sh
```

**Training output:**

```
Epoch 1/50
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100% 0:02:30
train_loss: 0.523 train_acc: 0.745 val_loss: 0.412 val_acc: 0.832

Epoch 2/50
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100% 0:02:28
train_loss: 0.389 train_acc: 0.856 val_loss: 0.351 val_acc: 0.871

...

Best model saved: models/base_v2/best_model.h5
Final metrics:
  - Precision: 0.965
  - Recall: 0.923
  - F1 Score: 0.943
  - AUC-ROC: 0.987
```

### 3. Monitor Training

**TensorBoard:**

```bash
tensorboard --logdir models/base_v2/logs
open http://localhost:6006
```

**MLflow:**

```bash
mlflow ui
open http://localhost:5000
```

**Weights & Biases:**

```bash
# Already logging if configured in config.yaml
wandb login
# View at https://wandb.ai/your-project
```

### 4. Training on GPU (Recommended)

**Local GPU:**

```bash
# Install CUDA support
pip install "ad-detection-ml-training[gpu]"

# Train with GPU
CUDA_VISIBLE_DEVICES=0 python -m ml_training.training.train \
  --config configs/base_model.yaml \
  --output-dir models/base_v2
```

**Cloud GPU (AWS, GCP, Azure):**

```bash
# Example: AWS SageMaker
python -m ml_training.training.train_sagemaker \
  --config configs/base_model.yaml \
  --instance-type ml.p3.2xlarge \
  --output-s3 s3://my-bucket/models/base_v2
```

## Model Evaluation

### 1. Evaluate on Test Set

```bash
python -m ml_training.training.evaluate \
  --model models/base_v2/best_model.h5 \
  --test-data data/dataset/test \
  --output models/base_v2/evaluation.json
```

**Evaluation results:**

```json
{
  "accuracy": 0.947,
  "precision": 0.965,
  "recall": 0.923,
  "f1_score": 0.943,
  "auc_roc": 0.987,
  "confusion_matrix": [
    [550, 20],   # [TN, FP]
    [35, 445]    # [FN, TP]
  ],
  "classification_report": {
    "content": {"precision": 0.940, "recall": 0.965, "f1-score": 0.952},
    "ad": {"precision": 0.957, "recall": 0.927, "f1-score": 0.942}
  },
  "per_channel_metrics": {
    "2-1": {"precision": 0.970, "recall": 0.930},
    "5-1": {"precision": 0.955, "recall": 0.915},
    "7-1": {"precision": 0.960, "recall": 0.925}
  }
}
```

### 2. Error Analysis

```bash
# Find hard examples
python -m ml_training.training.error_analysis \
  --model models/base_v2/best_model.h5 \
  --test-data data/dataset/test \
  --output models/base_v2/errors/
```

Creates:
```
models/base_v2/errors/
├── false_positives/     # Content classified as ads
├── false_negatives/     # Ads classified as content
├── low_confidence/      # Uncertain predictions
└── analysis.html        # Interactive error analysis
```

### 3. Visualize Results

```bash
# Generate visualization notebook
jupyter notebook notebooks/model_analysis.ipynb
```

Includes:
- Confusion matrix
- ROC curve
- Precision-recall curve
- Per-channel performance
- Error examples

## Model Optimization

### 1. Convert to TensorFlow Lite

```bash
# Convert with INT8 quantization
python -m ml_training.conversion.to_tflite \
  --model models/base_v2/best_model.h5 \
  --output models/base_v2/model.tflite \
  --quantization int8 \
  --data-dir data/dataset/train \
  --num-samples 100
```

**Conversion output:**

```
Loading Keras model...
Model loaded. Converting to TFLite with int8 quantization...
Creating representative dataset with 100 samples...
  Processed 10/100 samples
  Processed 20/100 samples
  ...
  Processed 100/100 samples
✅ Conversion complete!
   Original size: 17.3 MB
   TFLite size: 4.2 MB
   Compression: 4.12x
```

### 2. Validate Converted Model

```bash
# Test accuracy after quantization
python -m ml_training.conversion.validate \
  --model models/base_v2/model.tflite \
  --test-data data/dataset/test \
  --original-model models/base_v2/best_model.h5
```

**Validation output:**

```
Original Model:
  Accuracy: 0.947
  Precision: 0.965
  Recall: 0.923
  Avg Latency: 87ms (CPU)

TFLite Model (INT8):
  Accuracy: 0.943 (-0.004)
  Precision: 0.961 (-0.004)
  Recall: 0.919 (-0.004)
  Avg Latency: 28ms (CPU) → 3.1x faster

✅ Accuracy degradation within acceptable range (<1%)
```

### 3. Benchmark on Target Hardware

```bash
# Benchmark on Raspberry Pi
scp models/base_v2/model.tflite pi@raspberrypi:~/

# SSH to Raspberry Pi
ssh pi@raspberrypi

# Run benchmark
python3 -m ml_training.conversion.benchmark \
  --model model.tflite \
  --num-iterations 1000
```

**Benchmark results:**

```
Raspberry Pi 5 (8GB):
  Average latency: 35.2ms
  P50: 34.8ms
  P95: 38.1ms
  P99: 42.3ms

Raspberry Pi 5 + AI HAT+:
  Average latency: 18.7ms
  P50: 18.3ms
  P95: 20.9ms
  P99: 23.1ms

✅ Latency meets target (<50ms)
```

## Model Registry

### 1. Prepare Model Metadata

Create `models/base_v2/metadata.json`:

```json
{
  "name": "base-ad-detector",
  "version": "2.0.0",
  "description": "Base ad detection model with improved accuracy",
  "architecture": "EfficientNet-Lite0",
  "input_shape": [224, 224, 3],
  "framework": "tensorflow_lite",

  "precision": 0.961,
  "recall": 0.919,
  "f1_score": 0.940,
  "latency_ms": 35.2,

  "file_size_mb": 4.2,
  "checksum": "",

  "min_hardware": "Raspberry Pi 5",
  "is_quantized": true,
  "quantization_type": "int8",

  "dataset_name": "tv-ads-v2",
  "training_date": "2025-11-19",
  "training_config": {
    "epochs": 50,
    "batch_size": 32,
    "optimizer": "adam"
  },

  "tags": ["base", "general-purpose", "production-ready"]
}
```

### 2. Upload to Registry

```bash
# Upload model
python -m ml_training.registry.client upload \
  --api-url https://api.example.com \
  --api-key $API_KEY \
  --model models/base_v2/model.tflite \
  --metadata models/base_v2/metadata.json
```

**Upload output:**

```
Uploading model base-ad-detector v2.0.0...
Uploading metadata...
Model registered with ID: 123
Uploading model file (4.20 MB)...
✅ Model uploaded successfully!
   Model ID: 123
   Download URL: https://cdn.example.com/models/base-ad-detector-2.0.0.tflite
```

### 3. List Available Models

```bash
# List all models
python -m ml_training.registry.client list \
  --api-url https://api.example.com \
  --api-key $API_KEY
```

Output:
```
base-ad-detector v2.0.0 - Base ad detection model with improved accuracy
base-ad-detector v1.5.1 - Base ad detection model with bug fixes
sports-nfl-detector v1.0.0 - NFL sports ad detection model
...
```

## Deployment

### 1. A/B Testing (Canary Deployment)

**Deploy to 10% of devices first:**

```bash
# Mark model for canary testing
python -m ml_training.registry.client promote \
  --api-url https://api.example.com \
  --api-key $API_KEY \
  --name base-ad-detector \
  --version 2.0.0 \
  --environment canary \
  --rollout-percentage 10
```

Edge devices in canary group will automatically download new model.

### 2. Monitor Canary Metrics

```bash
# Monitor canary performance
python -m ml_training.deployment.monitor \
  --model base-ad-detector \
  --version 2.0.0 \
  --environment canary \
  --duration 24h
```

**Monitoring output:**

```
Canary Deployment: base-ad-detector v2.0.0
Duration: 24 hours
Devices: 50 / 500 (10%)

Metrics (last 24h):
  Accuracy: 0.943 ± 0.008
  Precision: 0.961 ± 0.012
  Recall: 0.919 ± 0.015
  Latency: 35.7ms ± 3.2ms

Comparison to v1.5.1:
  Accuracy: +0.012 (+1.3%) ✅
  Precision: +0.005 (+0.5%) ✅
  Recall: +0.023 (+2.6%) ✅
  Latency: -2.1ms (-5.6%) ✅

✅ All metrics improved. Safe to proceed with full rollout.
```

### 3. Full Production Rollout

```bash
# Promote to production
python -m ml_training.registry.client promote \
  --api-url https://api.example.com \
  --api-key $API_KEY \
  --name base-ad-detector \
  --version 2.0.0 \
  --environment production \
  --rollout-percentage 100
```

All edge devices will automatically download new model on next firmware check (within 1 hour).

### 4. Rollback (if needed)

```bash
# Rollback to previous version
python -m ml_training.registry.client rollback \
  --api-url https://api.example.com \
  --api-key $API_KEY \
  --name base-ad-detector \
  --to-version 1.5.1
```

## Continuous Improvement

### 1. Collect Hard Examples

Edge devices automatically collect frames with low confidence predictions:

```python
# In edge device code
if 0.4 < confidence < 0.6:
    # Collect for retraining
    collector.save_hard_example(frame, confidence, metadata)
```

### 2. Active Learning Loop

```bash
# Download hard examples from fleet
python -m ml_training.data.active_learning download \
  --api-url https://api.example.com \
  --output data/hard_examples/ \
  --min-count 1000

# Label hard examples
python -m ml_training.data.labeling server \
  --data-dir data/hard_examples

# Retrain with additional data
python -m ml_training.training.train \
  --config configs/base_model.yaml \
  --additional-data data/hard_examples \
  --output-dir models/base_v2.1
```

### 3. Automated Retraining Pipeline

**GitHub Actions workflow** (`.github/workflows/retrain.yml`):

```yaml
name: Automated Model Retraining
on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday

jobs:
  retrain:
    runs-on: ubuntu-latest-gpu
    steps:
      - name: Collect new data
        run: python -m ml_training.data.active_learning download

      - name: Train model
        run: python -m ml_training.training.train

      - name: Evaluate model
        run: python -m ml_training.training.evaluate

      - name: Convert to TFLite
        run: python -m ml_training.conversion.to_tflite

      - name: Upload to registry
        run: python -m ml_training.registry.client upload

      - name: Deploy to canary
        run: python -m ml_training.registry.client promote --environment canary
```

## Best Practices

### Data Collection
- ✅ Collect diverse data (different channels, times, shows)
- ✅ Balance dataset (equal ad/content samples)
- ✅ Version datasets with DVC
- ✅ Maintain data quality (review labels)

### Training
- ✅ Start with pretrained models (transfer learning)
- ✅ Use data augmentation
- ✅ Monitor training metrics (TensorBoard, MLflow)
- ✅ Save checkpoints regularly
- ✅ Use early stopping

### Evaluation
- ✅ Test on diverse data (different channels, times)
- ✅ Analyze errors (false positives/negatives)
- ✅ Check per-channel performance
- ✅ Validate on target hardware (Raspberry Pi)

### Deployment
- ✅ Use canary deployments (A/B testing)
- ✅ Monitor production metrics
- ✅ Have rollback plan
- ✅ Gradual rollout (10% → 50% → 100%)

### Continuous Improvement
- ✅ Collect hard examples from fleet
- ✅ Regular retraining schedule
- ✅ Track model lineage
- ✅ Document model changes

## Troubleshooting

### Low Training Accuracy
- Collect more/better training data
- Increase model capacity
- Reduce regularization
- Check data quality (mislabeled samples)

### Overfitting
- Add data augmentation
- Increase dropout
- Add weight decay
- Collect more training data

### High Latency on Edge
- Use smaller model (MobileNet vs EfficientNet)
- Increase quantization (INT8)
- Reduce input size (224→160)
- Use AI HAT+ accelerator

### Accuracy Drop After Quantization
- Use more calibration samples (100→1000)
- Try different quantization (INT8→Float16)
- Use quantization-aware training

### Model Not Downloading on Edge Devices
- Check API connectivity
- Verify model URL is accessible
- Check firmware version compatibility
- Review device logs

## Resources

- **ML Training Package**: `packages/ml-training/`
- **Example Configs**: `packages/ml-training/configs/`
- **Jupyter Notebooks**: `packages/ml-training/notebooks/`
- **Pre-trained Models**: Model zoo (coming soon)
- **Datasets**: Community datasets (coming soon)

## Support

For ML-related questions:
- Email: ml-team@example.com
- Slack: #ml-training channel
- Documentation: `docs/ml-training/`
