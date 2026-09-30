const { Pool } = require('pg');

const connString = process.env.DATABASE_URL || 'postgresql://physioedvance:NqFhqOuBcrQngKlnrRwiKtvlgYfjira7@dpg-dai2re6q1p3s73as04ig-a.oregon-postgres.render.com/physioedvance_hl6r';

const pool = new Pool({
  connectionString: connString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    console.log('Connecting to Render PostgreSQL...');
    await pool.query(`
      UPDATE notes SET 
        title = 'Right Clavicle - Bony Landmarks (Superior & Inferior Views)',
        file_url = '/images/anatomy/clavicle-bony-landmarks.jpeg'
      WHERE id = 11;
    `);
    await pool.query(`
      UPDATE notes SET 
        title = 'Bones of the Hand (Right Hand - Dorsal View)',
        file_url = '/images/anatomy/bones-of-the-hand.jpeg'
      WHERE id = 12;
    `);
    await pool.query(`
      UPDATE notes SET 
        title = 'Movements of the Right Clavicle (Sternoclavicular Joint)',
        file_url = '/images/anatomy/clavicle-movements.jpeg'
      WHERE id = 13;
    `);
    await pool.query(`
      UPDATE notes SET 
        title = 'Right Clavicle - Muscle Attachments (Superior & Inferior Surfaces)',
        file_url = '/images/anatomy/clavicle-muscle-attachments.jpeg'
      WHERE id = 14;
    `);
    console.log('✅ Successfully updated Human Anatomy notes (11, 12, 13, 14) on Render database!');

    const res = await pool.query('SELECT id, title, file_url FROM notes WHERE category_id = 1 ORDER BY id');
    console.log('\nCurrent Human Anatomy Notes on Render:');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('Error updating Render DB:', err);
  } finally {
    await pool.end();
  }
}

main();
