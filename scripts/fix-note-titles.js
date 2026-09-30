require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'physioedvance'
});

// Map file_url fragments to correct titles and keyword content
const updates = [
  {
    file_fragment: 'note-1790741296158-830940',
    title: 'Right Clavicle - Bony Landmarks (Superior & Inferior Views)',
    extra_keywords: 'clavicle bony landmarks superior inferior shaft acromial sternal facet trapezoid subclavian groove conoid costal tuberosity'
  },
  {
    file_fragment: 'note-1790741296162-598637',
    title: 'Bones of the Hand (Right Hand - Dorsal View)',
    extra_keywords: 'hand bones phalanges metacarpals carpal bones scaphoid lunate radius ulna dorsal view'
  },
  {
    file_fragment: 'note-1790741296165-147258',
    title: 'Movements of the Right Clavicle (Sternoclavicular Joint)',
    extra_keywords: 'clavicle movements elevation depression protraction retraction posterior rotation sternoclavicular joint acromion'
  },
  {
    file_fragment: 'note-1790741296168-132232',
    title: 'Right Clavicle - Muscle Attachments (Superior & Inferior Surfaces)',
    extra_keywords: 'clavicle muscle attachments deltoid pectoralis major sternocleidomastoid subclavius coracoclavicular ligament sternohyoid sternothyroid costoclavicular'
  }
];

async function run() {
  try {
    for (const u of updates) {
      const res = await pool.query(
        'UPDATE notes SET title = $1 WHERE file_url LIKE $2 RETURNING id, title',
        [u.title, '%' + u.file_fragment + '%']
      );
      if (res.rows.length > 0) {
        console.log('✅ Updated note', res.rows[0].id, '->', res.rows[0].title);
      } else {
        console.log('⚠️  No match for:', u.file_fragment);
      }
    }
    console.log('\n✅ All updates done.');
  } catch (e) {
    console.error('❌ Error:', e.message);
  } finally {
    pool.end();
  }
}

run();
