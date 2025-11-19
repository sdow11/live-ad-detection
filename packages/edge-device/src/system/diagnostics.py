"""Diagnostics and error tracking.

Collects error logs, crash reports, and diagnostic information
for troubleshooting and remote support.
"""

import json
import logging
import os
import traceback
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class ErrorReport:
    """Error report entry."""

    timestamp: datetime
    component: str
    error_type: str
    error_message: str
    stack_trace: Optional[str] = None
    context: Dict[str, any] = field(default_factory=dict)
    severity: str = "error"  # "debug", "info", "warning", "error", "critical"

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "timestamp": self.timestamp.isoformat(),
            "component": self.component,
            "error_type": self.error_type,
            "error_message": self.error_message,
            "stack_trace": self.stack_trace,
            "context": self.context,
            "severity": self.severity
        }


class DiagnosticsCollector:
    """Collects diagnostic information and error reports."""

    def __init__(self, log_dir: Optional[Path] = None):
        """Initialize diagnostics collector.

        Args:
            log_dir: Directory for diagnostic logs
        """
        self.log_dir = log_dir or Path("/var/lib/ad-detection/diagnostics")
        self.log_dir.mkdir(parents=True, exist_ok=True)

        self.error_reports: List[ErrorReport] = []
        self.max_reports = 1000  # Keep last 1000 reports in memory

    def report_error(
        self,
        component: str,
        error: Exception,
        context: Optional[Dict[str, any]] = None,
        severity: str = "error"
    ) -> None:
        """Report an error.

        Args:
            component: Component name
            error: Exception object
            context: Additional context
            severity: Error severity
        """
        report = ErrorReport(
            timestamp=datetime.now(),
            component=component,
            error_type=type(error).__name__,
            error_message=str(error),
            stack_trace=traceback.format_exc(),
            context=context or {},
            severity=severity
        )

        self.error_reports.append(report)

        # Trim old reports
        if len(self.error_reports) > self.max_reports:
            self.error_reports = self.error_reports[-self.max_reports:]

        # Log to file
        self._write_error_log(report)

        logger.error(
            f"Error in {component}: {error}",
            extra={"component": component, "context": context}
        )

    def report_crash(
        self,
        component: str,
        error: Exception,
        context: Optional[Dict[str, any]] = None
    ) -> None:
        """Report a crash.

        Args:
            component: Component name
            error: Exception object
            context: Additional context
        """
        self.report_error(component, error, context, severity="critical")

        # Write crash dump
        self._write_crash_dump(component, error, context)

    def _write_error_log(self, report: ErrorReport) -> None:
        """Write error to log file.

        Args:
            report: Error report
        """
        try:
            log_file = self.log_dir / "errors.jsonl"

            with open(log_file, 'a') as f:
                f.write(json.dumps(report.to_dict()) + '\n')

        except Exception as e:
            logger.error(f"Failed to write error log: {e}")

    def _write_crash_dump(
        self,
        component: str,
        error: Exception,
        context: Optional[Dict[str, any]]
    ) -> None:
        """Write crash dump to file.

        Args:
            component: Component name
            error: Exception object
            context: Additional context
        """
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            dump_file = self.log_dir / f"crash_{component}_{timestamp}.json"

            dump = {
                "timestamp": datetime.now().isoformat(),
                "component": component,
                "error_type": type(error).__name__,
                "error_message": str(error),
                "stack_trace": traceback.format_exc(),
                "context": context or {},
                "system_info": self._collect_system_info()
            }

            with open(dump_file, 'w') as f:
                json.dump(dump, f, indent=2)

            logger.critical(f"Crash dump written to: {dump_file}")

        except Exception as e:
            logger.error(f"Failed to write crash dump: {e}")

    def _collect_system_info(self) -> dict:
        """Collect system information for diagnostics.

        Returns:
            System information dictionary
        """
        from system.system_monitor import system_monitor

        info = system_monitor.get_system_info()
        metrics = system_monitor.get_latest_metrics()

        if metrics:
            info.update({
                "cpu_percent": metrics.cpu_percent,
                "cpu_temp": metrics.cpu_temp,
                "memory_percent": metrics.memory_percent,
                "disk_percent": metrics.disk_percent
            })

        return info

    def get_recent_errors(
        self,
        component: Optional[str] = None,
        severity: Optional[str] = None,
        limit: int = 100
    ) -> List[ErrorReport]:
        """Get recent error reports.

        Args:
            component: Filter by component
            severity: Filter by severity
            limit: Maximum number of reports

        Returns:
            List of error reports
        """
        reports = self.error_reports

        if component:
            reports = [r for r in reports if r.component == component]

        if severity:
            reports = [r for r in reports if r.severity == severity]

        return reports[-limit:]

    def get_error_summary(self) -> dict:
        """Get error summary statistics.

        Returns:
            Error summary dictionary
        """
        if not self.error_reports:
            return {
                "total_errors": 0,
                "by_component": {},
                "by_severity": {},
                "by_type": {}
            }

        by_component = {}
        by_severity = {}
        by_type = {}

        for report in self.error_reports:
            # By component
            by_component[report.component] = by_component.get(report.component, 0) + 1

            # By severity
            by_severity[report.severity] = by_severity.get(report.severity, 0) + 1

            # By type
            by_type[report.error_type] = by_type.get(report.error_type, 0) + 1

        return {
            "total_errors": len(self.error_reports),
            "by_component": by_component,
            "by_severity": by_severity,
            "by_type": by_type
        }

    def export_diagnostics(self, output_file: Optional[Path] = None) -> Path:
        """Export full diagnostics report.

        Args:
            output_file: Output file path

        Returns:
            Path to exported file
        """
        if not output_file:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_file = self.log_dir / f"diagnostics_{timestamp}.json"

        from system.system_monitor import system_monitor
        from system.health_check import health_checker

        diagnostics = {
            "timestamp": datetime.now().isoformat(),
            "system_info": system_monitor.get_system_info(),
            "current_metrics": system_monitor.get_latest_metrics().to_dict() if system_monitor.get_latest_metrics() else {},
            "health_summary": health_checker.get_health_summary(),
            "error_summary": self.get_error_summary(),
            "recent_errors": [r.to_dict() for r in self.get_recent_errors(limit=100)],
            "app_metrics": [m.to_dict() for m in system_monitor.get_all_app_metrics()]
        }

        with open(output_file, 'w') as f:
            json.dump(diagnostics, f, indent=2)

        logger.info(f"Diagnostics exported to: {output_file}")
        return output_file

    def clear_old_logs(self, days: int = 30) -> int:
        """Clear old diagnostic logs.

        Args:
            days: Delete logs older than this many days

        Returns:
            Number of files deleted
        """
        import time

        cutoff = time.time() - (days * 86400)
        deleted = 0

        try:
            for file in self.log_dir.glob("*.json"):
                if file.stat().st_mtime < cutoff:
                    file.unlink()
                    deleted += 1
                    logger.debug(f"Deleted old diagnostic file: {file}")

            logger.info(f"Deleted {deleted} old diagnostic files")

        except Exception as e:
            logger.error(f"Failed to clear old logs: {e}")

        return deleted


# Global diagnostics collector
diagnostics_collector = DiagnosticsCollector()
