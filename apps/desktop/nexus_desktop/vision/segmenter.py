"""Segmentador de palas con U-Net en ONNX (extraído del monolito)."""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np


def find_model(search: list[Path]) -> Path | None:
    """Devuelve la primera ruta existente de la lista, o None."""
    for p in search:
        p = Path(p)
        if p.is_file():
            return p
    return None


def largest_contour(mask: np.ndarray) -> np.ndarray | None:
    """Contorno externo de mayor área de la máscara, o None si está vacía."""
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    return max(contours, key=cv2.contourArea)


def bounding_box(mask: np.ndarray) -> tuple[int, int, int, int]:
    """Caja (x, y, ancho, alto) del contorno externo más grande.

    Ignora manchas pequeñas de falsos positivos. Si la máscara está vacía
    devuelve (0, 0, 0, 0); quien llame (p. ej. el cosedor) debe comprobarlo.
    """
    contour = largest_contour(mask)
    if contour is None:
        return 0, 0, 0, 0
    x, y, w, h = cv2.boundingRect(contour)
    return int(x), int(y), int(w), int(h)


class BladeSegmenter:
    """Segmentador de palas usando modelo ONNX."""

    def __init__(self, model_path: Path, img_size: int = 512):
        import onnxruntime as ort

        if not Path(model_path).is_file():
            raise FileNotFoundError(f"No se encontró el modelo de segmentación: {model_path}")

        available = ort.get_available_providers()
        providers = [p for p in ("CUDAExecutionProvider", "CPUExecutionProvider") if p in available]
        self.session = ort.InferenceSession(str(model_path), providers=providers)
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name
        self.img_size = img_size
        # Normalización ImageNet
        self.mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        self.std = np.array([0.229, 0.224, 0.225], dtype=np.float32)

    def predict(self, img_bgr: np.ndarray, threshold: float = 0.5) -> np.ndarray:
        """Máscara uint8 0/255 del mismo alto y ancho que la imagen."""
        h, w = img_bgr.shape[:2]
        img = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        img = cv2.resize(img, (self.img_size, self.img_size))
        img = img.astype(np.float32) / 255.0
        img = (img - self.mean) / self.std
        img = np.expand_dims(np.transpose(img, (2, 0, 1)), 0)

        logits = self.session.run([self.output_name], {self.input_name: img})[0]
        probs = 1 / (1 + np.exp(-logits))
        mask = (probs[0, 0] > threshold).astype("uint8") * 255
        return cv2.resize(mask, (w, h), interpolation=cv2.INTER_NEAREST)
