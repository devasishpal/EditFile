# Deployment Guide (Vercel + Oracle VM + Cloudflare R2)

This guide is written for non-coders. It lists every command and always shows the directory you must be in.

## What This Project Uses
- Frontend: Vite/React deployed on Vercel.
- Backend: Node/Express running on an Oracle Cloud Free Tier VM.
- File storage: Cloudflare R2 (S3-compatible).

## Folder Structure (Inside This Repo)
- `EditFile_Frontend/` for the frontend app.
- `EditFile_Backend/` for the backend API.
- `EditFile_Backend/deploy/oracle/setup.sh` installs backend dependencies on Oracle VM.
- `EditFile_Backend/deploy/oracle/start.sh` is a helper start script (optional).

## Assumptions (Edit If Different)
- Your Oracle VM is Ubuntu.
- Your repo is located at: `/home/ubuntu/EditFile`
- Your backend runs on port `5000`.

If your repo lives somewhere else, replace `/home/ubuntu/EditFile` with your real path in every command.

## Part A: Cloudflare R2 (Storage)
These steps are done in the Cloudflare website (no terminal commands).

1. Create an R2 bucket.
2. Create an R2 API token with read/write access to that bucket.
3. Note these values. You will paste them later into the backend `.env` file. R2 endpoint format: `https://<account-id>.r2.cloudflarestorage.com`

## Part B: Oracle VM Backend (Ubuntu)

### 1) Connect to the VM
From your local machine, connect with SSH (replace `YOUR_IP`):
```bash
ssh ubuntu@YOUR_IP
```

### 2) (Optional) Get the code onto the VM
If the repo is not already on the VM, you can clone it:
```bash
cd /home/ubuntu
git clone <your-repo-url> EditFile
```
If the repo already exists and you just want the latest code:
```bash
cd /home/ubuntu/EditFile
git pull
```

### 3) Run the backend setup script
This installs Node.js, PM2, and PDF/image tools. It uses `sudo` and may ask for your password.
```bash
cd /home/ubuntu/EditFile/EditFile_Backend
chmod +x deploy/oracle/setup.sh deploy/oracle/start.sh
./deploy/oracle/setup.sh
```
You can confirm Node and npm are installed:
```bash
node -v
npm -v
```

If you prefer to run the setup commands one by one (instead of the script), here they are:
```bash
sudo apt-get update
sudo apt-get install -y curl ca-certificates gnupg lsb-release build-essential

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

sudo npm install -g pm2

sudo apt-get install -y ghostscript libreoffice imagemagick poppler-utils tesseract-ocr python3 python3-pip python3-venv

sudo apt-get install -y pdftk || sudo apt-get install -y pdftk-java
sudo apt-get install -y pdf2htmlex || echo "pdf2htmlex not available, skip"

python3 -m pip install --user --upgrade pip
python3 -m pip install --user rembg pillow onnxruntime
```

### 4) Install backend dependencies (Node libraries)
This installs all backend libraries listed in `EditFile_Backend/package.json`.
```bash
cd /home/ubuntu/EditFile/EditFile_Backend
npm install
```

### 5) Install frontend dependencies (Node libraries)
Only needed if you want to run or build the frontend on this machine.
```bash
cd /home/ubuntu/EditFile/EditFile_Frontend
npm install
```

To start the frontend locally:
```bash
cd /home/ubuntu/EditFile/EditFile_Frontend
npm run dev
```

### 6) Create the backend environment file
Create and edit `.env`:
```bash
cd /home/ubuntu/EditFile/EditFile_Backend
nano .env
```
To save in nano: press `Ctrl+O`, then `Enter`, then `Ctrl+X`.

Paste this template and fill in your real values:
```bash
PORT=5000
LOCAL_MODE=false
FRONTEND_URL=http://localhost:5173,https://*.vercel.app
BACKEND_PUBLIC_URL=http://YOUR_PUBLIC_IP:5000

R2_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
R2_BUCKET_NAME=YOUR_BUCKET_NAME
R2_ACCESS_KEY=YOUR_R2_ACCESS_KEY
R2_SECRET_KEY=YOUR_R2_SECRET_KEY
R2_PUBLIC_URL=

# Optional but recommended for production:
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DBNAME
REDIS_HOST=YOUR_REDIS_HOST
REDIS_PORT=6379
REDIS_PASSWORD=YOUR_REDIS_PASSWORD
REDIS_TLS=false
MAX_FILE_SIZE_MB=100
MAX_IMAGE_SIZE_MB=50
TRUST_PROXY=1
```

If you later add HTTPS to the backend, change `BACKEND_PUBLIC_URL` to start with `https://`.

If you are using AWS S3 instead of R2, replace the R2 values with:
```bash
S3_ENDPOINT=YOUR_S3_ENDPOINT
S3_REGION=YOUR_S3_REGION
S3_BUCKET_NAME=YOUR_BUCKET_NAME
S3_ACCESS_KEY_ID=YOUR_ACCESS_KEY
S3_SECRET_ACCESS_KEY=YOUR_SECRET_KEY
```

### 7) Start the backend with PM2
```bash
cd /home/ubuntu/EditFile/EditFile_Backend
pm2 start server.js --name editfile-backend
pm2 save
pm2 startup
```

Alternative: The helper script runs the first two commands (`pm2 start` and `pm2 save`):
```bash
cd /home/ubuntu/EditFile/EditFile_Backend
./deploy/oracle/start.sh
```

Important: `pm2 startup` prints a command. Copy and run exactly what it prints.
It usually looks like this (example only):
```bash
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

### 8) Open port 5000 (VM firewall)
```bash
sudo ufw allow 5000/tcp
sudo ufw reload
```

You must also open port `5000` in the Oracle Cloud VCN security list for your VM.

### 9) Quick backend health check
```bash
cd /home/ubuntu
curl http://localhost:5000
```

Any response (even `404`) means the server is running. If it fails, check logs:
```bash
cd /home/ubuntu/EditFile/EditFile_Backend
pm2 status
pm2 logs editfile-backend
```

## Part C: Vercel Frontend Deployment
These steps are done in the Vercel website (no terminal commands).

1. Import your Git repository in Vercel.
2. Set Root Directory to `EditFile_Frontend/`.
3. Build Command should be `npm run build`.
4. Output Directory should be `dist`.
5. Add environment variables in Vercel: `VITE_API_URL` = your backend base URL (example: `http://YOUR_PUBLIC_IP:5000`). Optional: `VITE_API_BASE_URL` = legacy alias (only if your frontend expects it).

## Important HTTPS Note (Avoid Mixed Content)
Vercel is HTTPS by default. Browsers block HTTPS pages calling HTTP APIs.

You have two simple options:

Option A: Keep backend HTTP and proxy through Vercel.
This avoids mixed content but requires a Vercel rewrite rule.

Option B: Add HTTPS to your VM using a free DNS alias like `sslip.io`.
Then set:
`VITE_API_URL=https://YOUR_IP.sslip.io:5000`

If you want, I can add the exact Vercel rewrite or an HTTPS proxy setup for you.

## Future Custom Domain
When you add a domain later, update only these values:
- `VITE_API_URL` in Vercel.
- `FRONTEND_URL` and `BACKEND_PUBLIC_URL` in backend `.env`.
- `R2_PUBLIC_URL` if you use a public R2 bucket or custom R2 domain.
