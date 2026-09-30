const { Pool } = require('pg');

const renderConn = 'postgresql://physioedvance:NqFhqOuBcrQngKlnrRwiKtvlgYfjira7@dpg-dai2re6q1p3s73as04ig-a.oregon-postgres.render.com/physioedvance_hl6r';
const localConn = {
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  database: process.env.PGDATABASE || 'physioedvance'
};

async function updateDb(name, config) {
  const pool = new Pool(typeof config === 'string' ? { connectionString: config, ssl: { rejectUnauthorized: false } } : config);
  try {
    console.log(`\n--- Updating ${name} Database ---`);
    
    // 1. Ensure Human Anatomy has a PDF study note
    const checkPdf = await pool.query("SELECT id FROM notes WHERE category_id = 1 AND file_url LIKE '%.pdf%'");
    if (checkPdf.rows.length === 0) {
      await pool.query(`
        INSERT INTO notes (category_id, title, content, file_url, year, position)
        VALUES (1, 'Human Anatomy Comprehensive Clinical Notes & Syllabus Guide', 
          'Complete reading material covering regional osteology, musculature, joint mechanics, and high-yield examination notes.', 
          '/documents/anatomy-clinical-notes.pdf', 1, 4);
      `);
      console.log('✅ Added Anatomy PDF study note to Human Anatomy (Position 4)');
    } else {
      await pool.query(`
        UPDATE notes SET file_url = '/documents/anatomy-clinical-notes.pdf',
          title = 'Human Anatomy Comprehensive Clinical Notes & Syllabus Guide'
        WHERE id = $1;
      `, [checkPdf.rows[0].id]);
      console.log('✅ Updated existing Anatomy PDF note');
    }

    // 2. Ensure Psychology & Sociology rural community notes have permanent PDF url
    await pool.query(`
      UPDATE notes SET file_url = '/documents/rural-community-physiotherapy.pdf'
      WHERE category_id = 6 AND (title ILIKE '%rural%' OR file_url LIKE '%pdf%');
    `);
    console.log('✅ Updated Psychology & Sociology PDF notes to permanent /documents/ path');

    // 3. Print current notes for Human Anatomy
    const anatomyNotes = await pool.query('SELECT id, title, file_url, position FROM notes WHERE category_id = 1 ORDER BY position, id');
    console.log(`Current Human Anatomy notes in ${name}:`);
    console.log(JSON.stringify(anatomyNotes.rows, null, 2));

  } catch (err) {
    console.error(`Error updating ${name}:`, err.message);
  } finally {
    await pool.end();
  }
}

async function run() {
  await updateDb('Local', localConn);
  await updateDb('Render', renderConn);
}

run();
