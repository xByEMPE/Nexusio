# Imagen base de Python optimizada
FROM python:3.10-slim

# Evitar archivos .pyc y asegurar logs en tiempo real
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# libgl1 y libglib2.0-0 para opencv
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglx-mesa0 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Codigo y pesos (los pesos .pth/.onnx viajan por git lfs en el repo del Space, no en el repo de NEXUS)
COPY . .

CMD ["python", "-u", "main.py"]
