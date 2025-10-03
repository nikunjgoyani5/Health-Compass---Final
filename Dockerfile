# ---------- Stage 1: Builder ----------
    FROM public.ecr.aws/docker/library/node:20-slim AS builder

    WORKDIR /app
    
    # Install Python + build tools (only for build stage)
    RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip python3-venv \
        build-essential gcc g++ make \
        && apt-get clean && rm -rf /var/lib/apt/lists/*
    
    # Setup Python venv
    RUN python3 -m venv /opt/venv
    ENV PATH="/opt/venv/bin:$PATH"
    
    # Install Node.js dependencies
    COPY package*.json ./
    RUN npm install && \
        npm cache clean --force
    
    # Install Python dependencies
    COPY chatbot_py/ ./chatbot_py/
    RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
        pip install --no-cache-dir -r chatbot_py/requirements.txt && \
        find /opt/venv -type d -name "tests" -exec rm -rf {} + && \
        find /opt/venv -type d -name "_pycache_" -exec rm -rf {} +
    
    # ---------- Stage 2: Runtime ----------
    FROM public.ecr.aws/docker/library/node:20-slim AS runtime
    
    WORKDIR /app
    
    # Install Python runtime and http-server
    RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-venv python3-pip \
        && apt-get clean && rm -rf /var/lib/apt/lists/*
    
    # Copy Python venv from builder
    COPY --from=builder /opt/venv /opt/venv
    ENV PATH="/opt/venv/bin:$PATH"
    
    # Copy node_modules from builder
    COPY --from=builder /app/node_modules /app/node_modules
    
    # Copy application code
    COPY . .
    
    EXPOSE 8002
    CMD ["node", "index.js"]