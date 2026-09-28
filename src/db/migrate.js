const fs = require('fs');
const path = require('path');
const db = require('./connection');

let isMigrating = false;

async function migrate() {
  if (isMigrating) return;
  isMigrating = true;
  try {
    // Wait for Postgres to be ready (handles Render free-tier cold starts)
    await db.waitForPostgres();

    // Apply the PostgreSQL schema (all CREATE TABLE IF NOT EXISTS - safe to run repeatedly)
    const schemaPath = path.join(__dirname, 'schema.pg.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await db.exec(schema);
    console.log('Database schema (schema.pg.sql) applied successfully.');

    // Add any new columns that may not exist yet (idempotent ALTER TABLE)
    const alterations = [
      "ALTER TABLE team_members ADD COLUMN IF NOT EXISTS group_name TEXT DEFAULT 'core'",
      "ALTER TABLE team_members ADD COLUMN IF NOT EXISTS designation TEXT",
      "ALTER TABLE team_members ADD COLUMN IF NOT EXISTS photo TEXT DEFAULT '/images/team/default-avatar.png'",
      "ALTER TABLE team_members ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0",
      "ALTER TABLE team_members ADD COLUMN IF NOT EXISTS show_on_about INTEGER DEFAULT 0",
      "ALTER TABLE team_members ADD COLUMN IF NOT EXISTS statement TEXT",
      "ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS session_type TEXT DEFAULT 'live_class'",
      "ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS category_id INTEGER",
      "ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS zoom_join_url TEXT",
      "ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS zoom_start_url TEXT",
      "ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scheduled'",
      "ALTER TABLE courses ADD COLUMN IF NOT EXISTS course_type TEXT DEFAULT 'video_hybrid'",
      "ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0",
      "ALTER TABLE courses ADD COLUMN IF NOT EXISTS active_features TEXT DEFAULT '[\"1\",\"6\"]'",
      "ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0",
      "ALTER TABLE categories ADD COLUMN IF NOT EXISTS active_features TEXT DEFAULT '[\"1\",\"6\"]'",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS plain_password TEXT",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS user_code TEXT",
      "ALTER TABLE notes ADD COLUMN IF NOT EXISTS course_id INTEGER",
      "ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
      "ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS valid_until TIMESTAMP",
      "ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'Subscription'",
      "ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0",
      `CREATE TABLE IF NOT EXISTS learning_module_questions (
        id SERIAL PRIMARY KEY,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
        question_type TEXT NOT NULL CHECK(question_type IN ('mcq', 'large_qa', 'small_qa')),
        title TEXT,
        question TEXT NOT NULL,
        options_json TEXT,
        correct_option INTEGER DEFAULT 0,
        explanation TEXT,
        difficulty TEXT DEFAULT 'Medium',
        topic TEXT,
        marks INTEGER DEFAULT 1,
        model_answer TEXT,
        document_url TEXT,
        is_active INTEGER DEFAULT 1,
        is_deleted INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS learning_module_documents (
        id SERIAL PRIMARY KEY,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
        doc_type TEXT DEFAULT 'all',
        title TEXT NOT NULL,
        file_url TEXT NOT NULL,
        file_name TEXT,
        file_type TEXT,
        file_size TEXT,
        description TEXT,
        download_count INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        is_deleted INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    ];
    for (const sql of alterations) {
      try { await db.pool.query(sql); } catch (e) { /* column/table already exists */ }
    }

    // Ensure users_role_check allows all 7 active roles
    try {
      await db.pool.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
      await db.pool.query(`
        ALTER TABLE users ADD CONSTRAINT users_role_check 
        CHECK (role IN ('student', 'intern', 'clinician', 'educator', 'academic_educator', 'researcher', 'instructor', 'admin', 'academic_mission', 'other_teacher'))
      `);
    } catch (e) {
      console.warn('Role constraint update notice:', e.message);
    }

    // Seed initial data if the database is empty
    const userCount = await db.prepare('SELECT COUNT(*) as cnt FROM users').get();
    const count = parseInt((userCount && (userCount.cnt || userCount.count)) || 0, 10);
    if (count === 0) {
      console.log('Database is empty. Seeding initial data...');
      try {
        const seedFn = require('./seed');
        if (typeof seedFn === 'function') await seedFn();
      } catch (seedErr) {
        console.error('Seeding notice (non-fatal):', seedErr.message || seedErr);
      }
    }

    // Ensure Hero Features table exists and has defaults
    try {
      await db.pool.query(`
        CREATE TABLE IF NOT EXISTS hero_features (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          subtitle TEXT NOT NULL,
          icon TEXT DEFAULT 'ri-star-line',
          url TEXT DEFAULT '/courses',
          badge_color TEXT DEFAULT 'warning',
          display_order INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      const hRow = await db.prepare('SELECT COUNT(*) as c FROM hero_features').get();
      const hCount = Number((hRow || {}).c || 0);
      if (hCount === 0) {
        const defaults = [
          { title: 'Seminars', subtitle: '25+ Webinars and Research', icon: 'ri-slideshow-3-line', url: '/live-sessions', badge_color: 'warning', display_order: 1 },
          { title: 'Recorded Videos', subtitle: '120+ HD Video Lectures', icon: 'ri-video-download-line', url: '/courses', badge_color: 'info', display_order: 2 },
          { title: 'Students', subtitle: '500+ Active Students', icon: 'ri-graduation-cap-line', url: '/auth/register', badge_color: 'purple', display_order: 3 },
          { title: 'Workshops', subtitle: '18+ Practical Workshops', icon: 'ri-tools-line', url: '/live-sessions', badge_color: 'success', display_order: 4 },
          { title: 'Live Classes', subtitle: '50+ Live Classes Done', icon: 'ri-live-line', url: '/live-sessions', badge_color: 'danger', display_order: 5 },
          { title: 'Free Courses', subtitle: '30+ BPT Study Modules', icon: 'ri-gift-line', url: '/subjects', badge_color: 'primary', display_order: 6 }
        ];
        for (const d of defaults) {
          await db.prepare('INSERT INTO hero_features (title, subtitle, icon, url, badge_color, display_order) VALUES (?, ?, ?, ?, ?, ?)')
            .run(d.title, d.subtitle, d.icon, d.url, d.badge_color, d.display_order);
        }
        console.log('Default Hero Feature cards seeded.');
      }
    } catch (e) {
      console.warn('Hero features seed notice:', e.message);
    }

    // Ensure Clinical Specialties table exists and has defaults
    try {
      await db.pool.query(`
        CREATE TABLE IF NOT EXISTS clinical_specialties (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          icon TEXT DEFAULT 'ri-stethoscope-fill',
          badge TEXT DEFAULT 'Clinical',
          theme TEXT DEFAULT 'primary',
          items TEXT NOT NULL,
          display_order INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      const sRow = await db.prepare('SELECT COUNT(*) as c FROM clinical_specialties').get();
      const sCount = Number((sRow || {}).c || 0);
      if (sCount === 0) {
        const defaults = [
          { name: 'Post-Surgery Physiotherapy', slug: 'post-surgery-physiotherapy', icon: 'ri-hospital-fill', badge: 'Surgical Rehab', theme: 'primary', items: 'Total Knee / Hip Replacement\nShoulder / Hip / Knee Surgeries', display_order: 1 },
          { name: 'Geriatric and Elderly Care', slug: 'geriatric-elderly-care', icon: 'ri-user-heart-fill', badge: 'Senior Wellness', theme: 'success', items: 'Arthritis and Joint Care\nBack and Muscular Pain', display_order: 2 },
          { name: 'Chronic Pain Management', slug: 'chronic-pain-management', icon: 'ri-health-book-fill', badge: 'Pain Relief', theme: 'warning', items: 'Degenerative Disc and Sciatic Pain\nNeck and Shoulder Stiffness', display_order: 3 },
          { name: 'Orthopedic and Sports Injuries', slug: 'orthopedic-sports-injuries', icon: 'ri-body-scan-fill', badge: 'Sports Science', theme: 'danger', items: 'Sprains, Strains and Ligament Tears\nBack, Neck and Joint Pain', display_order: 4 },
          { name: 'Pediatric Physiotherapy', slug: 'pediatric-physiotherapy', icon: 'ri-bear-smile-fill', badge: 'Child Care', theme: 'info', items: 'Cerebral Palsy Therapy\nDevelopmental Delay Rehab', display_order: 5 },
          { name: 'Specialty and Neurological Care', slug: 'specialty-neurological-care', icon: 'ri-mental-health-fill', badge: 'Specialized Clinical', theme: 'purple', items: 'Post-Stroke Neuro Rehab\nNeurological Disorder Management', display_order: 6 }
        ];
        for (const d of defaults) {
          await db.prepare('INSERT INTO clinical_specialties (name, slug, icon, badge, theme, items, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(d.name, d.slug, d.icon, d.badge, d.theme, d.items, d.display_order);
        }
        console.log('Default Clinical Specialty cards seeded.');
      }
    } catch (e) {
      console.warn('Clinical specialties seed notice:', e.message);
    }

    // ============ RBAC & CONTENT VISIBILITY MIGRATIONS ============
    try {
      // 1. Update users table role constraint to support superadmin
      try {
        await db.pool.query("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check");
        await db.pool.query("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK(role IN ('superadmin', 'admin', 'instructor', 'student', 'intern', 'clinician', 'educator', 'researcher', 'user'))");
      } catch (e) { /* constraint update notice */ }

      // 2. Add visibility and ownership columns to content tables
      const addColumnQueries = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS plain_password TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS user_code TEXT",
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public'",
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL",
        "ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public'",
        "ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL",
        "ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public'",
        "ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL",
        "ALTER TABLE categories ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public'",
        "ALTER TABLE categories ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL",
        "ALTER TABLE notes ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public'",
        "ALTER TABLE learning_module_questions ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public'",
        "ALTER TABLE learning_module_questions ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL"
      ];

      for (const q of addColumnQueries) {
        try {
          await db.pool.query(q);
        } catch (e) { /* ignore if already present */ }
      }

      // 3. Create RBAC tables
      await db.pool.query(`
        CREATE TABLE IF NOT EXISTS permissions (
          id SERIAL PRIMARY KEY,
          permission_key TEXT UNIQUE NOT NULL,
          resource TEXT NOT NULL,
          action TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_permissions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          permission_key TEXT NOT NULL,
          granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, permission_key)
        );

        CREATE TABLE IF NOT EXISTS content_access (
          id SERIAL PRIMARY KEY,
          content_type TEXT NOT NULL,
          content_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          permission_level TEXT DEFAULT 'view' CHECK(permission_level IN ('view', 'edit', 'admin')),
          assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(content_type, content_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
          id SERIAL PRIMARY KEY,
          actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          actor_name TEXT,
          actor_email TEXT,
          actor_role TEXT,
          action TEXT NOT NULL,
          resource TEXT NOT NULL,
          resource_id TEXT,
          details TEXT,
          ip_address TEXT,
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 4. Seed Standard Permissions Registry
      const standardPermissions = [
        // COURSE
        { key: 'COURSE:VIEW', resource: 'COURSE', action: 'VIEW', name: 'View Courses', description: 'View course catalog and details' },
        { key: 'COURSE:CREATE', resource: 'COURSE', action: 'CREATE', name: 'Create Course', description: 'Create new course curriculum & lessons' },
        { key: 'COURSE:EDIT', resource: 'COURSE', action: 'EDIT', name: 'Edit Course', description: 'Modify course structure, modules and videos' },
        { key: 'COURSE:DELETE', resource: 'COURSE', action: 'DELETE', name: 'Delete Course', description: 'Remove or archive courses' },
        { key: 'COURSE:PUBLISH', resource: 'COURSE', action: 'PUBLISH', name: 'Publish Course', description: 'Publish or unpublish courses for public viewing' },
        { key: 'COURSE:ASSIGN', resource: 'COURSE', action: 'ASSIGN', name: 'Assign Course', description: 'Assign course access to admins/instructors' },

        // BLOG
        { key: 'BLOG:VIEW', resource: 'BLOG', action: 'VIEW', name: 'View Blogs', description: 'View published and draft blog posts' },
        { key: 'BLOG:CREATE', resource: 'BLOG', action: 'CREATE', name: 'Create Blog', description: 'Write and draft new blog articles' },
        { key: 'BLOG:EDIT', resource: 'BLOG', action: 'EDIT', name: 'Edit Blog', description: 'Edit existing blog articles and metadata' },
        { key: 'BLOG:DELETE', resource: 'BLOG', action: 'DELETE', name: 'Delete Blog', description: 'Delete blog posts' },
        { key: 'BLOG:PUBLISH', resource: 'BLOG', action: 'PUBLISH', name: 'Publish Blog', description: 'Publish blogs to the live site' },
        { key: 'BLOG:ASSIGN', resource: 'BLOG', action: 'ASSIGN', name: 'Assign Blog', description: 'Assign blog edit permissions' },

        // LIVE_CLASS
        { key: 'LIVE_CLASS:VIEW', resource: 'LIVE_CLASS', action: 'VIEW', name: 'View Live Classes', description: 'View live classes and webinars' },
        { key: 'LIVE_CLASS:CREATE', resource: 'LIVE_CLASS', action: 'CREATE', name: 'Create Live Class', description: 'Create and schedule new live Zoom sessions' },
        { key: 'LIVE_CLASS:EDIT', resource: 'LIVE_CLASS', action: 'EDIT', name: 'Edit Live Class', description: 'Edit scheduled live class topics and times' },
        { key: 'LIVE_CLASS:DELETE', resource: 'LIVE_CLASS', action: 'DELETE', name: 'Delete Live Class', description: 'Cancel or remove live sessions' },
        { key: 'LIVE_CLASS:PUBLISH', resource: 'LIVE_CLASS', action: 'PUBLISH', name: 'Publish Live Class', description: 'Publish live classes for student registrations' },
        { key: 'LIVE_CLASS:ASSIGN', resource: 'LIVE_CLASS', action: 'ASSIGN', name: 'Assign Live Class', description: 'Assign hosts and instructors to live sessions' },

        // SUBJECT
        { key: 'SUBJECT:VIEW', resource: 'SUBJECT', action: 'VIEW', name: 'View Subjects', description: 'View curriculum subjects and categories' },
        { key: 'SUBJECT:CREATE', resource: 'SUBJECT', action: 'CREATE', name: 'Create Subject', description: 'Add new subjects and categories' },
        { key: 'SUBJECT:EDIT', resource: 'SUBJECT', action: 'EDIT', name: 'Edit Subject', description: 'Modify subject names, slugs, and years' },
        { key: 'SUBJECT:DELETE', resource: 'SUBJECT', action: 'DELETE', name: 'Delete Subject', description: 'Delete curriculum subjects' },
        { key: 'SUBJECT:ASSIGN', resource: 'SUBJECT', action: 'ASSIGN', name: 'Assign Subject', description: 'Assign subject management to faculty' },

        // CASE_DISCUSSION
        { key: 'CASE_DISCUSSION:VIEW', resource: 'CASE_DISCUSSION', action: 'VIEW', name: 'View Case Discussions', description: 'View clinical case discussions & question modules' },
        { key: 'CASE_DISCUSSION:CREATE', resource: 'CASE_DISCUSSION', action: 'CREATE', name: 'Create Case Discussion', description: 'Add new clinical cases, MCQs and SAQs' },
        { key: 'CASE_DISCUSSION:EDIT', resource: 'CASE_DISCUSSION', action: 'EDIT', name: 'Edit Case Discussion', description: 'Edit clinical cases and model answers' },
        { key: 'CASE_DISCUSSION:DELETE', resource: 'CASE_DISCUSSION', action: 'DELETE', name: 'Delete Case Discussion', description: 'Remove case discussions and question banks' },
        { key: 'CASE_DISCUSSION:PUBLISH', resource: 'CASE_DISCUSSION', action: 'PUBLISH', name: 'Publish Case Discussion', description: 'Publish cases to student portal' },
        { key: 'CASE_DISCUSSION:ASSIGN', resource: 'CASE_DISCUSSION', action: 'ASSIGN', name: 'Assign Case Discussion', description: 'Assign case discussion moderation' },

        // USER
        { key: 'USER:VIEW', resource: 'USER', action: 'VIEW', name: 'View Users', description: 'View registered users and learner accounts' },
        { key: 'USER:CREATE', resource: 'USER', action: 'CREATE', name: 'Create User', description: 'Create student and faculty accounts' },
        { key: 'USER:EDIT', resource: 'USER', action: 'EDIT', name: 'Edit User', description: 'Edit user profiles and details' },
        { key: 'USER:DELETE', resource: 'USER', action: 'DELETE', name: 'Delete User', description: 'Delete or deactivate user accounts' },
        { key: 'USER:TOGGLE_STATUS', resource: 'USER', action: 'TOGGLE_STATUS', name: 'Toggle User Status', description: 'Activate or suspend user accounts' },

        // AUDIT_LOG
        { key: 'AUDIT_LOG:VIEW', resource: 'AUDIT_LOG', action: 'VIEW', name: 'View Audit Logs', description: 'Inspect administrative audit log records' },

        // SETTINGS
        { key: 'SETTINGS:VIEW', resource: 'SETTINGS', action: 'VIEW', name: 'View Settings', description: 'View homepage and system configurations' },
        { key: 'SETTINGS:EDIT', resource: 'SETTINGS', action: 'EDIT', name: 'Edit Settings', description: 'Edit homepage sections, CTA, hero, and vision' }
      ];

      for (const p of standardPermissions) {
        try {
          await db.pool.query(
            `INSERT INTO permissions (permission_key, resource, action, name, description)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (permission_key) DO UPDATE SET name = $4, description = $5`,
            [p.key, p.resource, p.action, p.name, p.description]
          );
        } catch (e) { /* ignore */ }
      }

    } catch (e) {
      console.warn('RBAC migration notice:', e.message);
    }

    // Always ensure Superadmin exists with known password & superadmin role
    try {
      const bcrypt = require('bcryptjs');
      const inkHash = bcrypt.hashSync('ink@123', 8);
      const inkUser = await db.prepare("SELECT * FROM users WHERE LOWER(email) = 'ink@physioadvance.com' OR LOWER(email) = 'admin@physioedvance.com' OR id = 1").get();
      if (inkUser) {
        await db.prepare("UPDATE users SET email = ?, password = ?, role = 'superadmin', is_active = 1 WHERE id = ?").run('ink@physioadvance.com', inkHash, inkUser.id);
        console.log('Superadmin synced: ink@physioadvance.com / ink@123 (role: superadmin)');
      } else {
        await db.prepare("INSERT INTO users (name, email, password, role, is_active, email_verified) VALUES ('Super Admin', 'ink@physioadvance.com', ?, 'superadmin', 1, 1)").run(inkHash);
        console.log('Superadmin created: ink@physioadvance.com / ink@123 (role: superadmin)');
      }
    } catch (e) {
      console.warn('Superadmin sync notice:', e.message);
    }

    // Ensure demo instructor passwords are correct
    try {
      const bcrypt = require('bcryptjs');
      const instHash = bcrypt.hashSync('Instructor@123', 8);
      for (const email of ['neha.samapriya@physioedvance.com', 'heena.nawaz@physioedvance.com']) {
        const u = await db.prepare("SELECT id, password FROM users WHERE LOWER(email) = ?").get(email);
        if (u && !bcrypt.compareSync('Instructor@123', u.password)) {
          await db.prepare("UPDATE users SET password = ?, is_active = 1 WHERE id = ?").run(instHash, u.id);
          console.log('Synced demo instructor password for ' + email);
        }
      }
    } catch (e) {
      console.warn('Instructor password sync notice:', e.message);
    }

    // Clean up any legacy Page 1 titles & ensure About leadership statements flag
    try {
      await db.pool.query("UPDATE notes SET title = 'Rural Community Physiotherapy Study Notes' WHERE LOWER(TRIM(title)) = 'page 1'");
      await db.pool.query("UPDATE courses SET title = 'Rural Community Physiotherapy Study Notes' WHERE LOWER(TRIM(title)) = 'page 1'");
      await db.pool.query("UPDATE team_members SET show_on_about = 1 WHERE (group_name IN ('founding', 'the_face') OR designation LIKE '%Founder%') AND (show_on_about IS NULL OR show_on_about = 0)");
      await db.pool.query("UPDATE team_members SET statement = bio WHERE (statement IS NULL OR TRIM(statement) = '') AND (bio IS NOT NULL AND TRIM(bio) != '')");
    } catch (e) { /* ignore */ }

  } finally {
    isMigrating = false;
  }
}

module.exports = migrate;
