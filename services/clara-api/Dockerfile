FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080
WORKDIR /app

COPY pyproject.toml ./
COPY clara_api ./clara_api
RUN python -m pip install --no-cache-dir .

CMD ["sh", "-c", "uvicorn clara_api.release2:app --host 0.0.0.0 --port ${PORT}"]
