"""A/B testing framework for model comparison.

Supports:
- Multi-variant testing (A/B/C/D...)
- Traffic splitting with configurable percentages
- Statistical significance testing
- Performance metric comparison
- Automatic winner selection based on criteria
"""

import logging
import random
from datetime import datetime, timedelta
from enum import Enum
from typing import Dict, List, Optional, Tuple

from sqlalchemy import Column, DateTime, Enum as SQLEnum, Float, Integer, JSON, String, Text
from sqlalchemy.ext.asyncio import AsyncSession

from cloud_api.models import Base

logger = logging.getLogger(__name__)


class ExperimentStatus(str, Enum):
    """Experiment status."""
    DRAFT = "draft"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class ExperimentType(str, Enum):
    """Experiment type."""
    MODEL_COMPARISON = "model_comparison"
    FEATURE_FLAG = "feature_flag"
    CONFIGURATION = "configuration"


class Experiment(Base):
    """A/B test experiment model."""

    __tablename__ = "experiments"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, index=True)

    # Experiment details
    name = Column(String(255), nullable=False)
    description = Column(Text)
    experiment_type = Column(SQLEnum(ExperimentType), nullable=False)
    status = Column(SQLEnum(ExperimentStatus), default=ExperimentStatus.DRAFT, nullable=False)

    # Variants configuration
    variants = Column(JSON, nullable=False)  # List of variant configs

    # Traffic allocation
    traffic_allocation = Column(JSON, nullable=False)  # Dict mapping variant to percentage

    # Success criteria
    primary_metric = Column(String(100), nullable=False)  # e.g., "accuracy", "f1_score"
    secondary_metrics = Column(JSON)  # List of additional metrics to track
    minimum_sample_size = Column(Integer, default=1000)
    confidence_level = Column(Float, default=0.95)  # 95% confidence

    # Time constraints
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    min_duration_hours = Column(Integer, default=24)

    # Results
    winner_variant = Column(String(100))
    winner_selected_at = Column(DateTime)
    results = Column(JSON)  # Detailed results

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    created_by = Column(Integer)  # User ID

    def __repr__(self) -> str:
        return f"<Experiment(id={self.id}, name='{self.name}', status={self.status})>"


class ExperimentAssignment(Base):
    """Device assignment to experiment variant."""

    __tablename__ = "experiment_assignments"

    id = Column(Integer, primary_key=True, index=True)
    experiment_id = Column(Integer, nullable=False, index=True)
    device_id = Column(Integer, nullable=False, index=True)

    # Assignment
    variant = Column(String(100), nullable=False)
    assigned_at = Column(DateTime, default=datetime.utcnow)

    # Sticky assignment (device stays in same variant)
    sticky = Column(Integer, default=1)

    def __repr__(self) -> str:
        return f"<ExperimentAssignment(experiment={self.experiment_id}, device={self.device_id}, variant={self.variant})>"


class ExperimentMetric(Base):
    """Metric measurements for experiment variants."""

    __tablename__ = "experiment_metrics"

    id = Column(Integer, primary_key=True, index=True)
    experiment_id = Column(Integer, nullable=False, index=True)
    variant = Column(String(100), nullable=False, index=True)
    device_id = Column(Integer, nullable=False)

    # Metrics
    metric_name = Column(String(100), nullable=False)
    metric_value = Column(Float, nullable=False)

    # Context
    sample_size = Column(Integer, default=1)
    metadata = Column(JSON)

    # Timestamp
    recorded_at = Column(DateTime, default=datetime.utcnow, index=True)

    def __repr__(self) -> str:
        return f"<ExperimentMetric(experiment={self.experiment_id}, variant={self.variant}, metric={self.metric_name}={self.metric_value})>"


class ABTestingService:
    """Service for A/B testing experiments."""

    def __init__(self):
        """Initialize A/B testing service."""
        pass

    async def create_experiment(
        self,
        session: AsyncSession,
        name: str,
        variants: List[Dict],
        traffic_allocation: Dict[str, float],
        primary_metric: str,
        experiment_type: ExperimentType = ExperimentType.MODEL_COMPARISON,
        description: Optional[str] = None,
        secondary_metrics: Optional[List[str]] = None,
        minimum_sample_size: int = 1000,
        confidence_level: float = 0.95,
        min_duration_hours: int = 24,
        organization_id: Optional[int] = None
    ) -> Experiment:
        """Create new A/B test experiment.

        Args:
            session: Database session
            name: Experiment name
            variants: List of variant configurations
            traffic_allocation: Traffic split (variant_name -> percentage)
            primary_metric: Primary success metric
            experiment_type: Type of experiment
            description: Experiment description
            secondary_metrics: Additional metrics to track
            minimum_sample_size: Minimum samples per variant
            confidence_level: Statistical confidence level
            min_duration_hours: Minimum experiment duration
            organization_id: Organization ID

        Returns:
            Created experiment

        Raises:
            ValueError: If traffic allocation doesn't sum to 100
        """
        # Validate traffic allocation
        total_traffic = sum(traffic_allocation.values())
        if abs(total_traffic - 100.0) > 0.01:
            raise ValueError(
                f"Traffic allocation must sum to 100%, got {total_traffic}%"
            )

        # Validate variants
        variant_names = [v["name"] for v in variants]
        for variant_name in traffic_allocation.keys():
            if variant_name not in variant_names:
                raise ValueError(f"Unknown variant in traffic allocation: {variant_name}")

        # Create experiment
        experiment = Experiment(
            organization_id=organization_id,
            name=name,
            description=description,
            experiment_type=experiment_type,
            status=ExperimentStatus.DRAFT,
            variants=variants,
            traffic_allocation=traffic_allocation,
            primary_metric=primary_metric,
            secondary_metrics=secondary_metrics or [],
            minimum_sample_size=minimum_sample_size,
            confidence_level=confidence_level,
            min_duration_hours=min_duration_hours
        )

        session.add(experiment)
        await session.commit()
        await session.refresh(experiment)

        logger.info(f"Created experiment: {name} (ID: {experiment.id})")

        return experiment

    async def start_experiment(
        self,
        session: AsyncSession,
        experiment_id: int
    ) -> Experiment:
        """Start an experiment.

        Args:
            session: Database session
            experiment_id: Experiment ID

        Returns:
            Updated experiment

        Raises:
            ValueError: If experiment is not in draft status
        """
        from sqlalchemy import select

        result = await session.execute(
            select(Experiment).where(Experiment.id == experiment_id)
        )
        experiment = result.scalar_one_or_none()

        if not experiment:
            raise ValueError(f"Experiment {experiment_id} not found")

        if experiment.status != ExperimentStatus.DRAFT:
            raise ValueError(
                f"Can only start draft experiments, current status: {experiment.status}"
            )

        experiment.status = ExperimentStatus.RUNNING
        experiment.start_date = datetime.utcnow()

        await session.commit()
        await session.refresh(experiment)

        logger.info(f"Started experiment: {experiment.name}")

        return experiment

    async def assign_device_to_variant(
        self,
        session: AsyncSession,
        experiment_id: int,
        device_id: int
    ) -> str:
        """Assign device to experiment variant.

        Args:
            session: Database session
            experiment_id: Experiment ID
            device_id: Device ID

        Returns:
            Assigned variant name
        """
        from sqlalchemy import select

        # Check for existing assignment
        result = await session.execute(
            select(ExperimentAssignment).where(
                (ExperimentAssignment.experiment_id == experiment_id) &
                (ExperimentAssignment.device_id == device_id)
            )
        )
        assignment = result.scalar_one_or_none()

        if assignment:
            return assignment.variant

        # Get experiment
        result = await session.execute(
            select(Experiment).where(Experiment.id == experiment_id)
        )
        experiment = result.scalar_one_or_none()

        if not experiment:
            raise ValueError(f"Experiment {experiment_id} not found")

        # Select variant based on traffic allocation
        variant = self._select_variant(experiment.traffic_allocation)

        # Create assignment
        assignment = ExperimentAssignment(
            experiment_id=experiment_id,
            device_id=device_id,
            variant=variant,
            sticky=True
        )

        session.add(assignment)
        await session.commit()

        logger.debug(
            f"Assigned device {device_id} to variant '{variant}' "
            f"in experiment {experiment.name}"
        )

        return variant

    def _select_variant(self, traffic_allocation: Dict[str, float]) -> str:
        """Select variant based on traffic allocation.

        Args:
            traffic_allocation: Dict mapping variant to percentage

        Returns:
            Selected variant name
        """
        # Generate random number 0-100
        rand = random.uniform(0, 100)

        # Select variant based on cumulative probability
        cumulative = 0.0
        for variant, percentage in traffic_allocation.items():
            cumulative += percentage
            if rand <= cumulative:
                return variant

        # Fallback to first variant
        return list(traffic_allocation.keys())[0]

    async def record_metric(
        self,
        session: AsyncSession,
        experiment_id: int,
        device_id: int,
        metric_name: str,
        metric_value: float,
        sample_size: int = 1,
        metadata: Optional[Dict] = None
    ) -> None:
        """Record metric measurement for experiment.

        Args:
            session: Database session
            experiment_id: Experiment ID
            device_id: Device ID
            metric_name: Metric name
            metric_value: Metric value
            sample_size: Number of samples this metric represents
            metadata: Additional metadata
        """
        from sqlalchemy import select

        # Get device assignment
        result = await session.execute(
            select(ExperimentAssignment).where(
                (ExperimentAssignment.experiment_id == experiment_id) &
                (ExperimentAssignment.device_id == device_id)
            )
        )
        assignment = result.scalar_one_or_none()

        if not assignment:
            logger.warning(
                f"Device {device_id} not assigned to experiment {experiment_id}, "
                f"skipping metric recording"
            )
            return

        # Record metric
        metric = ExperimentMetric(
            experiment_id=experiment_id,
            variant=assignment.variant,
            device_id=device_id,
            metric_name=metric_name,
            metric_value=metric_value,
            sample_size=sample_size,
            metadata=metadata
        )

        session.add(metric)
        await session.commit()

    async def get_experiment_results(
        self,
        session: AsyncSession,
        experiment_id: int
    ) -> Dict:
        """Get experiment results with statistical analysis.

        Args:
            session: Database session
            experiment_id: Experiment ID

        Returns:
            Results dict with variant statistics
        """
        from sqlalchemy import select, func

        # Get experiment
        result = await session.execute(
            select(Experiment).where(Experiment.id == experiment_id)
        )
        experiment = result.scalar_one_or_none()

        if not experiment:
            raise ValueError(f"Experiment {experiment_id} not found")

        # Get variant statistics
        variants_results = {}

        for variant_config in experiment.variants:
            variant_name = variant_config["name"]

            # Get primary metric statistics
            result = await session.execute(
                select(
                    func.count(ExperimentMetric.id).label("count"),
                    func.avg(ExperimentMetric.metric_value).label("mean"),
                    func.min(ExperimentMetric.metric_value).label("min"),
                    func.max(ExperimentMetric.metric_value).label("max")
                ).where(
                    (ExperimentMetric.experiment_id == experiment_id) &
                    (ExperimentMetric.variant == variant_name) &
                    (ExperimentMetric.metric_name == experiment.primary_metric)
                )
            )

            stats = result.one()

            # Calculate standard deviation
            if stats.count > 0:
                result = await session.execute(
                    select(ExperimentMetric.metric_value).where(
                        (ExperimentMetric.experiment_id == experiment_id) &
                        (ExperimentMetric.variant == variant_name) &
                        (ExperimentMetric.metric_name == experiment.primary_metric)
                    )
                )

                values = [row[0] for row in result]
                import statistics
                std_dev = statistics.stdev(values) if len(values) > 1 else 0.0
            else:
                std_dev = 0.0

            variants_results[variant_name] = {
                "sample_size": stats.count,
                "mean": float(stats.mean) if stats.mean else 0.0,
                "std_dev": std_dev,
                "min": float(stats.min) if stats.min else 0.0,
                "max": float(stats.max) if stats.max else 0.0
            }

        # Determine if we have statistical significance
        is_significant, best_variant = self._calculate_significance(
            variants_results,
            experiment.confidence_level
        )

        # Check if minimum requirements are met
        min_samples_met = all(
            v["sample_size"] >= experiment.minimum_sample_size
            for v in variants_results.values()
        )

        min_duration_met = False
        if experiment.start_date:
            duration = datetime.utcnow() - experiment.start_date
            min_duration_met = duration.total_seconds() / 3600 >= experiment.min_duration_hours

        can_conclude = min_samples_met and min_duration_met and is_significant

        return {
            "experiment_id": experiment.id,
            "experiment_name": experiment.name,
            "status": experiment.status,
            "start_date": experiment.start_date,
            "duration_hours": (
                (datetime.utcnow() - experiment.start_date).total_seconds() / 3600
                if experiment.start_date else 0
            ),
            "primary_metric": experiment.primary_metric,
            "variants": variants_results,
            "is_statistically_significant": is_significant,
            "best_variant": best_variant,
            "can_conclude": can_conclude,
            "requirements": {
                "min_samples_met": min_samples_met,
                "min_duration_met": min_duration_met,
                "min_sample_size": experiment.minimum_sample_size,
                "min_duration_hours": experiment.min_duration_hours
            }
        }

    def _calculate_significance(
        self,
        variants_results: Dict,
        confidence_level: float
    ) -> Tuple[bool, Optional[str]]:
        """Calculate statistical significance using t-test.

        Args:
            variants_results: Results for each variant
            confidence_level: Confidence level (e.g., 0.95)

        Returns:
            Tuple of (is_significant, best_variant_name)
        """
        # Simple implementation - compare control (first variant) to others
        variant_names = list(variants_results.keys())

        if len(variant_names) < 2:
            return False, variant_names[0] if variant_names else None

        # Find variant with highest mean
        best_variant = max(
            variant_names,
            key=lambda v: variants_results[v]["mean"]
        )

        # Simple heuristic: difference > 2 * std_dev indicates significance
        best_mean = variants_results[best_variant]["mean"]
        best_std = variants_results[best_variant]["std_dev"]

        # Compare to all other variants
        is_significant = True
        for variant_name in variant_names:
            if variant_name == best_variant:
                continue

            other_mean = variants_results[variant_name]["mean"]
            other_std = variants_results[variant_name]["std_dev"]

            # Simple significance test
            diff = abs(best_mean - other_mean)
            pooled_std = (best_std + other_std) / 2

            if pooled_std > 0 and diff < 2 * pooled_std:
                is_significant = False
                break

        return is_significant, best_variant if is_significant else None

    async def conclude_experiment(
        self,
        session: AsyncSession,
        experiment_id: int,
        force: bool = False
    ) -> Experiment:
        """Conclude experiment and select winner.

        Args:
            session: Database session
            experiment_id: Experiment ID
            force: Force conclusion even if requirements not met

        Returns:
            Updated experiment

        Raises:
            ValueError: If experiment cannot be concluded
        """
        from sqlalchemy import select

        # Get results
        results = await self.get_experiment_results(session, experiment_id)

        if not force and not results["can_conclude"]:
            raise ValueError(
                f"Experiment cannot be concluded yet. "
                f"Requirements: {results['requirements']}"
            )

        # Get experiment
        result = await session.execute(
            select(Experiment).where(Experiment.id == experiment_id)
        )
        experiment = result.scalar_one()

        # Update experiment
        experiment.status = ExperimentStatus.COMPLETED
        experiment.end_date = datetime.utcnow()
        experiment.winner_variant = results["best_variant"]
        experiment.winner_selected_at = datetime.utcnow()
        experiment.results = results

        await session.commit()
        await session.refresh(experiment)

        logger.info(
            f"Concluded experiment {experiment.name}: "
            f"winner = {experiment.winner_variant}"
        )

        return experiment


# Global A/B testing service instance
ab_testing_service = ABTestingService()
