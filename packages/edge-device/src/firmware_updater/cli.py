"""CLI for firmware updater.

Provides command-line interface for checking and applying firmware updates.
"""

import asyncio
import logging
import os
import sys
from pathlib import Path

import click

from firmware_updater import FirmwareUpdater

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger(__name__)


def load_config():
    """Load configuration from environment variables.

    Returns:
        Configuration dict
    """
    return {
        "cloud_api_url": os.environ.get(
            "CLOUD_API_URL",
            "https://api.example.com"
        ),
        "api_key": os.environ.get("API_KEY"),
        "device_id": os.environ.get("DEVICE_ID"),
        "current_version": os.environ.get("FIRMWARE_VERSION", "0.0.0"),
        "firmware_dir": os.environ.get(
            "FIRMWARE_DIR",
            "/opt/ad-detection/firmware"
        ),
        "backup_dir": os.environ.get(
            "FIRMWARE_BACKUP_DIR",
            "/opt/ad-detection/firmware-backup"
        )
    }


@click.group()
def cli():
    """Firmware updater CLI."""
    pass


@cli.command()
def check():
    """Check for available firmware updates."""
    config = load_config()

    if not config["api_key"]:
        logger.error("API_KEY environment variable not set")
        sys.exit(1)

    async def _check():
        updater = FirmwareUpdater(**config)

        try:
            update_info = await updater.check_for_update()

            if update_info:
                click.echo(f"✓ Update available: {update_info['target_version']}")
                click.echo(f"  Current version: {config['current_version']}")
                click.echo(f"  Target version: {update_info['target_version']}")
                click.echo(f"  File size: {update_info['file_size']} bytes")
                click.echo(f"  Checksum: {update_info['checksum']}")
                click.echo(f"  Canary: {update_info['is_canary']}")
                return 0
            else:
                click.echo("✓ No updates available")
                return 0

        except Exception as e:
            logger.error(f"Failed to check for updates: {e}")
            return 1

        finally:
            await updater.close()

    exit_code = asyncio.run(_check())
    sys.exit(exit_code)


@cli.command()
@click.option(
    "--auto-confirm",
    is_flag=True,
    help="Skip confirmation prompt"
)
def update(auto_confirm):
    """Download and install firmware update."""
    config = load_config()

    if not config["api_key"]:
        logger.error("API_KEY environment variable not set")
        sys.exit(1)

    async def _update():
        updater = FirmwareUpdater(**config)

        try:
            # Check for update
            update_info = await updater.check_for_update()

            if not update_info:
                click.echo("✓ No updates available")
                return 0

            # Display update info
            click.echo(f"Update available: {update_info['target_version']}")
            click.echo(f"Current version: {config['current_version']}")
            click.echo(f"File size: {update_info['file_size']} bytes")

            # Confirm update
            if not auto_confirm:
                if not click.confirm("Proceed with update?"):
                    click.echo("Update cancelled")
                    return 0

            # Perform update
            click.echo("Starting firmware update...")

            success = await updater.perform_update()

            if success:
                click.echo("✓ Firmware update completed successfully")
                click.echo("  Please restart the device to use the new firmware")
                return 0
            else:
                click.echo("✗ Firmware update failed")
                return 1

        except Exception as e:
            logger.error(f"Update failed: {e}", exc_info=True)
            return 1

        finally:
            await updater.close()

    exit_code = asyncio.run(_update())
    sys.exit(exit_code)


@cli.command()
def rollback():
    """Rollback to previous firmware version."""
    config = load_config()

    if not click.confirm(
        "Are you sure you want to rollback to the previous firmware version?"
    ):
        click.echo("Rollback cancelled")
        sys.exit(0)

    async def _rollback():
        updater = FirmwareUpdater(**config)

        try:
            success = await updater.rollback_firmware()

            if success:
                click.echo("✓ Rollback completed successfully")
                click.echo("  Please restart the device")
                return 0
            else:
                click.echo("✗ Rollback failed")
                return 1

        except Exception as e:
            logger.error(f"Rollback failed: {e}", exc_info=True)
            return 1

        finally:
            await updater.close()

    exit_code = asyncio.run(_rollback())
    sys.exit(exit_code)


@cli.command()
@click.option(
    "--interval",
    type=int,
    default=3600,
    help="Check interval in seconds (default: 3600 = 1 hour)"
)
def daemon(interval):
    """Run firmware updater as a daemon.

    Periodically checks for updates and applies them automatically.
    """
    config = load_config()

    if not config["api_key"]:
        logger.error("API_KEY environment variable not set")
        sys.exit(1)

    async def _daemon():
        updater = FirmwareUpdater(**config)

        logger.info(f"Firmware updater daemon started (interval: {interval}s)")

        try:
            while True:
                try:
                    logger.info("Checking for firmware updates...")

                    update_info = await updater.check_for_update()

                    if update_info:
                        logger.info(
                            f"Update available: {update_info['target_version']}"
                        )

                        # Only auto-update if not canary (for safety)
                        if not update_info.get("is_canary"):
                            logger.info("Performing automatic update")
                            success = await updater.perform_update()

                            if success:
                                logger.info("Update completed successfully")
                                logger.info("Device will restart in 60 seconds")
                                await asyncio.sleep(60)

                                # Restart device
                                import subprocess
                                subprocess.run(["reboot"], check=False)
                                return 0
                            else:
                                logger.error("Update failed")
                        else:
                            logger.info(
                                "Canary update detected - skipping auto-update. "
                                "Run 'firmware-updater update' manually to apply."
                            )

                except Exception as e:
                    logger.error(f"Error during update check: {e}", exc_info=True)

                # Wait before next check
                logger.info(f"Waiting {interval} seconds until next check")
                await asyncio.sleep(interval)

        except KeyboardInterrupt:
            logger.info("Daemon stopped by user")
            return 0

        finally:
            await updater.close()

    exit_code = asyncio.run(_daemon())
    sys.exit(exit_code)


if __name__ == "__main__":
    cli()
