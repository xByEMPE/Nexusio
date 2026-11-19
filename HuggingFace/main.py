"""Worker de IA de NEXUS (Hugging Face Space): une el modelo (Faster R-CNN + U-Net ONNX) con nexus_detector.

Solo este archivo importa torch/onnxruntime/cv2; la lógica de negocio (manifiesto, medidas, cliente, ciclo)
está en nexus_detector/ y se prueba sin torch (carpeta tests/). El modelo no se modifica: mismo tiling de 2048 px,
filtro geométrico por la máscara de la pala y NMS.
"""
import io
import logging
import os
import shutil
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread

import cv2
import numpy as np
import onnxruntime as ort
import torch
import torchvision
import torchvision.transforms as T
from PIL import Image, ImageOps
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor

from nexus_detector.client import NexusClient
from nexus_detector.config import load_config
from nexus_detector.worker import serve

# Tope explicito contra bombas de descompresion (una foto de 100 MP son ~300 MB en RGB)
Image.MAX_IMAGE_PIXELS = 150_000_000

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
# Las URLs de las peticiones (con rutas de Storage) no deben llegar a los logs
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

HERE = os.path.dirname(os.path.abspath(__file__))

# Categoría 1-5 del modelo = severidad del daño en NEXUS
label_map = {"Categoria 1": 1, "Categoria 2": 2, "Categoria 3": 3, "Categoria 4": 4, "Categoria 5": 5}
num_classes = len(label_map) + 1


# --- SEGMENTACION ONNX DE LA PALA ---
class BladeUNetONNX:
    def __init__(self, onnx_path: str, img_size: int = 512):
        self.session = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name
        self.img_size = img_size
        self.mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        self.std = np.array([0.229, 0.224, 0.225], dtype=np.float32)

    def predict_mask(self, img_rgb_np: np.ndarray, threshold: float = 0.5) -> np.ndarray:
        h_orig, w_orig = img_rgb_np.shape[:2]
        img = cv2.resize(img_rgb_np, (self.img_size, self.img_size))
        img = img.astype(np.float32) / 255.0
        img = (img - self.mean) / self.std
        img = np.transpose(img, (2, 0, 1))
        img = np.expand_dims(img, 0)
        logits = self.session.run([self.output_name], {self.input_name: img})[0]
        probs = 1 / (1 + np.exp(-logits))
        mask_small = (probs[0, 0] > threshold).astype("uint8") * 255
        return cv2.resize(mask_small, (w_orig, h_orig), interpolation=cv2.INTER_NEAREST)


# --- MODELO DE DETECCION ---
def get_model(n_classes):
    backbone_path = os.path.join(HERE, "resnet50-0676ba61.pth")
    if os.path.exists(backbone_path):
        cache_dir = "/root/.cache/torch/hub/checkpoints/"
        os.makedirs(cache_dir, exist_ok=True)
        shutil.copy(backbone_path, os.path.join(cache_dir, "resnet50-0676ba61.pth"))

    model = torchvision.models.detection.fasterrcnn_resnet50_fpn(weights=None)
    base_weights_path = os.path.join(HERE, "fasterrcnn_resnet50_fpn_coco-258fb6c6.pth")
    if os.path.exists(base_weights_path):
        model.load_state_dict(torch.load(base_weights_path, map_location="cpu"))

    in_features = model.roi_heads.box_predictor.cls_score.in_features
    model.roi_heads.box_predictor = FastRCNNPredictor(in_features, n_classes)
    return model


# --- PIPELINE DE ALTA RESOLUCION (TILING + FILTRO GEOMETRICO) ---
def run_dual_inference(model, seg_model, device, image_bytes, patch_size=2048, overlap=200, threshold_det=0.4, batch_size=12):
    # La orientacion EXIF se aplica aqui: ancho y alto deben coincidir con la captura guardada
    img_pil = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes))).convert("RGB")
    img_np = np.array(img_pil)
    width, height = img_pil.size

    # 1. Mascara y filtrado para quedarse solo con la pala principal
    mask = seg_model.predict_mask(img_np)
    num_labels, comp_labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if num_labels > 2:
        largest_label = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
        clean_mask = np.zeros_like(mask)
        clean_mask[comp_labels == largest_label] = 255
        mask = clean_mask

    # 2. Tiling sobre la imagen ORIGINAL (para no confundir a la IA con bordes negros)
    transform = T.ToTensor()
    raw_detections = []
    metadata = []
    for y in range(0, height, patch_size - overlap):
        for x in range(0, width, patch_size - overlap):
            left = x if x + patch_size <= width else width - patch_size
            top = y if y + patch_size <= height else height - patch_size
            metadata.append((left, top))

    # 3. Inferencia por lotes (los parches de cada lote se generan al vuelo: misma entrada, menos RAM)
    for i in range(0, len(metadata), batch_size):
        batch_meta = metadata[i:i + batch_size]
        batch_tensor = torch.stack([
            transform(img_pil.crop((l, t, l + patch_size, t + patch_size))) for l, t in batch_meta
        ]).to(device)
        with torch.inference_mode():
            predictions = model(batch_tensor)

        for idx, pred in enumerate(predictions):
            left, top = batch_meta[idx]
            boxes = pred["boxes"].cpu().numpy()
            scores = pred["scores"].cpu().numpy()
            pred_labels = pred["labels"].cpu().numpy()

            keep_conf = scores > threshold_det
            for box, score, label in zip(boxes[keep_conf], scores[keep_conf], pred_labels[keep_conf]):
                x1, y1, x2, y2 = float(box[0] + left), float(box[1] + top), float(box[2] + left), float(box[3] + top)
                # Filtro geometrico: el centro del dano debe caer sobre la pala
                cx, cy = max(0, min(width - 1, int((x1 + x2) / 2))), max(0, min(height - 1, int((y1 + y2) / 2)))
                if mask[cy, cx] > 128:
                    raw_detections.append({"box": [x1, y1, x2, y2], "score": float(score), "label": int(label)})

    if not raw_detections:
        return [], width, height
    b = torch.tensor([d["box"] for d in raw_detections], dtype=torch.float)
    s = torch.tensor([d["score"] for d in raw_detections], dtype=torch.float)
    keep = torchvision.ops.nms(b, s, 0.3)
    return [raw_detections[i] for i in keep], width, height


# --- SERVIDOR DE SALUD (el Space gratuito lo necesita en 7860) ---
class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"AI Worker Active")

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    Thread(target=lambda: HTTPServer(("0.0.0.0", 7860), HealthHandler).serve_forever(), daemon=True).start()

    cfg = load_config()
    logging.info("Configuracion: %r", cfg)

    device = torch.device("cpu")
    model = get_model(num_classes)
    model.load_state_dict(torch.load(os.path.join(HERE, "fasterrcnn_wind_turbine_damage.pth"), map_location=device))
    model.to(device).eval()
    seg_model = BladeUNetONNX(os.path.join(HERE, "blade_unet_512.onnx"))

    def detector(image_bytes):
        return run_dual_inference(model, seg_model, device, image_bytes)

    client = NexusClient(cfg)
    client.sign_in()
    logging.info("--- Pipeline NEXUS iniciado ---")
    serve(client, detector, cfg)
