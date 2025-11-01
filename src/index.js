const { app } = require('@azure/functions');

require('./functions/storageQueueTrigger1');
require('./functions/httpTrigger');
app.setup({
    enableHttpStream: true,
});
