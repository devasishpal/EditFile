# Frontend Integration Guide

This guide explains how to connect the EditFile frontend to this backend.

## API Base URL

Set the API base URL in your frontend:

```javascript
// .env or config file
const API_BASE_URL = 'https://your-backend-url.com';
```

## API Client Setup

```javascript
// api/client.js
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const apiClient = {
  async uploadFile(endpoint, file, options = {}) {
    const formData = new FormData();
    formData.append('file', file);
    
    // Add options
    if (options.compressionLevel) {
      formData.append('compressionLevel', options.compressionLevel);
    }
    if (options.quality) {
      formData.append('quality', options.quality);
    }
    if (options.pageRange) {
      formData.append('pageRange', options.pageRange);
    }
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }
    
    return response.json();
  },
  
  async uploadMultipleFiles(endpoint, files, options = {}) {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    
    // Add options
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, value);
      }
    });
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }
    
    return response.json();
  },
  
  async getJobStatus(jobId) {
    const response = await fetch(`${API_BASE_URL}/api/job-status/${jobId}`);
    return response.json();
  },
  
  async getDownloadUrl(jobId) {
    const response = await fetch(`${API_BASE_URL}/api/download/${jobId}`);
    return response.json();
  },
};
```

## Tool-Specific API Calls

### Compress PDF

```javascript
// Compress PDF with 80% quality
const result = await apiClient.uploadFile('/api/compress-pdf', file, {
  compressionLevel: 80,
});

// Returns:
// {
//   success: true,
//   jobId: 'uuid',
//   status: 'pending',
//   originalSize: 123456,
//   compressionLevel: 80
// }
```

### Merge PDFs

```javascript
// Merge multiple PDFs
const result = await apiClient.uploadMultipleFiles('/api/merge-pdf', files);

// Returns:
// {
//   success: true,
//   jobId: 'uuid',
//   status: 'pending',
//   fileCount: 5,
//   totalSize: 1234567
// }
```

### Split PDF

```javascript
// Split PDF by page range
const result = await apiClient.uploadFile('/api/split-pdf', file, {
  pageRange: '1-5, 8, 11-13',
});
```

### PDF to Word

```javascript
const result = await apiClient.uploadFile('/api/pdf-to-word', file, {
  format: 'docx', // or 'doc', 'rtf'
});
```

### Image Compress

```javascript
const result = await apiClient.uploadMultipleFiles('/api/image-compress', files, {
  quality: 80,
  targetSize: 500, // Target size in KB (optional)
});
```

### Image Resize

```javascript
const result = await apiClient.uploadMultipleFiles('/api/image-resize', files, {
  width: 800,
  height: 600,
  maintainAspectRatio: true,
});
```

### Image Convert

```javascript
const result = await apiClient.uploadMultipleFiles('/api/image-convert', files, {
  format: 'webp', // jpg, png, webp, gif, tiff, avif
});
```

## Polling for Job Status

```javascript
// Poll job status until complete
const pollJobStatus = async (jobId, onProgress) => {
  const poll = async () => {
    const { job } = await apiClient.getJobStatus(jobId);
    
    onProgress?.(job);
    
    if (job.status === 'completed') {
      return job;
    }
    
    if (job.status === 'failed') {
      throw new Error(job.errorMessage || 'Processing failed');
    }
    
    // Poll again in 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));
    return poll();
  };
  
  return poll();
};

// Usage
const processFile = async (file) => {
  // Upload file
  const { jobId } = await apiClient.uploadFile('/api/compress-pdf', file, {
    compressionLevel: 80,
  });
  
  // Poll for completion
  const job = await pollJobStatus(jobId, (status) => {
    console.log('Status:', status.status);
  });
  
  // Get download URL
  const { downloadUrl } = await apiClient.getDownloadUrl(jobId);
  
  // Download file
  window.location.href = downloadUrl;
};
```

## React Hook Example

```javascript
// hooks/useFileProcessor.js
import { useState, useCallback } from 'react';
import { apiClient } from '../api/client';

export const useFileProcessor = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const processFile = useCallback(async (endpoint, file, options = {}) => {
    setIsProcessing(true);
    setError(null);
    setResult(null);
    setProgress(0);

    try {
      // Upload file
      const uploadResult = await apiClient.uploadFile(endpoint, file, options);
      
      if (!uploadResult.success) {
        throw new Error(uploadResult.error);
      }

      const { jobId } = uploadResult;

      // Poll for completion
      const job = await pollJobStatus(jobId, (status) => {
        setProgress(calculateProgress(status));
      });

      // Get download URL
      const downloadResult = await apiClient.getDownloadUrl(jobId);

      setResult({
        jobId,
        downloadUrl: downloadResult.downloadUrl,
        originalSize: job.originalSize,
        outputSize: job.outputSize,
        reductionPercent: job.reductionPercent,
      });

      return downloadResult.downloadUrl;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const processMultipleFiles = useCallback(async (endpoint, files, options = {}) => {
    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const uploadResult = await apiClient.uploadMultipleFiles(endpoint, files, options);
      
      if (!uploadResult.success) {
        throw new Error(uploadResult.error);
      }

      const { jobId } = uploadResult;

      // Poll for completion
      const job = await pollJobStatus(jobId, (status) => {
        setProgress(calculateProgress(status));
      });

      const downloadResult = await apiClient.getDownloadUrl(jobId);

      setResult({
        jobId,
        downloadUrl: downloadResult.downloadUrl,
        fileCount: uploadResult.fileCount,
      });

      return downloadResult.downloadUrl;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return {
    isProcessing,
    progress,
    error,
    result,
    processFile,
    processMultipleFiles,
  };
};

// Helper functions
const pollJobStatus = async (jobId, onProgress) => {
  const poll = async () => {
    const { job } = await apiClient.getJobStatus(jobId);
    onProgress?.(job);
    
    if (job.status === 'completed') return job;
    if (job.status === 'failed') throw new Error(job.errorMessage);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    return poll();
  };
  return poll();
};

const calculateProgress = (status) => {
  const progressMap = {
    pending: 10,
    processing: 50,
    completed: 100,
    failed: 0,
  };
  return progressMap[status.status] || 0;
};
```

## Error Handling

```javascript
// Handle API errors
try {
  const result = await apiClient.uploadFile('/api/compress-pdf', file);
} catch (error) {
  if (error.message.includes('Too many requests')) {
    // Rate limit exceeded
    alert('Please wait a moment before uploading again');
  } else if (error.message.includes('File too large')) {
    // File size exceeded
    alert('File is too large. Maximum size is 100MB');
  } else if (error.message.includes('Invalid file type')) {
    // Wrong file type
    alert('Please upload a valid PDF file');
  } else {
    // Generic error
    alert('An error occurred. Please try again.');
  }
}
```

## CORS Configuration

The backend is configured to accept requests from your frontend URL. Make sure to set:

```
FRONTEND_URL=https://your-frontend-domain.com
```

In development, you can use `*` to allow all origins:

```
FRONTEND_URL=*
```

## Environment Variables for Frontend

```
# .env
VITE_API_URL=https://your-backend-url.com
```

## Testing the Integration

```bash
# Test health endpoint
curl https://your-backend-url.com/health

# Test file upload
curl -X POST \
  -F "file=@test.pdf" \
  -F "compressionLevel=80" \
  https://your-backend-url.com/api/compress-pdf

# Test job status
curl https://your-backend-url.com/api/job-status/YOUR-JOB-ID

# Test download
curl https://your-backend-url.com/api/download/YOUR-JOB-ID
```
