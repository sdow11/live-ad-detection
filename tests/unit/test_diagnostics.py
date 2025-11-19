"""Unit tests for diagnostics and error tracking."""

import pytest
from datetime import datetime


@pytest.mark.unit
class TestDiagnosticsCollector:
    """Test diagnostics collection functionality."""

    def test_report_error(self, diagnostics_collector, sample_error):
        """Test error reporting."""
        diagnostics_collector.report_error(
            "test_component",
            sample_error,
            context={"user": "test"},
            severity="error"
        )

        assert len(diagnostics_collector.error_reports) == 1
        report = diagnostics_collector.error_reports[0]

        assert report.component == "test_component"
        assert report.error_type == "ValueError"
        assert report.error_message == "Test error message"
        assert report.severity == "error"
        assert report.context["user"] == "test"

    def test_report_crash(self, diagnostics_collector, sample_error):
        """Test crash reporting."""
        diagnostics_collector.report_crash(
            "test_component",
            sample_error,
            context={"action": "test_action"}
        )

        assert len(diagnostics_collector.error_reports) == 1
        report = diagnostics_collector.error_reports[0]

        assert report.severity == "critical"
        assert report.component == "test_component"

    def test_get_recent_errors(self, diagnostics_collector, sample_error):
        """Test retrieving recent errors."""
        # Add some errors
        for i in range(5):
            diagnostics_collector.report_error(
                f"component_{i}",
                sample_error,
                severity="error"
            )

        recent = diagnostics_collector.get_recent_errors(limit=3)

        assert len(recent) == 3
        assert all(isinstance(r.timestamp, datetime) for r in recent)

    def test_get_recent_errors_by_component(self, diagnostics_collector, sample_error):
        """Test filtering errors by component."""
        diagnostics_collector.report_error("comp1", sample_error)
        diagnostics_collector.report_error("comp2", sample_error)
        diagnostics_collector.report_error("comp1", sample_error)

        comp1_errors = diagnostics_collector.get_recent_errors(component="comp1")

        assert len(comp1_errors) == 2
        assert all(r.component == "comp1" for r in comp1_errors)

    def test_get_recent_errors_by_severity(self, diagnostics_collector, sample_error):
        """Test filtering errors by severity."""
        diagnostics_collector.report_error("comp1", sample_error, severity="warning")
        diagnostics_collector.report_error("comp2", sample_error, severity="error")
        diagnostics_collector.report_error("comp3", sample_error, severity="critical")

        critical_errors = diagnostics_collector.get_recent_errors(severity="critical")

        assert len(critical_errors) == 1
        assert critical_errors[0].severity == "critical"

    def test_get_error_summary(self, diagnostics_collector, sample_error):
        """Test error summary statistics."""
        # Add various errors
        diagnostics_collector.report_error("comp1", sample_error, severity="error")
        diagnostics_collector.report_error("comp1", sample_error, severity="warning")
        diagnostics_collector.report_error("comp2", sample_error, severity="error")

        summary = diagnostics_collector.get_error_summary()

        assert summary["total_errors"] == 3
        assert "comp1" in summary["by_component"]
        assert summary["by_component"]["comp1"] == 2
        assert "error" in summary["by_severity"]
        assert summary["by_severity"]["error"] == 2

    def test_max_reports_limit(self, diagnostics_collector, sample_error):
        """Test that error reports are limited."""
        diagnostics_collector.max_reports = 10

        # Add more than max
        for i in range(15):
            diagnostics_collector.report_error("comp", sample_error)

        assert len(diagnostics_collector.error_reports) == 10

    def test_export_diagnostics(self, diagnostics_collector, sample_error, mock_log_dir):
        """Test diagnostics export."""
        diagnostics_collector.report_error("comp", sample_error)

        export_path = diagnostics_collector.export_diagnostics()

        assert export_path.exists()
        assert export_path.suffix == ".json"

    def test_clear_old_logs(self, diagnostics_collector, mock_log_dir):
        """Test clearing old log files."""
        # Create some old files
        old_file = mock_log_dir / "old_diagnostics.json"
        old_file.write_text("{}")

        import time
        import os

        # Make file appear old
        old_time = time.time() - (40 * 86400)  # 40 days ago
        os.utime(old_file, (old_time, old_time))

        deleted = diagnostics_collector.clear_old_logs(days=30)

        assert deleted >= 1

    def test_error_report_to_dict(self, diagnostics_collector, sample_error):
        """Test error report serialization."""
        diagnostics_collector.report_error("comp", sample_error, context={"key": "value"})

        report = diagnostics_collector.error_reports[0]
        report_dict = report.to_dict()

        assert isinstance(report_dict, dict)
        assert report_dict["component"] == "comp"
        assert report_dict["error_type"] == "ValueError"
        assert "timestamp" in report_dict
        assert report_dict["context"]["key"] == "value"
