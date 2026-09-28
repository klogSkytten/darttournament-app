const express = require('express');

const app = express();
const port = process.env.PORT || 8080;

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'backend' });
});

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
