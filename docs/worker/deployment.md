# Deployment

This document provides comprehensive deployment guides for the worker service across different environments and platforms.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
- [Docker Deployment](#docker-deployment)
- [Docker Compose](#docker-compose)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Production Considerations](#production-considerations)
- [Scaling](#scaling)
- [Monitoring](#monitoring)

## Prerequisites

### System Requirements

#### Minimum
- **CPU**: 2 cores
- **RAM**: 2GB available
- **Disk**: 10GB available (for temporary files)
- **OS**: Linux, macOS, Windows (WSL2)

#### Recommended
- **CPU**: 4+ cores
- **RAM**: 4GB+ available
- **Disk**: 20GB+ SSD
- **OS**: Linux (Ubuntu 20.04+, Debian 11+)

### Software Requirements

#### Required
- **Node.js**: 18.0.0 or higher
- **npm**: 8.0.0 or higher (or yarn)
- **FFmpeg**: 4.0+ (for video encoding)

#### Optional
- **Docker**: 20.10+ (for containerized deployment)
- **Docker Compose**: 2.0+ (for multi-service setup)
- **Kubernetes**: 1.24+ (for orchestration)

### Dependency Installation

#### Ubuntu/Debian
```bash
# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install FFmpeg
sudo apt-get install -y ffmpeg

# Verify installations
node --version  # Should be v18.x.x or higher
npm --version   # Should be 8.x.x or higher
ffmpeg -version # Should be 4.x or higher
```

#### macOS
```bash
# Install Node.js via Homebrew
brew install node@18

# Install FFmpeg
brew install ffmpeg

# Verify installations
node --version
npm --version
ffmpeg -version
```

#### Windows (WSL2)
```bash
# Follow Ubuntu/Debian instructions in WSL2
# Or use Windows Package Manager (winget)
winget install OpenJS.NodeJS.LTS
winget install FFmpeg
```

## Local Development

### Setup

1. **Clone Repository**
```bash
git clone https://github.com/Papyszoo/Modelibr.git
cd Modelibr/src/worker-service
```

2. **Install Dependencies**
```bash
npm install
```

3. **Configure Environment**
```bash
# Copy example configuration
cp .env.example .env

# Edit configuration
nano .env  # or your preferred editor
```

4. **Verify Backend API**
```bash
# Ensure Web API is running
curl http://localhost:5009/health

# Expected response: {"status":"healthy",...}
```

5. **Start Worker**
```bash
npm start
```

### Development Mode

Run with auto-reload on file changes:

```bash
npm run dev
```

### Testing

Test API connectivity:
```bash
node test-api-service.js
```

Test health endpoints:
```bash
# Basic health
curl http://localhost:3001/health

# Detailed status
curl http://localhost:3001/status

# Readiness
curl http://localhost:3001/ready

# Metrics
curl http://localhost:3001/metrics
```

### Common Development Tasks

#### Run with Debug Logging
```bash
export LOG_LEVEL=debug
npm start
```

#### Run with Custom Port
```bash
export WORKER_PORT=3002
npm start
```

#### Run Multiple Workers
```bash
# Terminal 1
export WORKER_ID=worker-1
export WORKER_PORT=3001
npm start

# Terminal 2
export WORKER_ID=worker-2
export WORKER_PORT=3002
npm start
```

## Docker Deployment

### Build Docker Image

#### Using Dockerfile
```bash
cd src/worker-service

# Build image
docker build -t modelibr-thumbnail-worker:latest .

# View image
docker images | grep modelibr-thumbnail-worker
```

#### Build Arguments
```bash
# Specify Node version
docker build --build-arg NODE_VERSION=18-alpine \
  -t modelibr-thumbnail-worker:latest .
```

### Run Docker Container

#### Basic Run
```bash
docker run -d \
  --name thumbnail-worker \
  -p 3001:3001 \
  -e API_BASE_URL=http://host.docker.internal:5009 \
  modelibr-thumbnail-worker:latest
```

#### With Environment File
```bash
docker run -d \
  --name thumbnail-worker \
  -p 3001:3001 \
  --env-file .env \
  modelibr-thumbnail-worker:latest
```

#### With Volume Mounts (for debugging)
```bash
docker run -d \
  --name thumbnail-worker \
  -p 3001:3001 \
  -e API_BASE_URL=http://host.docker.internal:5009 \
  -e CLEANUP_TEMP_FILES=false \
  -v $(pwd)/temp:/tmp/modelibr-worker \
  modelibr-thumbnail-worker:latest
```

### Docker Networking

#### Connect to Backend Network
```bash
# Create network
docker network create modelibr-network

# Run backend
docker run -d \
  --name modelibr-api \
  --network modelibr-network \
  -p 5009:8080 \
  modelibr-api:latest

# Run worker
docker run -d \
  --name thumbnail-worker \
  --network modelibr-network \
  -p 3001:3001 \
  -e API_BASE_URL=http://modelibr-api:8080 \
  modelibr-thumbnail-worker:latest
```

### Docker Health Checks

The Dockerfile includes a built-in health check:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1
```

View health status:
```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

Healthy output:
```
NAMES              STATUS
thumbnail-worker   Up 5 minutes (healthy)
```

## Docker Compose

### Basic Setup

**docker-compose.yml**:
```yaml
version: '3.8'

services:
  # Web API (Backend)
  webapi:
    image: modelibr-api:latest
    ports:
      - "5009:8080"
    environment:
      - ASPNETCORE_ENVIRONMENT=Development
      - UPLOAD_STORAGE_PATH=/var/lib/modelibr/uploads
    volumes:
      - api-uploads:/var/lib/modelibr/uploads
    networks:
      - modelibr-network

  # Thumbnail Worker
  thumbnail-worker:
    image: modelibr-thumbnail-worker:latest
    ports:
      - "3001:3001"
    environment:
      - WORKER_ID=worker-001
      - API_BASE_URL=http://webapi:8080
      - MAX_CONCURRENT_JOBS=3
      - LOG_LEVEL=info
      - LOG_FORMAT=json
      - THUMBNAIL_STORAGE_ENABLED=true
      - THUMBNAIL_STORAGE_PATH=/tmp/thumbnails
    networks:
      - modelibr-network
    depends_on:
      webapi:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  modelibr-network:
    driver: bridge

volumes:
  api-uploads:
```

### Start Services
```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f thumbnail-worker

# Check status
docker compose ps
```

### Scaling Workers
```bash
# Scale to 3 workers
docker compose up -d --scale thumbnail-worker=3

# Verify
docker compose ps
```

### Production Compose

**docker-compose.prod.yml**:
```yaml
version: '3.8'

services:
  webapi:
    image: modelibr-api:${VERSION:-latest}
    restart: unless-stopped
    environment:
      - ASPNETCORE_ENVIRONMENT=Production
      - UPLOAD_STORAGE_PATH=/var/lib/modelibr/uploads
    volumes:
      - api-uploads:/var/lib/modelibr/uploads
    networks:
      - modelibr-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  thumbnail-worker:
    image: modelibr-thumbnail-worker:${VERSION:-latest}
    restart: unless-stopped
    environment:
      - WORKER_ID=${HOSTNAME}-worker
      - API_BASE_URL=http://webapi:8080
      - MAX_CONCURRENT_JOBS=${MAX_CONCURRENT_JOBS:-5}
      - LOG_LEVEL=${LOG_LEVEL:-warn}
      - LOG_FORMAT=json
      - THUMBNAIL_STORAGE_ENABLED=true
      - RENDER_WIDTH=512
      - RENDER_HEIGHT=512
      - WEBP_QUALITY=85
      - JPEG_QUALITY=90
    networks:
      - modelibr-network
    depends_on:
      webapi:
        condition: service_healthy
    deploy:
      replicas: ${WORKER_REPLICAS:-3}
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

networks:
  modelibr-network:
    driver: bridge

volumes:
  api-uploads:
    driver: local
```

Run with:
```bash
VERSION=1.0.0 WORKER_REPLICAS=3 MAX_CONCURRENT_JOBS=5 \
  docker compose -f docker-compose.prod.yml up -d
```

## Kubernetes Deployment

### Namespace

**namespace.yaml**:
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: modelibr
```

### ConfigMap

**worker-configmap.yaml**:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: worker-config
  namespace: modelibr
data:
  API_BASE_URL: "http://webapi-service:8080"
  MAX_CONCURRENT_JOBS: "5"
  LOG_LEVEL: "info"
  LOG_FORMAT: "json"
  THUMBNAIL_STORAGE_ENABLED: "true"
  THUMBNAIL_STORAGE_PATH: "/tmp/thumbnails"
  RENDER_WIDTH: "512"
  RENDER_HEIGHT: "512"
  WEBP_QUALITY: "85"
  JPEG_QUALITY: "90"
  ORBIT_ENABLED: "true"
  ORBIT_ANGLE_STEP: "15"
  ENCODING_ENABLED: "true"
  CLEANUP_TEMP_FILES: "true"
```

### Deployment

**worker-deployment.yaml**:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: thumbnail-worker
  namespace: modelibr
  labels:
    app: thumbnail-worker
spec:
  replicas: 3
  selector:
    matchLabels:
      app: thumbnail-worker
  template:
    metadata:
      labels:
        app: thumbnail-worker
    spec:
      containers:
      - name: worker
        image: modelibr-thumbnail-worker:1.0.0
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 3001
          name: health
          protocol: TCP
        env:
        - name: WORKER_ID
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        envFrom:
        - configMapRef:
            name: worker-config
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 30
          timeoutSeconds: 10
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /ready
            port: 3001
          initialDelaySeconds: 10
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        volumeMounts:
        - name: tmp
          mountPath: /tmp
      volumes:
      - name: tmp
        emptyDir:
          sizeLimit: 5Gi
```

### Service (for metrics)

**worker-service.yaml**:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: thumbnail-worker-metrics
  namespace: modelibr
  labels:
    app: thumbnail-worker
spec:
  selector:
    app: thumbnail-worker
  ports:
  - name: metrics
    port: 3001
    targetPort: 3001
    protocol: TCP
  type: ClusterIP
```

### HorizontalPodAutoscaler

**worker-hpa.yaml**:
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: thumbnail-worker-hpa
  namespace: modelibr
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: thumbnail-worker
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Pods
        value: 1
        periodSeconds: 120
```

### Deploy to Kubernetes
```bash
# Create namespace
kubectl apply -f namespace.yaml

# Create ConfigMap
kubectl apply -f worker-configmap.yaml

# Deploy worker
kubectl apply -f worker-deployment.yaml

# Create service
kubectl apply -f worker-service.yaml

# Create HPA
kubectl apply -f worker-hpa.yaml

# Verify deployment
kubectl get pods -n modelibr
kubectl get svc -n modelibr
kubectl get hpa -n modelibr
```

### View Logs
```bash
# All workers
kubectl logs -n modelibr -l app=thumbnail-worker -f

# Specific pod
kubectl logs -n modelibr thumbnail-worker-abc123-xyz789 -f
```

## Production Considerations

### Security

#### Container Security
- Run as non-root user
- Use read-only root filesystem
- Drop unnecessary capabilities
- Scan images for vulnerabilities

**Dockerfile additions**:
```dockerfile
# Create non-root user
RUN addgroup -g 1001 worker && \
    adduser -D -u 1001 -G worker worker

# Switch to non-root user
USER worker

# Read-only filesystem
# Mount /tmp as writable volume
```

**Kubernetes SecurityContext**:
```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1001
  runAsGroup: 1001
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop:
    - ALL
```

#### Network Security
- Use TLS for API communication
- Enable certificate validation
- Use network policies in Kubernetes

**NetworkPolicy** (Kubernetes):
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: thumbnail-worker-policy
  namespace: modelibr
spec:
  podSelector:
    matchLabels:
      app: thumbnail-worker
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: prometheus
    ports:
    - protocol: TCP
      port: 3001
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: webapi
    ports:
    - protocol: TCP
      port: 8080
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 53  # DNS
```

### Performance

#### Resource Tuning
- Set appropriate CPU/memory limits
- Monitor resource usage
- Adjust MAX_CONCURRENT_JOBS based on resources

**Resource Guidelines**:
| Concurrent Jobs | CPU | Memory |
|----------------|-----|--------|
| 1-2 | 1 core | 1GB |
| 3-5 | 2 cores | 2GB |
| 6-10 | 4 cores | 4GB |

#### Rendering Optimization
- Use appropriate render dimensions
- Balance quality vs. performance
- Monitor rendering times

**Configuration for Performance**:
```bash
# Fast processing (lower quality)
RENDER_WIDTH=256
RENDER_HEIGHT=256
ORBIT_ANGLE_STEP=30  # 12 frames
WEBP_QUALITY=65
JPEG_QUALITY=75

# Balanced (recommended)
RENDER_WIDTH=512
RENDER_HEIGHT=512
ORBIT_ANGLE_STEP=15  # 24 frames
WEBP_QUALITY=75
JPEG_QUALITY=85

# High quality (slower)
RENDER_WIDTH=1024
RENDER_HEIGHT=1024
ORBIT_ANGLE_STEP=5   # 72 frames
WEBP_QUALITY=90
JPEG_QUALITY=95
```

### Reliability

#### Graceful Shutdown
Worker handles SIGTERM gracefully:
- Stops accepting new jobs
- Waits for active jobs (30s timeout)
- Cleans up resources
- Exits cleanly

**Kubernetes terminationGracePeriodSeconds**:
```yaml
spec:
  terminationGracePeriodSeconds: 60  # Allow time for jobs
```

#### Health Checks
- Liveness: Restarts unhealthy pods
- Readiness: Removes from load balancing when not ready
- Startup: Allows time for initialization

#### Error Recovery
- Automatic reconnection to SignalR
- Job retry on failure (backend handles)
- Exponential backoff for transient errors

### Observability

#### Logging
- Use structured logging (JSON)
- Send to centralized logging (ELK, Splunk)
- Include correlation IDs

**Fluentd Configuration** (example):
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluentd-config
data:
  fluent.conf: |
    <source>
      @type tail
      path /var/log/containers/thumbnail-worker*.log
      pos_file /var/log/fluentd-worker.pos
      tag modelibr.worker
      format json
    </source>
    
    <match modelibr.worker>
      @type elasticsearch
      host elasticsearch.logging.svc
      port 9200
      index_name modelibr-worker
      type_name _doc
    </match>
```

#### Metrics
- Expose Prometheus metrics
- Monitor job processing rate
- Track error rates

**Prometheus ServiceMonitor**:
```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: thumbnail-worker
  namespace: modelibr
spec:
  selector:
    matchLabels:
      app: thumbnail-worker
  endpoints:
  - port: metrics
    path: /metrics
    interval: 30s
```

#### Tracing
- Implement distributed tracing
- Track job lifecycle
- Identify bottlenecks

## Scaling

### Horizontal Scaling

#### Docker Compose
```bash
# Scale to 5 workers
docker compose up -d --scale thumbnail-worker=5
```

#### Kubernetes
```bash
# Manual scaling
kubectl scale deployment thumbnail-worker -n modelibr --replicas=5

# Auto-scaling (HPA)
kubectl autoscale deployment thumbnail-worker -n modelibr \
  --min=2 --max=10 --cpu-percent=70
```

### Vertical Scaling

Increase resources per worker:
```yaml
resources:
  limits:
    memory: "4Gi"  # Increased from 2Gi
    cpu: "4000m"   # Increased from 2000m
```

Increase concurrent jobs:
```bash
MAX_CONCURRENT_JOBS=10  # Increased from 5
```

### Scaling Considerations

- **Job Queue Depth**: Monitor queue size, scale up if growing
- **Processing Time**: Track average job duration
- **Resource Utilization**: Keep CPU/memory below 80%
- **API Load**: Ensure backend can handle worker requests

## Monitoring

### Health Endpoint Monitoring

```bash
# Prometheus scrape config
scrape_configs:
  - job_name: 'thumbnail-worker'
    static_configs:
      - targets: ['worker1:3001', 'worker2:3001']
    metrics_path: '/metrics'
```

### Key Metrics to Monitor

- `worker_uptime_seconds` - Worker uptime
- `worker_active_jobs` - Active jobs count
- `worker_max_concurrent_jobs` - Concurrency limit
- `worker_is_shutting_down` - Shutdown status

### Alerting Rules

```yaml
groups:
- name: thumbnail_worker
  rules:
  - alert: WorkerDown
    expr: up{job="thumbnail-worker"} == 0
    for: 2m
    annotations:
      summary: "Worker {{ $labels.instance }} is down"
      
  - alert: HighJobQueueDepth
    expr: thumbnail_job_queue_depth > 100
    for: 5m
    annotations:
      summary: "Job queue depth is high: {{ $value }}"
      
  - alert: HighMemoryUsage
    expr: container_memory_usage_bytes{pod=~"thumbnail-worker.*"} / container_spec_memory_limit_bytes > 0.9
    for: 5m
    annotations:
      summary: "Worker {{ $labels.pod }} memory usage > 90%"
```

### Dashboard (Grafana)

Key panels:
- Worker health status
- Active jobs count
- Job processing rate
- Average job duration
- Error rate
- Memory/CPU usage
- Queue depth

## Backup and Recovery

### Stateless Service
- No persistent data in worker
- Temporary files only
- Can be redeployed without data loss

### Disaster Recovery
1. Redeploy worker instances
2. Workers auto-reconnect to API
3. Jobs continue from queue
4. No manual recovery needed

### Data Protection
- Backend handles thumbnail storage
- Workers are ephemeral
- No backup needed for workers

## Upgrade Strategy

### Rolling Update (Kubernetes)
```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
```

### Blue-Green Deployment
1. Deploy new version (green)
2. Verify health
3. Switch traffic
4. Terminate old version (blue)

### Canary Deployment
1. Deploy 1 new worker
2. Monitor for errors
3. Gradually increase replicas
4. Full rollout when stable

## Troubleshooting

See [Troubleshooting Guide](troubleshooting.md) for detailed debugging steps.
