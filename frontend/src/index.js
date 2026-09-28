const express = require('express');

const app = express();
const port = process.env.PORT || 80;

app.get('/', (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="de">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Dart Tournament Admin</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 2rem; background: #f6f8fb; }
          .ok { color: green; font-weight: bold; }
          .error { color: red; font-weight: bold; }
          .card { border: 1px solid #d5d7db; border-radius: 12px; padding: 1.25rem; max-width: 650px; background: white; }
          .meta { margin-top: 0.75rem; color: #444; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Dart Tournament Admin</h1>
          <p>Frontend placeholder</p>
          <p id="status">Verbinde mit Backend...</p>
          <div id="details" class="meta"></div>
        </div>

        <script>
          const backendUrl = '/api/connectivity';
          const statusEl = document.getElementById('status');
          const detailsEl = document.getElementById('details');

          fetch(backendUrl)
            .then(async (response) => {
              const data = await response.json();
              if (response.ok && data.ok) {
                statusEl.textContent = 'Erfolg: ' + data.message;
                statusEl.className = 'ok';
                detailsEl.textContent = 'URL: ' + backendUrl + ' | Status: ' + response.status + ' | Zeit: ' + new Date(data.timestamp).toLocaleTimeString();
              } else {
                statusEl.textContent = 'Fehler: Verbindung zum Backend fehlgeschlagen';
                statusEl.className = 'error';
                detailsEl.textContent = 'URL: ' + backendUrl + ' | Status: ' + response.status;
              }
            })
            .catch(() => {
              statusEl.textContent = 'Fehler: Verbindung zum Backend fehlgeschlagen';
              statusEl.className = 'error';
              detailsEl.textContent = 'URL: ' + backendUrl;
            });
        </script>
      </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Frontend listening on port ${port}`);
});
