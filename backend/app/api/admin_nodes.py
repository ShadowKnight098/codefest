import asyncio
import re
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.models import Judge0Node
from app.schemas.admin import (
    Judge0NodeCreate, Judge0NodeItem, Judge0NodesResponse,
    Judge0NodesSummary, Judge0NodeTestRequest
)
from app.api.deps import get_current_admin
from app.services.judge0 import judge0_service
from app.core.config import settings

router = APIRouter(prefix="/admin/nodes", tags=["Admin Connected Devices & Judge0 Nodes"])

from urllib.parse import urlparse

def normalize_node_url(url: str) -> str:
    cleaned = url.strip().rstrip("/")
    if not cleaned.startswith("http://") and not cleaned.startswith("https://"):
        if any(t in cleaned.lower() for t in ["trycloudflare.com", "cloudflare", "ngrok", "loca.lt"]):
            cleaned = f"https://{cleaned}"
        else:
            cleaned = f"http://{cleaned}"

    parsed = urlparse(cleaned)
    hostname = (parsed.hostname or "").lower()

    # If the user explicitly provided a port, preserve it
    if parsed.port:
        return cleaned

    # Check if host is a raw IP address (100.x.y.z, 192.168.x.x, 10.x.x.x) or localhost
    is_ip = bool(re.match(r"^(\d{1,3}\.){3}\d{1,3}$", hostname)) or hostname in ("localhost", "127.0.0.1")

    if is_ip:
        # Raw IPs hosting Judge0 listen on port 2358
        cleaned = f"{parsed.scheme}://{hostname}:2358"
    else:
        # Cloudflare Tunnels, Ngrok, Localtunnel, and standard domain names operate on standard 443/80
        # Do NOT append :2358 as Cloudflare edge servers do not accept port 2358!
        cleaned = f"{parsed.scheme}://{parsed.netloc}"

    return cleaned

async def _ensure_initial_nodes(db: AsyncSession) -> List[Judge0Node]:
    """Auto-seed and sync Judge0 nodes from settings/environment variables into the database."""
    res = await db.execute(select(Judge0Node).order_by(Judge0Node.created_at.asc()))
    nodes = list(res.scalars().all())
    existing_urls = {n.endpoint_url for n in nodes}

    configured = settings.judge0_endpoint_list
    updated = False
    for idx, ep in enumerate(configured, 1):
        cleaned = normalize_node_url(ep)
        if cleaned and cleaned not in existing_urls:
            node = Judge0Node(
                name=f"Configured Node {idx}",
                endpoint_url=cleaned,
                is_active=True
            )
            db.add(node)
            nodes.append(node)
            existing_urls.add(cleaned)
            updated = True

    if updated:
        await db.commit()
        for n in nodes:
            await db.refresh(n)

    return nodes

@router.get("", response_model=Judge0NodesResponse)
async def list_connected_nodes(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """
    Returns real-time status of all connected Judge0 nodes across the college LAN.
    Pings each node in parallel to measure latency, health, and Judge0 version.
    """
    nodes = await _ensure_initial_nodes(db)

    # Sync load balancer with active nodes in DB
    active_endpoints = [n.endpoint_url for n in nodes if n.is_active]
    judge0_service.sync_endpoints(active_endpoints)

    # Ping all nodes in parallel with a 2-second timeout
    ping_tasks = [judge0_service.ping_single_node(n.endpoint_url, timeout=2.0) for n in nodes]
    ping_results = await asyncio.gather(*ping_tasks)

    node_items = []
    total_online = 0
    total_offline = 0
    latency_sum = 0.0
    latency_count = 0

    for node, p_res in zip(nodes, ping_results):
        is_online = p_res.get("is_online", False)
        latency = p_res.get("latency_ms")
        version = p_res.get("version")
        error = p_res.get("error")

        if is_online:
            total_online += 1
            if latency is not None:
                latency_sum += latency
                latency_count += 1
        else:
            total_offline += 1

        node_items.append(
            Judge0NodeItem(
                id=node.id,
                name=node.name or "Judge0 Execution Node",
                endpoint_url=node.endpoint_url,
                is_active=node.is_active,
                is_online=is_online,
                latency_ms=latency,
                version=version,
                error=error,
                created_at=node.created_at or datetime.now(timezone.utc)
            )
        )

    avg_latency = round(latency_sum / latency_count, 1) if latency_count > 0 else None

    summary = Judge0NodesSummary(
        total_nodes=len(nodes),
        online_nodes=total_online,
        offline_nodes=total_offline,
        avg_latency_ms=avg_latency,
        local_sandbox_active=True
    )

    return Judge0NodesResponse(nodes=node_items, summary=summary)

@router.post("", response_model=Judge0NodeItem)
async def add_connected_node(
    payload: Judge0NodeCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """
    Registers a new Judge0 machine (e.g. laptop or lab desktop running Judge0 Docker container).
    """
    clean_url = normalize_node_url(payload.endpoint_url)

    # Check for duplicate
    existing = await db.execute(select(Judge0Node).where(Judge0Node.endpoint_url == clean_url))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Node with endpoint {clean_url} is already registered."
        )

    # Create record
    node = Judge0Node(
        name=payload.name.strip() if payload.name and payload.name.strip() else f"Node {clean_url.replace('http://', '').replace('https://', '')}",
        endpoint_url=clean_url,
        is_active=True
    )
    db.add(node)
    await db.commit()
    await db.refresh(node)

    # Update load balancer
    judge0_service.add_endpoint(clean_url)

    # Immediate live ping
    ping_res = await judge0_service.ping_single_node(clean_url, timeout=2.5)

    return Judge0NodeItem(
        id=node.id,
        name=node.name,
        endpoint_url=node.endpoint_url,
        is_active=node.is_active,
        is_online=ping_res.get("is_online", False),
        latency_ms=ping_res.get("latency_ms"),
        version=ping_res.get("version"),
        error=ping_res.get("error"),
        created_at=node.created_at or datetime.now(timezone.utc)
    )

@router.post("/test")
async def test_node_connection(
    payload: Judge0NodeTestRequest,
    _: dict = Depends(get_current_admin)
):
    """
    Tests connectivity to a Judge0 endpoint URL before adding it.
    """
    clean_url = normalize_node_url(payload.endpoint_url)
    ping_res = await judge0_service.ping_single_node(clean_url, timeout=3.0)
    return {
        "endpoint_url": clean_url,
        **ping_res
    }

@router.put("/{node_id}/toggle", response_model=Judge0NodeItem)
async def toggle_node_active(
    node_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """
    Toggles whether a node receives submissions without deleting it from configuration.
    """
    res = await db.execute(select(Judge0Node).where(Judge0Node.id == node_id))
    node = res.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found.")

    node.is_active = not node.is_active
    await db.commit()
    await db.refresh(node)

    # Re-sync active endpoints
    all_nodes = (await db.execute(select(Judge0Node))).scalars().all()
    active_endpoints = [n.endpoint_url for n in all_nodes if n.is_active]
    judge0_service.sync_endpoints(active_endpoints)

    ping_res = await judge0_service.ping_single_node(node.endpoint_url, timeout=2.0)

    return Judge0NodeItem(
        id=node.id,
        name=node.name,
        endpoint_url=node.endpoint_url,
        is_active=node.is_active,
        is_online=ping_res.get("is_online", False),
        latency_ms=ping_res.get("latency_ms"),
        version=ping_res.get("version"),
        error=ping_res.get("error"),
        created_at=node.created_at or datetime.now(timezone.utc)
    )

@router.delete("/{node_id}")
async def delete_connected_node(
    node_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """
    Removes a node from the cluster.
    """
    res = await db.execute(select(Judge0Node).where(Judge0Node.id == node_id))
    node = res.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found.")

    url_to_remove = node.endpoint_url
    await db.delete(node)
    await db.commit()

    judge0_service.remove_endpoint(url_to_remove)

    return {"message": f"Node {url_to_remove} disconnected successfully."}
