FROM python:3.10-slim as builder

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

FROM python:3.10-slim

WORKDIR /app

COPY --from=builder /usr/local/lib/python3.10/site-packages/ /usr/local/lib/python3.10/site-packages/

COPY --from=builder /usr/local/bin/ /usr/local/bin/

COPY --from=builder /app/ .

EXPOSE 8008

CMD ["uvicorn", "api.index:app", "--host", "0.0.0.0", "--port", "8008"]
