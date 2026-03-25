from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class GpuSummary:
    name: str | None
    vram_total_mb: int | None
    backend: str


def get_gpu_summary() -> dict[str, object]:
    # Prefer NVML if available (Windows/Linux). Keep this dependency optional at runtime.
    try:
        import pynvml  # type: ignore

        pynvml.nvmlInit()
        try:
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            name = pynvml.nvmlDeviceGetName(handle)
            mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
            return asdict(
                GpuSummary(
                    name=(name.decode("utf-8") if isinstance(name, (bytes, bytearray)) else str(name)),
                    vram_total_mb=int(mem.total / (1024 * 1024)),
                    backend="nvml",
                )
            )
        finally:
            pynvml.nvmlShutdown()
    except Exception:
        return asdict(GpuSummary(name=None, vram_total_mb=None, backend="unknown"))

