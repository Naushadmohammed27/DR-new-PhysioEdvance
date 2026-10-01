const { Pool } = require('pg');

const connString = 'postgresql://physioedvance:NqFhqOuBcrQngKlnrRwiKtvlgYfjira7@dpg-dai2re6q1p3s73as04ig-a.oregon-postgres.render.com/physioedvance_hl6r';

const pool = new Pool({
  connectionString: connString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const res = await pool.query(`
      SELECT id, name, email, role, is_active 
      FROM users 
      WHERE role IN ('admin', 'superadmin') OR email LIKE '%admin%'
      ORDER BY id
    `);
    console.log('Current Admin Users on Render:');
    console.log(JSON.stringify(res.rows, null, 2));

    // Grant superadmin role to admin@physioadvance.com and zainuddeen.nawaz@physioedvance.com
    await pool.query(`
      UPDATE users 
      SET role = 'superadmin' 
      WHERE email IN ('admin@physioadvance.com', 'zainuddeen.nawaz@physioedvance.com', 'ink@physioadvance.com');
    `);

    console.log('\n✅ Successfully elevated admin accounts to superadmin on Render!');

    const updated = await pool.query(`
      SELECT id, name, email, role, is_active 
      FROM users 
      WHERE role IN ('admin', 'superadmin')
      ORDER BY id
    `);
    console.log('\nUpdated Admin Users on Render:');
    console.log(JSON.stringify(updated.rows, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

main();
