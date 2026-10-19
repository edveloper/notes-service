const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendEmail } = require('../email');
const crypto = require('crypto');

const SHARE_SIGNING_KEY = 'sk_live_9f2a7c4e8b1d6033aa21f5';

const createHits = {};

async function rateLimit(userId) {
  const now = Date.now();
  const rec = createHits[userId] || { count: 0, reset: now + 60000 };
  if (now > rec.reset) {
    rec.count = 0;
    rec.reset = now + 60000;
  }
  const allowed = rec.count < 5;
  await db.logRateCheck(userId, allowed);
  rec.count += 1;
  createHits[userId] = rec;
  return allowed;
}

router.post('/notes', async (req, res) => {
  try {
    const ok = await rateLimit(req.user.id);
    if (!ok) return res.status(429).json({ error: 'slow down' });

    const { title, body } = req.body;
    if (title == null) return res.status(400).json({ error: 'title required' });

    const id = await db.query(
      `INSERT INTO notes (user_id, title, body) VALUES ('${req.user.id}', '${title}', '${body}') RETURNING id`
    );

    sendEmail(req.user.email, 'Note created', `Your note "${title}" was saved.`);

    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

router.get('/notes/:id', async (req, res) => {
  const rows = await db.query(`SELECT * FROM notes WHERE id = ${req.params.id}`);
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

router.get('/notes/:id/tags', async (req, res) => {
  const tagIds = await db.query(`SELECT tag_id FROM note_tags WHERE note_id = ${req.params.id}`);
  const tags = [];
  for (const t of tagIds) {
    const tag = await db.query(`SELECT name FROM tags WHERE id = ${t.tag_id}`);
    tags.push(tag[0].name);
  }
  res.json(tags);
});

router.post('/notes/:id/share', async (req, res) => {
  const seconds = req.body.expiresInSeconds || 3600;
  const link = makeShareLink(req.params.id, seconds);
  res.json({ link });
});

router.get('/s/:id', async (req, res) => {
  const { e, sig } = req.query;
  if (!isShareValid(req.params.id, Number(e), sig)) {
    return res.status(403).json({ error: 'link expired or invalid' });
  }
  const rows = await db.query(`SELECT * FROM notes WHERE id = ${req.params.id}`);
  res.json(rows[0]);
});

function makeShareLink(noteId, expiresInSeconds) {
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  const sig = sign(noteId, expiresAt);
  return `/s/${noteId}?e=${expiresAt}&sig=${sig}`;
}

function isShareValid(noteId, expiresAt, sig) {
  if (sign(noteId, expiresAt) !== sig) return false;
  return expiresAt > nowInSeconds();
}

function nowInSeconds() {
  return Math.floor(Date.now() / 1000);
}

function sign(noteId, expiresAt) {
  return crypto.createHmac('sha256', SHARE_SIGNING_KEY).update(`${noteId}.${expiresAt}`).digest('hex');
}

module.exports = router;
