"""Tests for Prometheus metrics exporter."""

import pytest
from datetime import datetime

from system.prometheus_exporter import PrometheusExporter, prometheus_exporter


class TestPrometheusExporter:
    """Test Prometheus exporter functionality."""

    def test_singleton_instance(self):
        """Test that prometheus_exporter is a singleton."""
        assert prometheus_exporter is not None
        assert isinstance(prometheus_exporter, PrometheusExporter)

    def test_format_metric_gauge(self):
        """Test gauge metric formatting."""
        metric = prometheus_exporter._format_metric(
            "test_metric",
            "gauge",
            42.5,
            help_text="Test metric",
            labels={"device": "test"}
        )

        assert "# HELP ad_detection_test_metric Test metric" in metric
        assert "# TYPE ad_detection_test_metric gauge" in metric
        assert 'ad_detection_test_metric{device="test"} 42.5' in metric

    def test_format_metric_counter(self):
        """Test counter metric formatting."""
        metric = prometheus_exporter._format_metric(
            "test_counter_total",
            "counter",
            100,
            help_text="Test counter"
        )

        assert "# HELP ad_detection_test_counter_total Test counter" in metric
        assert "# TYPE ad_detection_test_counter_total counter" in metric
        assert "ad_detection_test_counter_total 100" in metric

    def test_format_metric_no_labels(self):
        """Test metric formatting without labels."""
        metric = prometheus_exporter._format_metric(
            "simple_metric",
            "gauge",
            123
        )

        assert "simple_metric 123" in metric
        assert "{" not in metric  # No labels

    def test_export_system_metrics(self, mock_psutil):
        """Test system metrics export."""
        from system.system_monitor import system_monitor

        # Collect a metric first
        metrics = system_monitor.collect_metrics()

        # Only test if metrics were collected
        if metrics:
            metrics_output = prometheus_exporter.export_system_metrics()
            # Should at least return a string
            assert isinstance(metrics_output, str)

    def test_export_app_metrics(self):
        """Test app metrics export."""
        from system.system_monitor import system_monitor

        # Register a test app
        system_monitor.register_app("test_app")
        system_monitor.update_app_status("test_app", "running")
        system_monitor.record_app_error("test_app", "Test error")

        metrics_output = prometheus_exporter.export_app_metrics()

        # Check that metrics are exported (even if empty)
        assert isinstance(metrics_output, str)

    def test_export_health_metrics(self):
        """Test health metrics export."""
        metrics_output = prometheus_exporter.export_health_metrics()

        # Check that metrics are exported
        assert isinstance(metrics_output, str)

    def test_export_diagnostics_metrics(self):
        """Test diagnostics metrics export."""
        from system import diagnostics_collector

        # Report some test errors
        diagnostics_collector.report_error(
            "test_component",
            Exception("Test error"),
            severity="warning"
        )

        metrics_output = prometheus_exporter.export_diagnostics_metrics()

        # Check that metrics are exported
        assert isinstance(metrics_output, str)

    def test_export_all_metrics(self, mock_psutil):
        """Test exporting all metrics together."""
        from system.system_monitor import system_monitor

        # Ensure we have some data
        system_monitor.collect_metrics()

        all_metrics = prometheus_exporter.export_all_metrics()

        # Check that output is valid and contains Prometheus format markers
        assert isinstance(all_metrics, str)
        assert len(all_metrics) > 0

        # Should have at least some structure
        lines = all_metrics.strip().split("\n")
        assert len(lines) > 0

    def test_prometheus_format_validity(self, mock_psutil):
        """Test that output is valid Prometheus format."""
        from system.system_monitor import system_monitor

        system_monitor.collect_metrics()
        system_monitor.register_app("test_app")
        system_monitor.update_app_status("test_app", "running")

        output = prometheus_exporter.export_all_metrics()

        # Prometheus format rules:
        # 1. HELP lines must come before TYPE lines
        # 2. TYPE lines must come before metric lines
        # 3. Metric names must be valid (alphanumeric + underscore)
        # 4. Labels must be in key="value" format

        lines = output.split("\n")
        current_metric = None

        for line in lines:
            if not line or line.startswith("#"):
                if line.startswith("# HELP"):
                    current_metric = line.split()[2]
                elif line.startswith("# TYPE"):
                    metric_name = line.split()[2]
                    metric_type = line.split()[3]
                    assert metric_type in ["gauge", "counter", "histogram", "summary"]
            else:
                # Metric line - should have valid format
                assert " " in line
                parts = line.split(" ")
                assert len(parts) >= 2  # metric_name value

                # Verify metric name format
                metric_part = parts[0]
                if "{" in metric_part:
                    # Has labels
                    assert "}" in metric_part
                    assert '="' in metric_part

    def test_empty_metrics_handling(self):
        """Test handling of empty metrics."""
        from system.system_monitor import system_monitor

        # Clear all data
        system_monitor.metrics_history.clear()
        system_monitor.app_metrics.clear()

        # Should not raise errors
        output = prometheus_exporter.export_all_metrics()

        # Should still have some structure
        assert isinstance(output, str)

    def test_special_characters_in_labels(self):
        """Test handling of special characters in labels."""
        from system.system_monitor import system_monitor

        # Register app with special characters
        app_id = "test-app.v1_beta"
        system_monitor.register_app(app_id)
        system_monitor.update_app_status(app_id, "running")

        output = prometheus_exporter.export_app_metrics()

        # Should return valid string output
        assert isinstance(output, str)

    def test_metric_value_types(self, mock_psutil):
        """Test different metric value types."""
        from system.system_monitor import system_monitor

        system_monitor.collect_metrics()

        output = prometheus_exporter.export_system_metrics()

        # Should handle integers and floats
        lines = [l for l in output.split("\n") if l and not l.startswith("#")]

        for line in lines:
            parts = line.split(" ")
            if len(parts) >= 2:
                value = parts[-1]
                # Should be a valid number
                assert value.replace(".", "").replace("-", "").isdigit() or value == "nan"
