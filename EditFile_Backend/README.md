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
- **Backend Hosting**: Oracle Cloud VM / any Linux VPS
- **Frontend Hosting**: Vercel
- **Edge / DNS**: Cloudflare
- **PDF Processing**: pdf-lib
- **Image Processing**: sharp
- **OCR**: tesseract.js
- **PDF to Excel Tables**: Python Camelot

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
PORT=5000
FRONTEND_URL=http://localhost:5173
BACKEND_PUBLIC_URL=http://localhost:5000
```

### 3) Start the backend

```bash
npm install
npm run dev
```

### PDF to Excel dependencies

The PDF-to-Excel tool uses Python + Camelot in addition to the Node.js backend.

Install the Python packages with:

```bash
python -m pip install -r requirements-pdf-to-excel.txt
```

For best lattice-table detection, install Ghostscript on the host machine as well. The converter also has a `stream` fallback for PDFs where lattice detection is not available.

When `LOCAL_MODE=true`, you do **not** need to run `npm run worker`.

## Recommended Production Stack

- **Frontend**: Vercel
- **Backend API**: Oracle Cloud VM
- **Background Worker**: Oracle Cloud VM
- **Database**: CockroachDB
- **Queue**: Redis (Upstash recommended)
- **Object Storage**: Cloudflare R2
- **DNS / SSL / CDN**: Cloudflare

This backend should run on a VM or container host, not on Vercel Functions. File conversion jobs are long-running and rely on native binaries such as LibreOffice, Ghostscript, ImageMagick, and Python-based tooling.

### 1. Prerequisites

- Oracle Cloud Ubuntu/Debian VM with SSH access
- Node.js 20+
- CockroachDB database
- Redis instance for BullMQ
- Cloudflare R2 bucket and API credentials
- Cloudflare-managed DNS for your API domain (recommended)
- Process manager such as `pm2` or `systemd`
- Host packages for full tool coverage:
  - LibreOffice
  - Ghostscript
  - ImageMagick
  - Python 3 + pip
  - Tesseract OCR + Poppler utilities for OCR-heavy workflows

### 2. Create External Services

1. **CockroachDB**
   - Create a CockroachDB cluster or serverless database.
   - Copy the PostgreSQL connection string for `DATABASE_URL`.

2. **Redis**
   - Create a Redis instance.
   - Upstash works well for a simple managed setup.
   - Copy the host, port, password, and TLS requirements.

3. **Cloudflare R2**
   - Create an R2 bucket.
   - Generate an access key and secret key.
   - Keep the account endpoint for `S3_ENDPOINT`.

4. **Vercel**
   - Deploy the frontend on Vercel.
   - Point the frontend API base URL to your backend domain on Oracle Cloud.

### 3. Prepare the Oracle Cloud Server

Example for Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y curl git build-essential python3 python3-pip \
  ghostscript imagemagick libreoffice tesseract-ocr poppler-utils

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

Install Python dependencies used by optional tools:

```bash
python3 -m pip install -r requirements-pdf-to-excel.txt
python3 -m pip install rembg pillow onnxruntime
```

### 4. Configure Backend Environment Variables

Create `.env` from `.env.example` and set production values:

```env
LOCAL_MODE=false
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://your-app.vercel.app,https://yourdomain.com
BACKEND_PUBLIC_URL=https://api.yourdomain.com

# CockroachDB
DATABASE_URL=postgresql://username:password@host:26257/defaultdb?sslmode=require

# Redis
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_TLS=true

# Cloudflare R2
S3_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET_NAME=editfile-uploads
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_FORCE_PATH_STYLE=true

# Worker
WORKER_CONCURRENCY=5
```

Important:

- Set `LOCAL_MODE=false` in production.
- When `LOCAL_MODE=false`, this project expects all three remote services: `DATABASE_URL`, Redis, and S3-compatible storage.
- Add every Vercel/custom frontend domain you use to `FRONTEND_URL`, separated by commas.

### 5. Deploy the Backend on Oracle Cloud

```bash
git clone <repo-url>
cd EditFile_Backend
npm install

python3 -m pip install -r requirements-pdf-to-excel.txt
python3 -m pip install rembg pillow onnxruntime

pm2 start npm --name editfile-api -- start
pm2 start npm --name editfile-worker -- run worker
pm2 save
```

Useful PM2 commands:

```bash
pm2 status
pm2 logs editfile-api
pm2 logs editfile-worker
pm2 restart editfile-api
pm2 restart editfile-worker
```

### 6. Connect the Frontend on Vercel

Set the frontend environment variable on Vercel:

```env
VITE_API_BASE_URL=https://api.yourdomain.com
```

### 7. Put Cloudflare in Front of the API

- Create a DNS record such as `api.yourdomain.com` pointing to the Oracle VM public IP.
- Enable SSL/TLS in Cloudflare and terminate HTTPS at your reverse proxy or server.
- Make sure your reverse proxy and firewall allow the upload sizes required by this app.

### 8. Verify the Deployment

```bash
curl https://api.yourdomain.com/health
```

Then test one upload flow from the deployed frontend and confirm:

- the API accepts uploads
- jobs move from `pending` to `completed`
- download URLs return the processed file

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `LOCAL_MODE` | Enables in-memory DB/queue/storage mode | No (`false` for production) |
| `NODE_ENV` | Environment (development/production) | Yes |
| `PORT` | Server port | No (default: 5000) |
| `FRONTEND_URL` | Frontend URL for CORS | Yes |
| `BACKEND_PUBLIC_URL` | Public backend URL used for generated local download links | Recommended |
| `DATABASE_URL` | CockroachDB connection string | Yes when `LOCAL_MODE=false` |
| `REDIS_HOST` | Redis host | Yes when `LOCAL_MODE=false` |
| `REDIS_PORT` | Redis port | No (default: 6379) |
| `REDIS_PASSWORD` | Redis password | No |
| `REDIS_TLS` | Use TLS for Redis | No |
| `S3_ENDPOINT` | S3 endpoint URL | Yes when `LOCAL_MODE=false` |
| `S3_REGION` | S3 region (`auto` for R2) | No |
| `S3_BUCKET_NAME` | S3 bucket name | Yes when `LOCAL_MODE=false` |
| `S3_ACCESS_KEY_ID` | S3 access key | Yes when `LOCAL_MODE=false` |
| `S3_SECRET_ACCESS_KEY` | S3 secret key | Yes when `LOCAL_MODE=false` |
| `S3_FORCE_PATH_STYLE` | Force path-style URLs | No |
| `PYTHON_EXECUTABLE` | Explicit Python binary path if needed | No |
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
  "mode": "remote",
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
