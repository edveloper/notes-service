const express = require('express');
const app = express();
app.use(express.json());

// Placeholder auth: attaches a fake user for the demo. Real auth is out of scope.
app.use((req, res, next) => {
  req.user = { id: 1, email: 'demo@example.com' };
  next();
});

app.get('/health', (req, res) => res.json({ ok: true }));

module.exports = app;
