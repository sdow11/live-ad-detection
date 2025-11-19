"""Integration tests for full system."""

import asyncio
import pytest


@pytest.mark.integration
class TestFullSystemIntegration:
    """Test full system integration."""

    @pytest.mark.asyncio
    async def test_monitoring_lifecycle(self, system_monitor, health_checker, mock_psutil):
        """Test complete monitoring lifecycle."""
        # System monitor should be running
        assert system_monitor.running is True

        # Collect metrics
        metrics = system_monitor.collect_metrics()
        assert metrics is not None

        # Run health checks
        results = await health_checker.run_all_checks()
        assert len(results) > 0

        # Check overall health
        overall = health_checker.get_overall_health()
        assert overall in ["healthy", "degraded", "unhealthy", "unknown"]

        # Stop services
        await system_monitor.stop()
        await health_checker.stop()

        assert system_monitor.running is False
        assert health_checker.running is False

    @pytest.mark.asyncio
    async def test_app_lifecycle_with_monitoring(
        self,
        app_registry,
        sample_app,
        system_monitor,
        diagnostics_collector
    ):
        """Test app lifecycle with monitoring integration."""
        # Register app
        app_registry.register_app(sample_app)
        system_monitor.register_app(sample_app.app_id)

        # Launch app
        system_monitor.update_app_status(sample_app.app_id, "starting")
        success = await app_registry.launch_app(sample_app.app_id)
        assert success is True

        system_monitor.update_app_status(sample_app.app_id, "running")

        # Check app metrics
        metrics = system_monitor.get_app_metrics(sample_app.app_id)
        assert metrics is not None
        assert metrics.status == "running"
        assert metrics.launch_count == 1

        # Stop app
        await app_registry.stop_app(sample_app.app_id)
        system_monitor.update_app_status(sample_app.app_id, "stopped")

        # Check final status
        metrics = system_monitor.get_app_metrics(sample_app.app_id)
        assert metrics.status == "stopped"

    @pytest.mark.asyncio
    async def test_error_tracking_integration(
        self,
        system_monitor,
        diagnostics_collector,
        sample_error
    ):
        """Test error tracking integration."""
        # Register app
        app_id = "test_app"
        system_monitor.register_app(app_id)

        # Simulate error
        system_monitor.record_app_error(app_id, "Test error")
        diagnostics_collector.report_error(app_id, sample_error, severity="error")

        # Check monitoring recorded it
        app_metrics = system_monitor.get_app_metrics(app_id)
        assert app_metrics.error_count == 1

        # Check diagnostics recorded it
        errors = diagnostics_collector.get_recent_errors(component=app_id)
        assert len(errors) == 1

        # Check error summary
        summary = diagnostics_collector.get_error_summary()
        assert summary["total_errors"] >= 1
        assert app_id in summary["by_component"]

    @pytest.mark.asyncio
    async def test_configuration_persistence(
        self,
        config_manager,
        boot_config,
        audio_manager
    ):
        """Test configuration persistence across components."""
        # Set some configurations
        config_manager.set_system("device_name", "Test Device")
        config_manager.set_preference("theme", "dark")
        config_manager.set_app_config("test_app", "setting1", "value1")

        boot_config.set_default_app("test_app")
        boot_config.save_config()

        audio_manager.system_volume = 75
        audio_manager.save_settings()

        # Verify all saved
        assert config_manager.get_system("device_name") == "Test Device"
        assert config_manager.get_preference("theme") == "dark"
        assert config_manager.get_app_config("test_app", "setting1") == "value1"
        assert boot_config.get_default_app() == "test_app"

    @pytest.mark.asyncio
    async def test_health_check_with_metrics(
        self,
        system_monitor,
        health_checker,
        mock_psutil
    ):
        """Test health checks using live metrics."""
        # Collect some metrics
        for _ in range(3):
            system_monitor.collect_metrics()
            await asyncio.sleep(0.5)

        # Run health checks
        results = await health_checker.run_all_checks()

        # All components should have results
        assert "cpu" in results
        assert "memory" in results
        assert "disk" in results

        # Each should have valid status
        for component, result in results.items():
            assert result.status in ["healthy", "degraded", "unhealthy", "unknown"]
            assert result.message is not None

    @pytest.mark.asyncio
    @pytest.mark.slow
    async def test_concurrent_operations(
        self,
        system_monitor,
        health_checker,
        diagnostics_collector,
        sample_error
    ):
        """Test concurrent system operations."""
        # Simulate concurrent operations
        async def collect_metrics():
            for _ in range(5):
                system_monitor.collect_metrics()
                await asyncio.sleep(0.1)

        async def run_health_checks():
            for _ in range(3):
                await health_checker.run_all_checks()
                await asyncio.sleep(0.2)

        async def report_errors():
            for i in range(5):
                diagnostics_collector.report_error(
                    f"comp_{i % 2}",
                    sample_error,
                    severity="error"
                )
                await asyncio.sleep(0.1)

        # Run all concurrently
        await asyncio.gather(
            collect_metrics(),
            run_health_checks(),
            report_errors()
        )

        # Verify results
        assert len(system_monitor.metrics_history) > 0
        assert len(health_checker.check_results) > 0
        assert len(diagnostics_collector.error_reports) > 0

    @pytest.mark.asyncio
    async def test_diagnostics_export_integration(
        self,
        system_monitor,
        health_checker,
        diagnostics_collector,
        sample_error,
        mock_psutil
    ):
        """Test full diagnostics export."""
        # Generate some activity
        system_monitor.collect_metrics()
        await health_checker.run_all_checks()
        diagnostics_collector.report_error("test", sample_error)

        # Export diagnostics
        export_file = diagnostics_collector.export_diagnostics()

        assert export_file.exists()

        # Verify export contains all data
        import json
        with open(export_file) as f:
            data = json.load(f)

        assert "system_info" in data
        assert "current_metrics" in data
        assert "health_summary" in data
        assert "error_summary" in data
        assert "recent_errors" in data

    @pytest.mark.asyncio
    async def test_monitoring_with_multiple_apps(
        self,
        app_registry,
        system_monitor,
        sample_app
    ):
        """Test monitoring multiple apps simultaneously."""
        # Create and register multiple apps
        apps = []
        for i in range(3):
            from home_screen.app_framework import BaseApp, AppCategory, AppStatus

            class TestApp(BaseApp):
                def __init__(self, app_id):
                    super().__init__(
                        app_id=app_id,
                        name=f"App {app_id}",
                        description="Test",
                        icon="🧪",
                        category=AppCategory.UTILITIES
                    )

                async def start(self):
                    self.status = AppStatus.RUNNING
                    return True

                async def stop(self):
                    self.status = AppStatus.STOPPED
                    return True

            app = TestApp(f"app_{i}")
            apps.append(app)
            app_registry.register_app(app)
            system_monitor.register_app(app.app_id)

        # Launch all apps
        for app in apps:
            await app_registry.launch_app(app.app_id)
            system_monitor.update_app_status(app.app_id, "running")

        # Check all are tracked
        all_metrics = system_monitor.get_all_app_metrics()
        running_apps = [m for m in all_metrics if m.status == "running"]

        assert len(running_apps) >= 3

        # Stop all
        for app in apps:
            await app_registry.stop_app(app.app_id)
