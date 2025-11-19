"""Model monitoring service for tracking ML model performance in production.

Monitors:
- Inference latency and throughput
- Prediction distribution (data drift detection)
- Model accuracy via user feedback
- Error rates and anomalies
- Resource usage
"""

import logging
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from cloud_api.cache import cache
from cloud_api.models import Device, MLModelVersion, Telemetry

logger = logging.getLogger(__name__)


class ModelMonitoringService:
    """Service for monitoring ML model performance."""

    def __init__(self):
        """Initialize monitoring service."""
        self.prediction_buffer = defaultdict(list)
        self.max_buffer_size = 1000

    async def record_prediction(
        self,
        device_id: str,
        model_version: str,
        prediction: float,
        confidence: float,
        inference_time_ms: float,
        session: AsyncSession
    ) -> None:
        """Record a model prediction for monitoring.

        Args:
            device_id: Device identifier
            model_version: Model version used
            prediction: Prediction value (0 or 1 for binary)
            confidence: Prediction confidence (0-1)
            inference_time_ms: Inference time in milliseconds
            session: Database session
        """
        # Store in buffer for batch processing
        key = f"{device_id}:{model_version}"
        self.prediction_buffer[key].append({
            "timestamp": datetime.utcnow(),
            "prediction": prediction,
            "confidence": confidence,
            "inference_time_ms": inference_time_ms
        })

        # Flush buffer if full
        if len(self.prediction_buffer[key]) >= self.max_buffer_size:
            await self._flush_predictions(key, session)

    async def _flush_predictions(
        self,
        key: str,
        session: AsyncSession
    ) -> None:
        """Flush prediction buffer to database.

        Args:
            key: Buffer key (device_id:model_version)
            session: Database session
        """
        if key not in self.prediction_buffer:
            return

        predictions = self.prediction_buffer[key]
        if not predictions:
            return

        # TODO: Store predictions in dedicated monitoring table
        # For now, we'll aggregate and cache metrics

        device_id, model_version = key.split(":")

        # Calculate metrics
        avg_confidence = sum(p["confidence"] for p in predictions) / len(predictions)
        avg_inference_time = sum(p["inference_time_ms"] for p in predictions) / len(predictions)
        ad_ratio = sum(1 for p in predictions if p["prediction"] > 0.5) / len(predictions)

        # Cache metrics
        cache_key = f"model_metrics:{device_id}:{model_version}"
        await cache.set(
            cache_key,
            {
                "avg_confidence": avg_confidence,
                "avg_inference_time_ms": avg_inference_time,
                "ad_detection_ratio": ad_ratio,
                "sample_count": len(predictions),
                "last_updated": datetime.utcnow().isoformat()
            },
            ttl=3600  # 1 hour
        )

        # Clear buffer
        self.prediction_buffer[key].clear()

        logger.debug(
            f"Flushed {len(predictions)} predictions for {device_id}:{model_version}"
        )

    async def get_model_performance(
        self,
        session: AsyncSession,
        model_name: str,
        version: Optional[str] = None,
        time_window_hours: int = 24
    ) -> Dict:
        """Get model performance metrics.

        Args:
            session: Database session
            model_name: Model name
            version: Model version (None = production version)
            time_window_hours: Time window for metrics

        Returns:
            Performance metrics dict
        """
        # Get model version
        if version:
            result = await session.execute(
                select(MLModelVersion)
                .join(MLModelVersion.model)
                .where(
                    and_(
                        MLModelVersion.model.has(name=model_name),
                        MLModelVersion.version == version
                    )
                )
            )
        else:
            result = await session.execute(
                select(MLModelVersion)
                .join(MLModelVersion.model)
                .where(
                    and_(
                        MLModelVersion.model.has(name=model_name),
                        MLModelVersion.is_production == True
                    )
                )
            )

        model_version = result.scalar_one_or_none()

        if not model_version:
            return {
                "error": "Model version not found",
                "model_name": model_name,
                "version": version
            }

        # Get telemetry data from devices using this model
        cutoff_time = datetime.utcnow() - timedelta(hours=time_window_hours)

        result = await session.execute(
            select(
                func.count(Telemetry.id).label("total_inferences"),
                func.avg(Telemetry.average_inference_time_ms).label("avg_inference_time"),
                func.avg(Telemetry.average_confidence).label("avg_confidence"),
                func.sum(Telemetry.total_ad_breaks).label("total_ad_breaks"),
                func.sum(Telemetry.total_frames_analyzed).label("total_frames")
            )
            .where(Telemetry.period_start >= cutoff_time)
        )

        stats = result.one()

        return {
            "model_name": model_name,
            "version": model_version.version,
            "status": model_version.status,
            "is_production": model_version.is_production,
            "time_window_hours": time_window_hours,
            "metrics": {
                "total_inferences": stats.total_inferences or 0,
                "avg_inference_time_ms": float(stats.avg_inference_time or 0),
                "avg_confidence": float(stats.avg_confidence or 0),
                "total_ad_breaks": stats.total_ad_breaks or 0,
                "total_frames_analyzed": stats.total_frames or 0,
                "ad_detection_rate": (
                    (stats.total_ad_breaks / stats.total_frames)
                    if stats.total_frames else 0
                )
            },
            "training_metrics": {
                "accuracy": model_version.accuracy,
                "precision": model_version.precision,
                "recall": model_version.recall,
                "f1_score": model_version.f1_score
            }
        }

    async def detect_data_drift(
        self,
        session: AsyncSession,
        model_name: str,
        baseline_window_hours: int = 168,  # 1 week
        current_window_hours: int = 24  # 1 day
    ) -> Dict:
        """Detect data drift by comparing prediction distributions.

        Args:
            session: Database session
            model_name: Model name
            baseline_window_hours: Baseline time window
            current_window_hours: Current time window

        Returns:
            Drift detection results
        """
        baseline_cutoff = datetime.utcnow() - timedelta(hours=baseline_window_hours)
        current_cutoff = datetime.utcnow() - timedelta(hours=current_window_hours)

        # Get baseline statistics
        baseline_result = await session.execute(
            select(
                func.avg(Telemetry.average_confidence).label("avg_confidence"),
                func.avg(Telemetry.average_inference_time_ms).label("avg_inference_time"),
                func.sum(Telemetry.ad_frames_detected).label("ad_frames"),
                func.sum(Telemetry.total_frames_analyzed).label("total_frames")
            )
            .where(
                and_(
                    Telemetry.period_start >= baseline_cutoff,
                    Telemetry.period_start < current_cutoff
                )
            )
        )

        baseline = baseline_result.one()

        # Get current statistics
        current_result = await session.execute(
            select(
                func.avg(Telemetry.average_confidence).label("avg_confidence"),
                func.avg(Telemetry.average_inference_time_ms).label("avg_inference_time"),
                func.sum(Telemetry.ad_frames_detected).label("ad_frames"),
                func.sum(Telemetry.total_frames_analyzed).label("total_frames")
            )
            .where(Telemetry.period_start >= current_cutoff)
        )

        current = current_result.one()

        # Calculate drift metrics
        baseline_ad_rate = (
            (baseline.ad_frames / baseline.total_frames)
            if baseline.total_frames else 0
        )
        current_ad_rate = (
            (current.ad_frames / current.total_frames)
            if current.total_frames else 0
        )

        confidence_drift = abs(
            (current.avg_confidence or 0) - (baseline.avg_confidence or 0)
        )
        ad_rate_drift = abs(current_ad_rate - baseline_ad_rate)

        # Define drift thresholds
        CONFIDENCE_THRESHOLD = 0.1  # 10% change in confidence
        AD_RATE_THRESHOLD = 0.15  # 15% change in ad detection rate

        drift_detected = (
            confidence_drift > CONFIDENCE_THRESHOLD or
            ad_rate_drift > AD_RATE_THRESHOLD
        )

        return {
            "model_name": model_name,
            "drift_detected": drift_detected,
            "baseline_window_hours": baseline_window_hours,
            "current_window_hours": current_window_hours,
            "baseline": {
                "avg_confidence": float(baseline.avg_confidence or 0),
                "ad_detection_rate": baseline_ad_rate,
                "total_frames": baseline.total_frames or 0
            },
            "current": {
                "avg_confidence": float(current.avg_confidence or 0),
                "ad_detection_rate": current_ad_rate,
                "total_frames": current.total_frames or 0
            },
            "drift_metrics": {
                "confidence_drift": confidence_drift,
                "ad_rate_drift": ad_rate_drift,
                "confidence_threshold": CONFIDENCE_THRESHOLD,
                "ad_rate_threshold": AD_RATE_THRESHOLD
            }
        }

    async def get_model_health(
        self,
        session: AsyncSession,
        model_name: str
    ) -> Dict:
        """Get overall model health status.

        Args:
            session: Database session
            model_name: Model name

        Returns:
            Health status dict
        """
        # Get model performance
        performance = await self.get_model_performance(
            session,
            model_name,
            time_window_hours=24
        )

        # Get drift detection
        drift = await self.detect_data_drift(session, model_name)

        # Determine health status
        health_score = 100

        # Check inference time (target < 50ms)
        avg_inference_time = performance["metrics"]["avg_inference_time_ms"]
        if avg_inference_time > 100:
            health_score -= 30
        elif avg_inference_time > 50:
            health_score -= 15

        # Check confidence (target > 0.7)
        avg_confidence = performance["metrics"]["avg_confidence"]
        if avg_confidence < 0.5:
            health_score -= 30
        elif avg_confidence < 0.7:
            health_score -= 15

        # Check drift
        if drift["drift_detected"]:
            health_score -= 20

        # Determine status
        if health_score >= 80:
            status = "healthy"
        elif health_score >= 60:
            status = "warning"
        else:
            status = "critical"

        issues = []

        if avg_inference_time > 50:
            issues.append({
                "type": "performance",
                "severity": "high" if avg_inference_time > 100 else "medium",
                "message": f"Inference time ({avg_inference_time:.1f}ms) exceeds target (50ms)"
            })

        if avg_confidence < 0.7:
            issues.append({
                "type": "confidence",
                "severity": "high" if avg_confidence < 0.5 else "medium",
                "message": f"Low average confidence ({avg_confidence:.2f})"
            })

        if drift["drift_detected"]:
            issues.append({
                "type": "drift",
                "severity": "medium",
                "message": "Data drift detected - model may need retraining",
                "details": drift["drift_metrics"]
            })

        return {
            "model_name": model_name,
            "status": status,
            "health_score": health_score,
            "timestamp": datetime.utcnow().isoformat(),
            "performance": performance["metrics"],
            "drift": drift,
            "issues": issues,
            "recommendations": self._generate_recommendations(
                health_score,
                issues,
                performance,
                drift
            )
        }

    def _generate_recommendations(
        self,
        health_score: int,
        issues: List[Dict],
        performance: Dict,
        drift: Dict
    ) -> List[str]:
        """Generate recommendations based on health status.

        Args:
            health_score: Overall health score
            issues: List of detected issues
            performance: Performance metrics
            drift: Drift detection results

        Returns:
            List of recommendations
        """
        recommendations = []

        # Performance recommendations
        if any(i["type"] == "performance" for i in issues):
            recommendations.append(
                "Consider optimizing model inference by:\n"
                "  - Reducing model complexity\n"
                "  - Using more aggressive quantization\n"
                "  - Upgrading device hardware"
            )

        # Confidence recommendations
        if any(i["type"] == "confidence" for i in issues):
            recommendations.append(
                "Low confidence detected. Consider:\n"
                "  - Retraining model with more data\n"
                "  - Adjusting confidence threshold\n"
                "  - Reviewing recent predictions for patterns"
            )

        # Drift recommendations
        if drift["drift_detected"]:
            recommendations.append(
                "Data drift detected. Recommended actions:\n"
                "  - Collect recent data for analysis\n"
                "  - Retrain model with updated dataset\n"
                "  - Consider using ensemble of models"
            )

        # General recommendations
        if health_score < 60:
            recommendations.append(
                "Critical health status - immediate attention required:\n"
                "  - Review model deployment configuration\n"
                "  - Check for hardware/software issues\n"
                "  - Consider rolling back to previous version"
            )

        return recommendations


# Global monitoring service instance
model_monitoring = ModelMonitoringService()
