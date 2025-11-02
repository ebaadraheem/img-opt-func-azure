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
      const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.QueueStorageAccount);
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blobClient = containerClient.getBlockBlobClient(blobName);

      // STEP 1: Check metadata to skip already optimized images
      const properties = await blobClient.getProperties();
      const metadata = properties.metadata || {};

      if (metadata.optimized === 'true') {
        context.log(`🚫 Skipping already optimized blob: ${blobName}`);
        return;
      }

      // STEP 2: Download blob
      const downloadResponse = await blobClient.download();
      const sourceBuffer = await streamToBuffer(downloadResponse.readableStreamBody);
      context.log(`✅ Downloaded blob (${sourceBuffer.length} bytes)`);

      // STEP 3: Optimize image using Sharp
      const optimizedBuffer = await sharp(sourceBuffer)
        .resize({ width: 1280, withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer();
      context.log(`🧠 Optimized image size: ${optimizedBuffer.length} bytes`);

      // STEP 4: Upload back to same blob (overwrite) with metadata flag
      await blobClient.uploadData(optimizedBuffer, {
        overwrite: true,
        blobHTTPHeaders: { blobContentType: 'image/jpeg' },
        metadata: { optimized: 'true' }, 
      });

      context.log(`✅ Optimized and updated blob '${blobName}' successfully with metadata.`);
    } catch (error) {
      context.log('❌ Error processing queue message:', error);
      throw error;
    }
  },
});

// Helper: Convert stream to buffer
async function streamToBuffer(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on('data', (data) => chunks.push(data instanceof Buffer ? data : Buffer.from(data)));
    readableStream.on('end', () => resolve(Buffer.concat(chunks)));
    readableStream.on('error', reject);
  });
}
