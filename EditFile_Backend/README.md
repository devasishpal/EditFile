# EditFile Backend

Production-ready file processing backend for EditFile SaaS platform. Handles PDF and image processing with queue-based architecture for scalability.

## Features

- **25+ File Processing Tools**: PDF compression, merging, splitting, conversion, OCR, and image processing
- **Queue-Based Architecture**: BullMQ with Redis for reliable job processing
- **Scalable Design**: Handle 10,000+ daily users with concurrent processing
- **Auto-Cleanup**: Files automatically deleted after 1 hour
- **Security**: Rate limiting, file validation, CORS protection
- **No Authentication Required**: Simple API for public use

## Tech Stack

- **Runtime**: Node.js 20+ (LTS)
- **Framework**: Express.js
- **Queue**: BullMQ + Redis
- **Database**: CockroachDB (PostgreSQL-compatible)
- **Storage**: S3-compatible (Cloudflare R2 / AWS S3)
- **PDF Processing**: pdf-lib
- **Image Processing**: sharp
- **OCR**: tesseract.js

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Express   │────▶│    S3       │
│  (Frontend) │     │   Server    │     │  (Storage)  │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   BullMQ    │
                    │    Queue    │
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐     ┌─────────────┐
                    │   Worker    │────▶│ CockroachDB │
                    │  (Processor)│     │  (Database) │
                    └─────────────┘     └─────────────┘
```

## Project Structure

```
src/
├── app.js                    # Main Express application
├── config/
│   ├── database.js           # CockroachDB configuration
│   ├── redis.js              # Redis configuration
│   └── s3.js                 # S3 storage configuration
├── middleware/
│   ├── error.middleware.js   # Error handling
│   └── validation.middleware.js  # Request validation
├── modules/                  # Tool modules
│   ├── compress-pdf/         # PDF compression
│   ├── merge-pdf/            # PDF merging
│   ├── split-pdf/            # PDF splitting
│   ├── pdf-to-word/          # PDF to Word conversion
│   ├── word-to-pdf/          # Word to PDF conversion
│   ├── pdf-to-jpg/           # PDF to JPG conversion
│   ├── jpg-to-pdf/           # JPG to PDF conversion
│   ├── protect-pdf/          # PDF password protection
│   ├── unlock-pdf/           # PDF password removal
│   ├── ocr-pdf/              # PDF OCR
│   ├── image-compress/       # Image compression
│   ├── image-resize/         # Image resizing
│   ├── image-convert/        # Image format conversion
│   └── job-status/           # Job status & download
├── queue/
│   ├── queue.js              # Queue definitions
│   └── worker.js             # Worker processors
├── services/
│   ├── database.service.js   # Database operations
│   └── cleanup.service.js    # File cleanup
├── utils/
│   └── logger.js             # Winston logger
└── router.js                 # Route definitions
```

## API Endpoints

### PDF Tools

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/compress-pdf` | POST | Compress PDF file |
| `/api/merge-pdf` | POST | Merge multiple PDFs |
| `/api/split-pdf` | POST | Split PDF by page range |
| `/api/pdf-to-word` | POST | Convert PDF to Word |
| `/api/word-to-pdf` | POST | Convert Word to PDF |
| `/api/pdf-to-jpg` | POST | Convert PDF to JPG images |
| `/api/jpg-to-pdf` | POST | Convert JPGs to PDF |
| `/api/protect-pdf` | POST | Add password protection |
| `/api/unlock-pdf` | POST | Remove password protection |
| `/api/ocr-pdf` | POST | Extract text from PDF |

### Image Tools

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/image-compress` | POST | Compress images |
| `/api/image-resize` | POST | Resize images |
| `/api/image-convert` | POST | Convert image formats |

### Job Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/job-status/:id` | GET | Get job status |
| `/api/download/:id` | GET | Get download URL |
| `/health` | GET | Health check |

### Response Format

All endpoints return:

```json
{
  "success": true,
  "jobId": "uuid",
  "status": "pending|processing|completed|failed",
  "message": "...",
  "originalSize": 123456,
  "outputSize": 65432,
  "reductionPercent": "47.00"
}
```

## Deployment Guide

## Localhost Quick Start (No Redis/DB/S3 Required)

This backend now supports `LOCAL_MODE`, which runs everything on localhost using:

- in-memory job storage
- in-process queue processing
- local filesystem file storage

### 1) Create environment file

```bash
cp .env.example .env
```

### 2) Keep these values in `.env`

```env
LOCAL_MODE=true
PORT=3000
FRONTEND_URL=http://localhost:5173
BACKEND_PUBLIC_URL=http://localhost:3000
```

### 3) Start the backend

```bash
npm install
npm run dev
```

When `LOCAL_MODE=true`, you do **not** need to run `npm run worker`.

### 1. Prerequisites

- Node.js 20+
- CockroachDB account
- Redis (Upstash or Railway)
- S3-compatible storage (Cloudflare R2 recommended)

### 2. Railway Deployment

#### Step 1: Create Railway Project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init
```

#### Step 2: Add Services

1. **Add CockroachDB**:
   - Go to Railway dashboard
   - Click "New" → "Database" → "Add CockroachDB"
   - Copy the connection string

2. **Add Redis**:
   - Click "New" → "Database" → "Add Redis"
   - Or use Upstash Redis for better performance

3. **Add Cloudflare R2**:
   - Create R2 bucket in Cloudflare dashboard
   - Generate API tokens

#### Step 3: Configure Environment Variables

In Railway dashboard, add these environment variables:

```
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://your-frontend-url.com

# Database
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Redis
REDIS_HOST=${{Redis.REDIS_HOST}}
REDIS_PORT=${{Redis.REDIS_PORT}}
REDIS_PASSWORD=${{Redis.REDIS_PASSWORD}}

# S3 (Cloudflare R2)
S3_ENDPOINT=https://your-account.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET_NAME=editfile-uploads
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_FORCE_PATH_STYLE=true

# Worker
WORKER_CONCURRENCY=5
```

#### Step 4: Deploy

```bash
# Deploy to Railway
railway up

# View logs
railway logs
```

### 3. Alternative: Manual Deployment

```bash
# Clone repository
git clone <repo-url>
cd EditFile_Backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your credentials
nano .env

# Start server
npm start

# Start worker (in separate terminal)
npm run worker
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | Environment (development/production) | Yes |
| `PORT` | Server port | No (default: 3000) |
| `FRONTEND_URL` | Frontend URL for CORS | Yes |
| `DATABASE_URL` | CockroachDB connection string | Yes |
| `REDIS_HOST` | Redis host | Yes |
| `REDIS_PORT` | Redis port | No (default: 6379) |
| `REDIS_PASSWORD` | Redis password | No |
| `REDIS_TLS` | Use TLS for Redis | No |
| `S3_ENDPOINT` | S3 endpoint URL | Yes |
| `S3_REGION` | S3 region | No |
| `S3_BUCKET_NAME` | S3 bucket name | Yes |
| `S3_ACCESS_KEY_ID` | S3 access key | Yes |
| `S3_SECRET_ACCESS_KEY` | S3 secret key | Yes |
| `S3_FORCE_PATH_STYLE` | Force path-style URLs | No |
| `WORKER_CONCURRENCY` | Worker concurrency | No (default: 5) |

## Database Schema

### Jobs Table

```sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  original_file_url TEXT,
  output_file_url TEXT,
  original_size BIGINT,
  output_size BIGINT,
  metadata JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP + INTERVAL '1 hour',
  ip_address INET
);
```

## Rate Limits

- **General API**: 100 requests per 15 minutes per IP
- **File Upload**: 20 uploads per 15 minutes per IP
- **Max File Size**: 100MB for PDFs, 50MB for images

## Security Features

- Rate limiting per IP address
- File type validation (MIME type checking)
- File size limits
- CORS protection
- Helmet security headers
- Random file naming
- Signed S3 URLs (1-hour expiration)
- Auto-deletion of files after 1 hour

## Monitoring

### Health Check

```bash
curl https://your-api.com/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600
}
```

### Queue Status

Check queue status in logs or implement a monitoring endpoint.

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**
   - Check Redis credentials
   - Verify Redis is running
   - Check firewall rules

2. **S3 Upload Failed**
   - Verify S3 credentials
   - Check bucket permissions
   - Ensure bucket exists

3. **Database Connection Failed**
   - Check DATABASE_URL format
   - Verify network access
   - Check SSL settings

4. **Worker Not Processing**
   - Ensure worker is running: `npm run worker`
   - Check Redis connection
   - Review worker logs

### Logs

```bash
# View application logs
npm start

# View worker logs
npm run worker

# View cleanup logs
npm run cleanup
```

## Scaling

### Horizontal Scaling

1. **Multiple Web Servers**: Deploy multiple instances behind a load balancer
2. **Multiple Workers**: Scale worker processes independently
3. **Redis Cluster**: Use Redis Cluster for high availability

### Performance Tuning

1. **Worker Concurrency**: Adjust `WORKER_CONCURRENCY` based on CPU cores
2. **Database Pool**: Adjust connection pool size in `database.js`
3. **File Size Limits**: Adjust based on your infrastructure

## License

MIT

## Support

For issues and feature requests, please open an issue on GitHub.
