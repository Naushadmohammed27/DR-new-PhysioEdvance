require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'physioedvance'
});

// Update DB file_urls to point to the committed /images/anatomy/ path
const updates = [
  { file_fragment: 'note-1790741296158-830940', new_url: '/images/anatomy/clavicle-bony-landmarks.jpeg' },
  { file_fragment: 'note-1790741296162-598637', new_url: '/images/anatomy/bones-of-the-hand.jpeg' },
  { file_fragment: 'note-1790741296165-147258', new_url: '/images/anatomy/clavicle-movements.jpeg' },
  { file_fragment: 'note-1790741296168-132232', new_url: '/images/anatomy/clavicle-muscle-attachments.jpeg' }
];

async function run() {
  try {
    for (const u of updates) {
      const res = await pool.query(
        'UPDATE notes SET file_url = $1 WHERE file_url LIKE $2 RETURNING id, title, file_url',
        [u.new_url, '%' + u.file_fragment + '%']
      );
      if (res.rows.length > 0) {
        console.log('✅ Note', res.rows[0].id, '→', res.rows[0].file_url);
      } else {
        console.log('⚠️  No match for:', u.file_fragment, '(may already be updated)');
      }
    }
    console.log('\n✅ All file_url updates done.');
  } catch (e) {
    console.error('❌ Error:', e.message);
  } finally {
    pool.end();
  }
}

run();
