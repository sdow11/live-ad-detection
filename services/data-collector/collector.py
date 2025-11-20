"""
Live Ad Detection - Data Collector
Polls cluster nodes and aggregates data
"""

import asyncio
import aiohttp
import logging
import os
from datetime import datetime
from typing import List, Dict

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

API_URL = os.getenv("API_URL", "http://api-server:8000")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "30"))  # seconds


async def fetch_nodes() -> List[Dict]:
    """Fetch list of registered nodes from API"""
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(f"{API_URL}/api/v1/nodes") as response:
                if response.status == 200:
                    return await response.json()
                else:
                    logger.error(f"Failed to fetch nodes: {response.status}")
                    return []
        except Exception as e:
            logger.error(f"Error fetching nodes: {e}")
            return []


async def collect_node_stats(node: Dict):
    """Collect statistics from a specific node"""
    node_id = node["node_id"]
    node_ip = node["ip_address"]

    try:
        # Poll node's web interface for stats
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"http://{node_ip}:5000/api/device/info",
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    if data.get("success"):
                        info = data["info"]

                        # Send heartbeat to API with stats
                        stats = {
                            "cpu_usage": info.get("cpu", {}).get("percent", 0),
                            "memory_usage": info.get("memory", {}).get("percent", 0),
                            "disk_usage": info.get("disk", {}).get("percent", 0)
                        }

                        async with session.put(
                            f"{API_URL}/api/v1/nodes/{node_id}/heartbeat",
                            json=stats
                        ) as hb_response:
                            if hb_response.status == 200:
                                logger.debug(f"Updated stats for {node_id}")
                            else:
                                logger.warning(f"Failed to update stats for {node_id}")
                else:
                    logger.warning(f"Node {node_id} returned status {response.status}")

    except asyncio.TimeoutError:
        logger.warning(f"Timeout collecting stats from {node_id}")
    except Exception as e:
        logger.error(f"Error collecting stats from {node_id}: {e}")


async def collection_loop():
    """Main collection loop"""
    logger.info("Data collector started")

    while True:
        try:
            # Fetch all registered nodes
            nodes = await fetch_nodes()
            logger.info(f"Polling {len(nodes)} nodes...")

            # Collect stats from all nodes concurrently
            if nodes:
                await asyncio.gather(
                    *[collect_node_stats(node) for node in nodes],
                    return_exceptions=True
                )

            # Wait before next poll
            await asyncio.sleep(POLL_INTERVAL)

        except Exception as e:
            logger.error(f"Error in collection loop: {e}")
            await asyncio.sleep(5)


if __name__ == "__main__":
    asyncio.run(collection_loop())
