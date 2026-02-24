const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scores (
      id SERIAL PRIMARY KEY,
      name VARCHAR(30) NOT NULL UNIQUE,
      best_score INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('Database ready');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// GET /api/leaderboard — all personal bests, sorted
app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT name, best_score FROM scores ORDER BY best_score DESC LIMIT 100'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Leaderboard error:', err.message);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// POST /api/scores — submit score (only updates if it beats existing best)
app.post('/api/scores', async (req, res) => {
  const { name, score } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Invalid name' });
  }
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 99999) {
    return res.status(400).json({ error: 'Invalid score' });
  }

  const cleanName = name.trim().slice(0, 30);

  try {
    const result = await pool.query(
      `INSERT INTO scores (name, best_score, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (name)
       DO UPDATE SET
         best_score = GREATEST(scores.best_score, $2),
         updated_at = CASE WHEN $2 > scores.best_score THEN NOW() ELSE scores.updated_at END
       RETURNING name, best_score`,
      [cleanName, score]
    );
    res.json({ success: true, player: result.rows[0] });
  } catch (err) {
    console.error('Score submission error:', err.message);
    res.status(500).json({ error: 'Failed to submit score' });
  }
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDB()
  .then(() => app.listen(PORT, () => console.log(`Neon Flap running on port ${PORT}`)))
  .catch(err => { console.error('DB init failed:', err.message); process.exit(1); });
