const { app } = require('@azure/functions');

require('./functions/storageQueueTrigger1');

app.setup({
    enableHttpStream: true,
});
