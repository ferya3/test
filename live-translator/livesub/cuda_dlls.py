"""Make the CUDA libraries installed from pip visible to CTranslate2 on Windows.

faster-whisper runs on CTranslate2, which needs cuBLAS and cuDNN at runtime.
The `nvidia-cublas-cu12` / `nvidia-cudnn-cu12` wheels put their DLLs under
site-packages/nvidia/*/bin, a folder Windows does not search by itself.
"""

import os
import sys
from pathlib import Path


def register_cuda_dlls() -> None:
    if sys.platform != "win32":
        return
    try:
        import nvidia  # namespace package shipped by the nvidia-* wheels
    except ImportError:
        return
    for root in nvidia.__path__:
        for bin_dir in Path(root).glob("*/bin"):
            os.add_dll_directory(str(bin_dir))
            # CTranslate2 loads cuBLAS with LoadLibrary, which only looks at PATH.
            os.environ["PATH"] = str(bin_dir) + os.pathsep + os.environ.get("PATH", "")
