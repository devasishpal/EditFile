#!/usr/bin/env bash
set -euo pipefail

echo "==> Updating system packages"
sudo apt-get update
sudo apt-get install -y curl ca-certificates gnupg lsb-release build-essential

echo "==> Installing Node.js 20.x"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "==> Installing PM2"
sudo npm install -g pm2

echo "==> Installing PDF/image dependencies"
sudo apt-get install -y ghostscript libreoffice imagemagick poppler-utils tesseract-ocr \
  python3 python3-pip python3-venv

if ! sudo apt-get install -y pdftk; then
  echo "==> pdftk not found, attempting pdftk-java"
  sudo apt-get install -y pdftk-java
fi

if ! sudo apt-get install -y pdf2htmlex; then
  echo "==> pdf2htmlEX package not found in apt. Install manually if PDF->HTML is needed."
fi

echo "==> Installing Python dependencies for remove-background (optional)"
python3 -m pip install --user --upgrade pip
python3 -m pip install --user rembg pillow onnxruntime

echo "==> Done"
