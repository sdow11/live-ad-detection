# ML Training Package

ML model training pipeline for ad detection models.

## Overview

This package provides the complete training pipeline for:
- General ad detection models (base model)
- Show-specific models (fine-tuned for specific shows)
- Sports-specific models (optimized for sports broadcasts)
- Network-specific models (channel-specific patterns)

## Directory Structure

```
ml-training/
├── src/
│   └── ml_training/
│       ├── data/              # Data pipeline
│       │   ├── collectors.py  # Video frame collection
│       │   ├── labeling.py    # Labeling tools
│       │   ├── augmentation.py# Data augmentation
│       │   └── dataset.py     # PyTorch/TF datasets
│       ├── models/            # Model architectures
│       │   ├── efficientnet.py
│       │   ├── mobilenet.py
│       │   ├── resnet.py
│       │   └── temporal.py    # Temporal models (LSTM, etc.)
│       ├── training/          # Training scripts
│       │   ├── train.py       # Main training loop
│       │   ├── evaluate.py    # Evaluation
│       │   └── callbacks.py   # Training callbacks
│       ├── conversion/        # Model conversion
│       │   ├── to_tflite.py   # Convert to TensorFlow Lite
│       │   ├── quantization.py# Quantization
│       │   └── optimization.py# Model optimization
│       ├── registry/          # Model registry client
│       │   ├── client.py      # Upload/download models
│       │   └── versioning.py  # Version management
│       └── utils/             # Utilities
│           ├── metrics.py     # Custom metrics
│           └── visualization.py # Training viz
├── configs/                   # Training configurations
│   ├── base_model.yaml
│   ├── sports_model.yaml
│   └── show_specific.yaml
├── scripts/                   # Training scripts
│   ├── train_base_model.sh
│   ├── train_sports_model.sh
│   └── convert_and_deploy.sh
├── notebooks/                 # Jupyter notebooks
│   ├── data_exploration.ipynb
│   ├── model_analysis.ipynb
│   └── error_analysis.ipynb
├── tests/                     # Tests
└── pyproject.toml
```

## Quick Start

### 1. Collect Training Data

```bash
# Extract frames from video feeds
python -m ml_training.data.collectors extract \
  --video-source /path/to/recordings \
  --output-dir data/raw_frames \
  --fps 1.0

# Label frames
python -m ml_training.data.labeling launch \
  --data-dir data/raw_frames \
  --output data/labels.json
```

### 2. Train Base Model

```bash
# Train from scratch
python -m ml_training.training.train \
  --config configs/base_model.yaml \
  --data-dir data/labeled_frames \
  --output-dir models/base_v1

# Or use provided script
./scripts/train_base_model.sh
```

### 3. Convert to TFLite

```bash
# Convert and quantize
python -m ml_training.conversion.to_tflite \
  --model models/base_v1/model.h5 \
  --output models/base_v1/model.tflite \
  --quantize int8

# Test converted model
python -m ml_training.conversion.test_tflite \
  --model models/base_v1/model.tflite \
  --test-data data/test_set
```

### 4. Upload to Model Registry

```bash
# Upload to cloud
python -m ml_training.registry.client upload \
  --model models/base_v1/model.tflite \
  --name "base-ad-detector" \
  --version "1.0.0" \
  --description "Base ad detection model" \
  --metrics models/base_v1/metrics.json
```

### 5. Deploy to Edge Devices

```bash
# Mark as production
python -m ml_training.registry.client promote \
  --model-id base-ad-detector \
  --version 1.0.0 \
  --environment production

# Devices will auto-download on next firmware check
```

## Training Workflow

### Data Collection

1. **Record TV broadcasts** (with timestamps)
2. **Extract frames** at 1 FPS for labeling
3. **Label frames** as "ad" or "content"
4. **Split dataset** (train/val/test: 70/15/15)

### Model Training

1. **Choose architecture** (EfficientNet-Lite recommended)
2. **Configure training** (learning rate, batch size, etc.)
3. **Train model** with validation
4. **Evaluate metrics** (precision, recall, F1)
5. **Iterate** on hyperparameters

### Model Optimization

1. **Convert to TFLite** format
2. **Quantize** to INT8 (4x smaller, 3x faster)
3. **Test accuracy** post-quantization
4. **Benchmark** on Raspberry Pi

### Deployment

1. **Upload to registry** with metadata
2. **A/B test** with small device subset
3. **Monitor metrics** (accuracy, latency)
4. **Promote to production** if successful
5. **Rollout** to all devices

## Model Architecture

### Base Model (EfficientNet-Lite0)

```
Input: 224x224x3
  ↓
EfficientNet-Lite0 (backbone)
  ↓
Global Average Pooling
  ↓
Dense(256, ReLU)
  ↓
Dropout(0.3)
  ↓
Dense(1, Sigmoid)
  ↓
Output: [0.0-1.0] (ad probability)
```

**Size:** ~4.5MB (original), ~1.2MB (quantized)
**Latency:** ~35ms (RPi 5), ~20ms (with AI HAT+)
**Accuracy:** >95% precision, >92% recall

### Temporal Model (Optional)

For better accuracy, use temporal features:

```
Input: 5 frames (224x224x3 each)
  ↓
Shared CNN (EfficientNet-Lite0)
  ↓
Temporal Features (5x256)
  ↓
LSTM(128)
  ↓
Dense(64, ReLU)
  ↓
Dense(1, Sigmoid)
  ↓
Output: [0.0-1.0]
```

**Size:** ~6.8MB (quantized)
**Latency:** ~55ms (RPi 5)
**Accuracy:** >97% precision, >95% recall

## Data Labeling

### Web-based Labeling Tool

```bash
# Start labeling server
python -m ml_training.data.labeling server \
  --data-dir data/raw_frames \
  --port 8080

# Open in browser
open http://localhost:8080
```

Features:
- Keyboard shortcuts (A=ad, C=content)
- Batch labeling
- Progress tracking
- Export to multiple formats

### Automated Pre-labeling

Use existing model to pre-label:

```bash
python -m ml_training.data.labeling auto_label \
  --model models/base_v1/model.tflite \
  --data-dir data/raw_frames \
  --output data/pre_labels.json \
  --threshold 0.8
```

Then manually review low-confidence predictions.

## Model Metrics

### Required Metrics

- **Precision**: >95% (minimize false positives)
- **Recall**: >90% (catch most ads)
- **F1 Score**: >92%
- **Latency**: <50ms on RPi 5
- **Size**: <5MB (quantized)

### Evaluation Script

```bash
python -m ml_training.training.evaluate \
  --model models/base_v1/model.tflite \
  --test-data data/test_set \
  --output models/base_v1/evaluation.json
```

## Model Versioning

### Semantic Versioning

- **Major**: Breaking changes (new input size, architecture)
- **Minor**: Improvements (better accuracy, new features)
- **Patch**: Bug fixes (fixes for specific edge cases)

Example: `1.2.3`
- 1 = v1 architecture (EfficientNet-Lite0)
- 2 = Second round of improvements
- 3 = Third bug fix release

### Model Naming

```
{model_type}-{variant}-v{version}

Examples:
- base-general-v1.0.0
- sports-nfl-v1.2.0
- show-specific-friends-v2.0.0
- network-cnn-v1.1.0
```

## Advanced Features

### Transfer Learning

Fine-tune base model for specific use cases:

```bash
python -m ml_training.training.finetune \
  --base-model models/base_v1/model.h5 \
  --data-dir data/sports_specific \
  --output models/sports_v1 \
  --epochs 10 \
  --freeze-layers 100
```

### Multi-Model Ensemble

Combine multiple models for better accuracy:

```yaml
ensemble:
  models:
    - base-general-v1.0.0
    - sports-nfl-v1.0.0
    - temporal-v1.0.0
  voting: weighted
  weights: [0.5, 0.3, 0.2]
```

### Active Learning

Continuously improve model with edge device data:

```bash
# Collect hard examples from edge devices
python -m ml_training.data.active_learning collect \
  --min-confidence 0.4 \
  --max-confidence 0.6 \
  --sample-rate 0.1

# Retrain with new data
python -m ml_training.training.train \
  --config configs/base_model.yaml \
  --additional-data data/hard_examples
```

## CI/CD for Models

### Automated Training Pipeline

```yaml
# .github/workflows/train-model.yml
name: Train Model
on:
  push:
    paths:
      - 'data/**'
      - 'configs/**'

jobs:
  train:
    runs-on: ubuntu-latest
    steps:
      - name: Train model
        run: python -m ml_training.training.train

      - name: Evaluate
        run: python -m ml_training.training.evaluate

      - name: Convert to TFLite
        run: python -m ml_training.conversion.to_tflite

      - name: Upload to registry
        run: python -m ml_training.registry.client upload
```

## Troubleshooting

### Low Accuracy

- Collect more training data
- Balance dataset (equal ad/content samples)
- Try data augmentation
- Use temporal features
- Increase model capacity

### High Latency

- Reduce input size (224→160)
- Use lighter architecture (MobileNet)
- Increase quantization
- Remove temporal features

### Model Not Loading on Edge

- Check TFLite version compatibility
- Verify quantization format
- Test with TFLite interpreter
- Check model size (<10MB)

## Resources

- **Model Zoo**: Pre-trained models for common scenarios
- **Datasets**: Curated ad detection datasets
- **Benchmarks**: Performance comparisons
- **Tutorials**: Step-by-step guides

## Support

- Documentation: `docs/ml-training/`
- Issues: GitHub Issues
- Email: ml-team@example.com
