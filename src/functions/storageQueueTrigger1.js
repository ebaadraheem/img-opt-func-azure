const { app } = require('@azure/functions');
const { BlobServiceClient } = require('@azure/storage-blob');
const sharp = require('sharp');

app.storageQueue('ImageQueueTrigger', {
  queueName: process.env.QueueName || 'image-optimization-queue',
  connection: 'QueueStorageAccount',
  handler: async (queueItem, context) => {
    try {
      const event = typeof queueItem === 'string' ? JSON.parse(queueItem) : queueItem;

      const blobUrl = event?.data?.url;
      if (!blobUrl) {
        context.log('⚠️ Missing blob URL in queue message.');
        return;
      }

      // Parse container and blob name from URL
      const urlParts = new URL(blobUrl);
      const pathParts = urlParts.pathname.split('/'); // ['', 'images', 'file.png']
      const containerName = pathParts[1];
      const blobName = pathParts.slice(2).join('/');
      context.log(`📦 Container: ${containerName}`);
      context.log(`🖼️ Blob: ${blobName}`);

      // Initialize BlobServiceClient
      const blobServiceClient = BlobServiceClient.fromConnectionString(
        process.env.QueueStorageAccount
      );

      const sourceContainerClient = blobServiceClient.getContainerClient(containerName);
      const sourceBlobClient = sourceContainerClient.getBlobClient(blobName);

      // Download blob
      const downloadResponse = await sourceBlobClient.download();
      const sourceBuffer = await streamToBuffer(downloadResponse.readableStreamBody);
      context.log(`✅ Downloaded blob (${sourceBuffer.length} bytes)`);

      // Optimize image with sharp
      const optimizedBuffer = await sharp(sourceBuffer)
        .resize({ width: 1280, withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer();
      context.log(`🧠 Optimized image size: ${optimizedBuffer.length} bytes`);

      // Destination container
      const optimizedContainerName = process.env.OPTIMIZED_CONTAINER_NAME || 'optimized-images';
      const optimizedContainerClient = blobServiceClient.getContainerClient(optimizedContainerName);

      await optimizedContainerClient.createIfNotExists();

      const optimizedBlobClient = optimizedContainerClient.getBlockBlobClient(blobName);
      await optimizedBlobClient.uploadData(optimizedBuffer, {
        blobHTTPHeaders: { blobContentType: 'image/jpeg' },
      });

      context.log(`✅ Uploaded optimized image to '${optimizedContainerName}/${blobName}' successfully.`);
    } catch (error) {
      context.log('❌ Error processing queue message:', error);
      throw error;
    }
  },
});

// Helper function: stream → buffer
async function streamToBuffer(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on('data', (data) => chunks.push(data instanceof Buffer ? data : Buffer.from(data)));
    readableStream.on('end', () => resolve(Buffer.concat(chunks)));
    readableStream.on('error', reject);
  });
}
