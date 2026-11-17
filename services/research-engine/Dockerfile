FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY services/research-engine/requirements.txt /app/services/research-engine/requirements.txt
RUN pip install --no-cache-dir -r /app/services/research-engine/requirements.txt

COPY services/research-engine /app/services/research-engine
COPY assets /app/assets

EXPOSE 8790
CMD ["python", "services/research-engine/server.py"]
