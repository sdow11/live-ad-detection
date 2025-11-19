"""Prometheus metrics exporter.

Exports system monitoring metrics in Prometheus format for
external monitoring and visualization.
"""

import logging
from typing import List

logger = logging.getLogger(__name__)


class PrometheusExporter:
    """Exports metrics in Prometheus format."""

    def __init__(self):
        """Initialize Prometheus exporter."""
        self.namespace = "ad_detection"

    def _format_metric(
        self,
        name: str,
        metric_type: str,
        value: float,
        labels: dict = None,
        help_text: str = ""
    ) -> str:
        """Format a single metric in Prometheus format.

        Args:
            name: Metric name
            metric_type: Type (counter, gauge, histogram, summary)
            value: Metric value
            labels: Label dict
            help_text: Help text for the metric

        Returns:
            Formatted metric string
        """
        lines = []

        # Add help text
        if help_text:
            lines.append(f"# HELP {self.namespace}_{name} {help_text}")

        # Add type
        lines.append(f"# TYPE {self.namespace}_{name} {metric_type}")

        # Add metric with labels
        metric_name = f"{self.namespace}_{name}"
        if labels:
            label_str = ",".join([f'{k}="{v}"' for k, v in labels.items()])
            lines.append(f"{metric_name}{{{label_str}}} {value}")
        else:
            lines.append(f"{metric_name} {value}")

        return "\n".join(lines)

    def export_system_metrics(self) -> str:
        """Export system metrics.

        Returns:
            Prometheus formatted metrics
        """
        from system.system_monitor import system_monitor

        metrics = system_monitor.get_latest_metrics()
        if not metrics:
            return ""

        output = []

        # CPU metrics
        output.append(self._format_metric(
            "cpu_usage_percent",
            "gauge",
            metrics.cpu_percent,
            help_text="CPU usage percentage"
        ))

        if metrics.cpu_temp is not None:
            output.append(self._format_metric(
                "cpu_temperature_celsius",
                "gauge",
                metrics.cpu_temp,
                help_text="CPU temperature in Celsius"
            ))

        # Memory metrics
        output.append(self._format_metric(
            "memory_usage_percent",
            "gauge",
            metrics.memory_percent,
            help_text="Memory usage percentage"
        ))

        output.append(self._format_metric(
            "memory_used_bytes",
            "gauge",
            metrics.memory_used_mb * 1024 * 1024,
            help_text="Memory used in bytes"
        ))

        output.append(self._format_metric(
            "memory_total_bytes",
            "gauge",
            metrics.memory_total_mb * 1024 * 1024,
            help_text="Total memory in bytes"
        ))

        # Disk metrics
        output.append(self._format_metric(
            "disk_usage_percent",
            "gauge",
            metrics.disk_percent,
            help_text="Disk usage percentage"
        ))

        output.append(self._format_metric(
            "disk_used_bytes",
            "gauge",
            metrics.disk_used_gb * 1024 * 1024 * 1024,
            help_text="Disk used in bytes"
        ))

        output.append(self._format_metric(
            "disk_total_bytes",
            "gauge",
            metrics.disk_total_gb * 1024 * 1024 * 1024,
            help_text="Total disk in bytes"
        ))

        # Network metrics
        output.append(self._format_metric(
            "network_sent_bytes_total",
            "counter",
            metrics.network_sent_mb * 1024 * 1024,
            help_text="Total network bytes sent"
        ))

        output.append(self._format_metric(
            "network_received_bytes_total",
            "counter",
            metrics.network_recv_mb * 1024 * 1024,
            help_text="Total network bytes received"
        ))

        # System metrics
        output.append(self._format_metric(
            "uptime_seconds",
            "counter",
            metrics.uptime_seconds,
            help_text="System uptime in seconds"
        ))

        output.append(self._format_metric(
            "process_count",
            "gauge",
            metrics.process_count,
            help_text="Number of running processes"
        ))

        return "\n\n".join(output) + "\n"

    def export_app_metrics(self) -> str:
        """Export app performance metrics.

        Returns:
            Prometheus formatted metrics
        """
        from system.system_monitor import system_monitor

        app_metrics = system_monitor.get_all_app_metrics()
        if not app_metrics:
            return ""

        output = []

        for app_metric in app_metrics:
            labels = {"app_id": app_metric.app_id, "status": app_metric.status}

            # Launch count
            output.append(self._format_metric(
                "app_launches_total",
                "counter",
                app_metric.launch_count,
                labels=labels,
                help_text="Total number of app launches"
            ))

            # Error count
            output.append(self._format_metric(
                "app_errors_total",
                "counter",
                app_metric.error_count,
                labels=labels,
                help_text="Total number of app errors"
            ))

            # Crash count
            output.append(self._format_metric(
                "app_crashes_total",
                "counter",
                app_metric.crash_count,
                labels=labels,
                help_text="Total number of app crashes"
            ))

            # Runtime
            output.append(self._format_metric(
                "app_runtime_seconds",
                "gauge",
                app_metric.runtime_seconds,
                labels=labels,
                help_text="App runtime in seconds"
            ))

        return "\n\n".join(output) + "\n"

    def export_health_metrics(self) -> str:
        """Export health check metrics.

        Returns:
            Prometheus formatted metrics
        """
        from system.health_check import health_checker

        health_summary = health_checker.get_health_summary()
        if not health_summary or "components" not in health_summary:
            return ""

        output = []

        # Overall health status (0=unknown, 1=healthy, 2=degraded, 3=unhealthy)
        status_map = {
            "unknown": 0,
            "healthy": 1,
            "degraded": 2,
            "unhealthy": 3
        }

        overall_value = status_map.get(health_summary["overall_status"], 0)
        output.append(self._format_metric(
            "health_status",
            "gauge",
            overall_value,
            help_text="Overall health status (0=unknown, 1=healthy, 2=degraded, 3=unhealthy)"
        ))

        # Component health
        for component, details in health_summary["components"].items():
            status_value = status_map.get(details["status"], 0)
            labels = {"component": component}

            output.append(self._format_metric(
                "component_health_status",
                "gauge",
                status_value,
                labels=labels,
                help_text="Component health status"
            ))

        return "\n\n".join(output) + "\n"

    def export_diagnostics_metrics(self) -> str:
        """Export diagnostics metrics.

        Returns:
            Prometheus formatted metrics
        """
        from system.diagnostics import diagnostics_collector

        error_summary = diagnostics_collector.get_error_summary()
        if not error_summary:
            return ""

        output = []

        # Total errors
        output.append(self._format_metric(
            "errors_total",
            "counter",
            error_summary["total_errors"],
            help_text="Total number of errors"
        ))

        # Errors by severity
        for severity, count in error_summary.get("by_severity", {}).items():
            labels = {"severity": severity}
            output.append(self._format_metric(
                "errors_by_severity_total",
                "counter",
                count,
                labels=labels,
                help_text="Errors by severity level"
            ))

        # Errors by component
        for component, count in error_summary.get("by_component", {}).items():
            labels = {"component": component}
            output.append(self._format_metric(
                "errors_by_component_total",
                "counter",
                count,
                labels=labels,
                help_text="Errors by component"
            ))

        return "\n\n".join(output) + "\n"

    def export_all_metrics(self) -> str:
        """Export all metrics in Prometheus format.

        Returns:
            Complete Prometheus formatted metrics
        """
        sections = [
            self.export_system_metrics(),
            self.export_app_metrics(),
            self.export_health_metrics(),
            self.export_diagnostics_metrics()
        ]

        return "\n".join([s for s in sections if s]) + "\n"


# Global Prometheus exporter instance
prometheus_exporter = PrometheusExporter()
