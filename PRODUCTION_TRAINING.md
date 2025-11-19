# Production ML Model Training Guide

Complete guide for training, evaluating, and deploying production ML models for the Live TV Ad Detection system.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Dataset Preparation](#dataset-preparation)
- [Training Models](#training-models)
- [Model Evaluation](#model-evaluation)
- [Deployment](#deployment)
- [Model Monitoring](#model-monitoring)
- [Best Practices](#best-practices)

## Overview

The production training pipeline includes:

1. **Dataset Preparation**: Collect and organize labeled frames
2. **Model Training**: Train models with various architectures
3. **Evaluation**: Validate performance against requirements
4. **TFLite Conversion**: Optimize for edge deployment
5. **Deployment**: Push to model registry
6. **Monitoring**: Track model performance in production

### Supported Model Types

- **base-ad-detector**: General purpose ad detection for all content
- **sports-ad-detector**: Specialized for sports broadcasts
- **news-ad-detector**: Specialized for news channels
- **custom models**: Create your own specialized models

## Prerequisites

### Software Requirements

```bash
# Python packages (already in pyproject.toml)
tensorflow >= 2.13.0
mlflow >= 2.8.0
scikit-learn >= 1.3.0
pyyaml >= 6.0
tqdm >= 4.66.0
```

### Hardware Requirements

**For Training:**
- GPU recommended (NVIDIA with CUDA support)
- 16GB+ RAM
- 100GB+ disk space for datasets

**For Edge Deployment:**
- Raspberry Pi 4/5 (8GB recommended)
- microSD card (64GB+ recommended)

### Cloud API Setup

Ensure your cloud API is running and accessible:

```bash
cd packages/cloud-api
python -m cloud_api.main
```

## Dataset Preparation

### Step 1: Collect Labeled Frames

**Option A: Use Labeling Tool**

```bash
# Start labeling web interface
cd packages/ml-training
python -m ml_training.data.labeling \
  --video-dir /path/to/video/recordings \
  --output-dir data/labeled-frames \
  --port 8080
```

Visit `http://localhost:8080` and label frames:
- Press **A** for ad
- Press **C** for content
- Press **U** to undo
- Press **S** to save

**Option B: Import Existing Dataset**

Organize your dataset:
```
data/raw-frames/
├── ad/
│   ├── frame_001.jpg
│   ├── frame_002.jpg
│   └── ...
└── content/
    ├── frame_001.jpg
    ├── frame_002.jpg
    └── ...
```

### Step 2: Prepare Training Dataset

```bash
cd packages/ml-training

# Prepare dataset with train/val/test splits
python -m ml_training.production.prepare_dataset \
  --source local \
  --source-path data/raw-frames \
  --output-dir data/datasets/production \
  --split-ratio 0.7,0.15,0.15 \
  --max-frames 10000

# Output:
# data/datasets/production/
# ├── train/
# │   ├── ad/
# │   └── content/
# ├── val/
# │   ├── ad/
# │   └── content/
# ├── test/
# │   ├── ad/
# │   └── content/
# └── calibration/  (for INT8 quantization)
```

**Recommended Dataset Sizes:**

| Model Type | Minimum | Recommended | Optimal |
|-----------|---------|-------------|---------|
| Base      | 5,000   | 20,000      | 50,000+ |
| Sports    | 3,000   | 10,000      | 30,000+ |
| News      | 3,000   | 10,000      | 30,000+ |

### Step 3: Validate Dataset

```bash
# Check dataset statistics
python -m ml_training.production.prepare_dataset \
  --source local \
  --source-path data/raw-frames \
  --output-dir data/datasets/production

# Expected output:
# Dataset Statistics:
# ==================================================
# TRAIN SET:
#   Total: 7000
#   ad: 3200 (45.7%)
#   content: 3800 (54.3%)
#
# VAL SET:
#   Total: 1500
#   ad: 680 (45.3%)
#   content: 820 (54.7%)
#
# TEST SET:
#   Total: 1500
#   ad: 690 (46.0%)
#   content: 810 (54.0%)
```

## Training Models

### Train Base Ad Detector

```bash
cd packages/ml-training

# Train using production configuration
python -m ml_training.production.train_production_models \
  --config ../../configs/training/production-base.yaml \
  --registry-url http://localhost:8000

# Training will:
# 1. Validate dataset structure
# 2. Train EfficientNet-Lite0 model
# 3. Evaluate on test set
# 4. Convert to TFLite with INT8 quantization
# 5. Benchmark inference speed
# 6. Upload to model registry (if requirements met)
```

### Train Sports-Specific Model

```bash
# First, prepare sports-specific dataset
python -m ml_training.production.prepare_dataset \
  --source local \
  --source-path data/sports-frames \
  --output-dir data/datasets/sports

# Train sports model
python -m ml_training.production.train_production_models \
  --config ../../configs/training/production-sports.yaml \
  --registry-url http://localhost:8000
```

### Configuration Options

Edit `configs/training/production-*.yaml`:

```yaml
# Model architecture
model:
  architecture: efficientnet_lite0  # Options: efficientnet_lite0, mobilenet_v3_small, mobilenet_v3_large
  input_shape: [224, 224, 3]

# Training parameters
training:
  batch_size: 32
  epochs: 100
  learning_rate: 0.001

# Performance requirements
deployment:
  requirements:
    min_accuracy: 0.90        # Minimum test accuracy
    min_f1_score: 0.85        # Minimum F1 score
    max_inference_time_ms: 100  # Maximum inference time
```

### Monitor Training Progress

```bash
# Start TensorBoard
tensorboard --logdir logs/tensorboard

# Start MLflow UI
mlflow ui --backend-store-uri sqlite:///mlflow.db

# View training logs
tail -f training_results/training.log
```

## Model Evaluation

### Evaluate Model Performance

```bash
# Evaluate trained model
python -m ml_training.production.train_production_models \
  --config configs/training/production-base.yaml \
  --dry-run  # Evaluate without deploying

# Results saved to: training_results/training_results.json
```

### Interpret Results

```json
{
  "test_metrics": {
    "accuracy": 0.945,
    "precision": 0.938,
    "recall": 0.951,
    "f1_score": 0.944,
    "roc_auc": 0.982,
    "confusion_matrix": [[820, 30], [25, 625]]
  },
  "benchmark": {
    "mean_ms": 42.3,
    "p95_ms": 48.7,
    "p99_ms": 52.1
  }
}
```

**Good Indicators:**
- ✓ Accuracy > 0.90
- ✓ F1 Score > 0.85
- ✓ Inference time < 50ms (P95)
- ✓ Balanced confusion matrix

**Warning Signs:**
- ⚠ High false positive rate (ads classified as content)
- ⚠ High false negative rate (content classified as ads)
- ⚠ Inference time > 100ms
- ⚠ Large difference between training and test accuracy (overfitting)

## Deployment

### Deploy to Model Registry

```bash
# Deploy model (automatic if requirements met)
python -m ml_training.production.train_production_models \
  --config configs/training/production-base.yaml \
  --registry-url http://localhost:8000

# Model uploaded to: /api/v1/models/base-ad-detector/versions/1.0.0
```

### Promote to Production

```bash
# Promote model version to production
curl -X POST http://localhost:8000/api/v1/models/base-ad-detector/versions/1.0.0/promote \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "is_production": true,
    "status": "production",
    "rollout_percentage": 100.0
  }'
```

### Canary Deployment

```bash
# Deploy to 10% of devices first
curl -X POST http://localhost:8000/api/v1/models/base-ad-detector/versions/1.1.0/promote \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "canary",
    "rollout_percentage": 10.0
  }'

# Monitor performance for 24-48 hours
# If successful, increase to 100%
```

### Edge Device Deployment

Models are automatically downloaded by edge devices:

```python
# On Raspberry Pi
from ml_training.registry.client import ModelRegistryClient

client = ModelRegistryClient("http://api.example.com")

# Download production model
model_path = client.download_model(
    model_name="base-ad-detector",
    version="production"  # or specific version like "1.0.0"
)

# Model saved to: /opt/ad-detection/models/base-ad-detector.tflite
```

## Model Monitoring

### Monitor Model Performance

```bash
# Get model performance metrics
curl http://localhost:8000/api/v1/monitoring/models/base-ad-detector/performance \
  -H "Authorization: Bearer $TOKEN"

# Response:
{
  "model_name": "base-ad-detector",
  "version": "1.0.0",
  "metrics": {
    "avg_inference_time_ms": 45.2,
    "avg_confidence": 0.87,
    "total_inferences": 1234567,
    "ad_detection_rate": 0.23
  }
}
```

### Detect Data Drift

```bash
# Check for data drift
curl http://localhost:8000/api/v1/monitoring/models/base-ad-detector/drift \
  -H "Authorization: Bearer $TOKEN"

# Response:
{
  "drift_detected": true,
  "drift_metrics": {
    "confidence_drift": 0.15,
    "ad_rate_drift": 0.08
  }
}
```

### Check Model Health

```bash
# Get overall health status
curl http://localhost:8000/api/v1/monitoring/models/base-ad-detector/health \
  -H "Authorization: Bearer $TOKEN"

# Response:
{
  "status": "healthy",  # or "warning", "critical"
  "health_score": 92,
  "issues": [],
  "recommendations": []
}
```

## Best Practices

### Data Collection

1. **Diverse Sources**: Collect frames from multiple channels and time periods
2. **Balanced Classes**: Aim for 40-60% ad vs content ratio
3. **Quality Labels**: Use multiple labelers for validation
4. **Regular Updates**: Refresh dataset quarterly with new content

### Training

1. **Use Transfer Learning**: Start from pre-trained weights
2. **Data Augmentation**: Enable augmentation to reduce overfitting
3. **Early Stopping**: Use validation loss to prevent overtraining
4. **Cross-Validation**: Train multiple models with different splits

### Deployment

1. **Gradual Rollout**: Use canary deployments for new models
2. **A/B Testing**: Compare new model against baseline
3. **Monitor Closely**: Watch metrics for first 24-48 hours
4. **Rollback Plan**: Keep previous model version active

### Monitoring

1. **Set Alerts**: Configure alerts for drift and performance degradation
2. **Regular Reviews**: Check model health weekly
3. **Retrain Schedule**: Plan quarterly model updates
4. **Feedback Loop**: Collect user feedback on false positives/negatives

## Troubleshooting

### Low Accuracy

**Symptoms**: Test accuracy < 0.85

**Solutions**:
- Collect more training data (target 20,000+ samples)
- Check dataset for mislabeled frames
- Try different architectures (MobileNet V3, EfficientNet B0)
- Increase training epochs
- Adjust learning rate

### Slow Inference

**Symptoms**: Inference time > 100ms

**Solutions**:
- Use INT8 quantization (already enabled)
- Reduce input resolution (224x224 → 192x192)
- Try lighter architecture (MobileNet V3 Small)
- Optimize TFLite conversion settings
- Consider hardware upgrade

### Overfitting

**Symptoms**: Training accuracy much higher than validation accuracy

**Solutions**:
- Enable more aggressive data augmentation
- Add dropout layers
- Reduce model complexity
- Collect more diverse training data
- Use regularization (L2)

### Data Drift

**Symptoms**: Drift detection alerts, decreasing performance

**Solutions**:
- Collect recent data samples
- Analyze prediction distribution changes
- Retrain model with updated dataset
- Consider ensemble approach with multiple models

## Example: Complete Training Workflow

```bash
#!/bin/bash
# complete_training.sh - Full production training workflow

set -e

echo "=== Live TV Ad Detection - Production Model Training ==="

# 1. Prepare dataset
echo "Step 1: Preparing dataset..."
python -m ml_training.production.prepare_dataset \
  --source local \
  --source-path data/raw-frames \
  --output-dir data/datasets/production \
  --split-ratio 0.7,0.15,0.15

# 2. Train base model
echo "Step 2: Training base ad detector..."
python -m ml_training.production.train_production_models \
  --config configs/training/production-base.yaml \
  --registry-url http://localhost:8000

# 3. Train sports model
echo "Step 3: Training sports ad detector..."
python -m ml_training.production.prepare_dataset \
  --source local \
  --source-path data/sports-frames \
  --output-dir data/datasets/sports

python -m ml_training.production.train_production_models \
  --config configs/training/production-sports.yaml \
  --registry-url http://localhost:8000

# 4. Deploy models
echo "Step 4: Deploying models to production..."
./scripts/deploy_models.sh

echo "=== Training Complete ==="
echo "View results at: training_results/training_results.json"
echo "Monitor models at: http://localhost:8000/api/v1/monitoring"
```

## Additional Resources

- **MLflow Tracking**: http://localhost:5000
- **TensorBoard**: http://localhost:6006
- **Model Registry API**: http://localhost:8000/api/v1/models
- **Monitoring Dashboard**: http://localhost:8000/api/v1/monitoring

## Support

For issues or questions:
1. Check logs in `training_results/`
2. Review training metrics in MLflow
3. Consult TensorBoard for training curves
4. Check model health endpoints for production issues
