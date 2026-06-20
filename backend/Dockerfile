# Advisory Workbench backend — deploy image.
# Build:  docker build -t workbench-backend ./backend
# Run:    docker run -p 8000:8000 --env-file backend/.env workbench-backend
# Or point any PaaS (Render/Railway/Fly/Cloud Run) at this Dockerfile.
FROM python:3.12-slim

# Faster, cleaner Python in containers.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install deps first for layer caching.
COPY requirements.txt .
RUN pip install -r requirements.txt

# App code + seed data.
COPY . .

EXPOSE 8000

# Honour the platform's $PORT if set (Render/Railway/Cloud Run inject it), else 8000.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
