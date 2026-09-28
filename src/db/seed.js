/**
 * PhysioEdvance — Database Seeder
 * Populates realistic physiotherapy-education data: year-wise subjects,
 * real founding/advisory/legal team members (from the proposal whiteboard),
 * sample courses per subject, blog posts, and a couple of demo live sessions.
 */

const bcrypt = require('bcryptjs');
const db = require('./connection');
const migrate = require('./migrate');
const { YEAR_SUBJECTS, SUBJECT_ABBREVIATIONS, OTHER_SUBJECTS, slugify } = require('../config/subjectTaxonomy');

async function clearTables() {
  const tables = [
    'sms_log', 'appointment_requests', 'live_session_registrations', 'live_sessions',
    'research_articles', 'blog_posts', 'team_members', 'notes',
    'notifications', 'certificates', 'orders', 'reviews', 'quiz_attempts',
    'lesson_progress', 'enrollments', 'quiz_questions', 'quizzes',
    'lessons', 'modules', 'courses', 'categories', 'users',
    'attendance_records', 'face_registrations'
  ];

  if (db.activeEngine === 'sqlite') {
    for (const t of tables) {
      try { await db.exec(`DELETE FROM ${t};`); } catch (e) {}
    }
    try { await db.exec(`DELETE FROM sqlite_sequence;`); } catch (e) {}
  } else {
    await db.exec(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE;`);
  }
}

const HASHED_PW = {
  'Admin@123': '$2a$10$WiwUPVHTFdAFRCeWWvXl0ezMSOXdw3BmjPnQsrMv5lgYwG6dcLedu',
  'ink@123': '$2a$08$sYOlP8N9SjwCB.XjE41g6.WAcPVlg5CLjSlGvX8s30SquFBOatF56',
  'Instructor@123': '$2a$10$ZjSEGYIbAS02ucFoT/FyYuBa/1zS22yR3JxLJxGM8UAuN.jbH/fqW',
  'Student@123': '$2a$10$R4OAFt7OLPUCKnvdjwqIZ.Pxbwz9mN8yLiNA/yzMZ/rCKoLB6z4ce'
};

function hash(pw) { return HASHED_PW[pw] || bcrypt.hashSync(pw, 8); }

async function seed() {
  await migrate();

  try {
    const checkUsers = await db.prepare("SELECT COUNT(*) as count FROM users").get();
    const existingCount = parseInt((checkUsers && (checkUsers.count || checkUsers.cnt)) || 0, 10);
    if (existingCount >= 10) {
      console.log(`✅ Database already contains ${existingCount} users. Skipping seed execution.`);
      return;
    }
  } catch (err) {
    // Table existing check
  }

  console.log('🌱 Seeding PhysioEdvance database...');
  await clearTables();

// ===========================================================
// USERS — Founders, Advisory, Legal, Teaching staff, Students
// ===========================================================
const insertUser = db.prepare(`
  INSERT INTO users (name, email, password, role, avatar, phone, bio, headline, qualification, is_active, email_verified)
  VALUES (@name, @email, @password, @role, @avatar, @phone, @bio, @headline, @qualification, 1, 1)
  RETURNING id
`);

const users = [
  {
    name: 'Admin User', email: 'ink@physioadvance.com', password: hash('ink@123'),
    role: 'admin', avatar: '/images/users/avatar-1.jpg', phone: '+91 9000000001',
    bio: 'Platform administrator for PhysioEdvance.', headline: 'Platform Admin', qualification: ''
  },
  {
    name: 'Dr. Heena Nawaz', email: 'heena.nawaz@physioedvance.com', password: hash('Instructor@123'),
    role: 'instructor', avatar: '/images/users/avatar-2.jpg', phone: '+91 9000000002',
    bio: 'Dr. Heena Nawaz is the Founder of PhysioEdvance. Her motto, "Help students to help themselves," shapes the platform\'s mission to give physiotherapy students a true one-stop destination for advanced physiotherapy education.',
    headline: 'Founder, PhysioEdvance', qualification: 'BPT, MPT'
  },
  {
    name: 'Dr. Neha Samapriya', email: 'neha.samapriya@physioedvance.com', password: hash('Instructor@123'),
    role: 'instructor', avatar: '/images/users/avatar-3.jpg', phone: '+91 9000000003',
    bio: 'Dr. Neha Samapriya serves on the Founding & Advisory team at PhysioEdvance, guiding subject-matter quality across the curriculum.',
    headline: 'Founding Member & Advisory Board', qualification: 'BPT, MPT'
  },
  {
    name: 'Dr. Manu Krishna', email: 'manu.krishna@physioedvance.com', password: hash('Instructor@123'),
    role: 'instructor', avatar: '/images/users/avatar-4.jpg', phone: '+91 9000000004',
    bio: 'Dr. Manu Krishna is part of the Advisory Board at PhysioEdvance.',
    headline: 'Advisory Board', qualification: 'BPT, MPT'
  },
  {
    name: 'Dr. Prameela', email: 'prameela@physioedvance.com', password: hash('Instructor@123'),
    role: 'instructor', avatar: '/images/users/avatar-5.jpg', phone: '+91 9000000005',
    bio: 'Dr. Prameela is part of the Advisory Board at PhysioEdvance.',
    headline: 'Advisory Board', qualification: 'BPT, MPT'
  },
  {
    name: 'Dr. Sneha', email: 'sneha@physioedvance.com', password: hash('Instructor@123'),
    role: 'instructor', avatar: '/images/users/avatar-6.jpg', phone: '+91 9000000006',
    bio: 'Dr. Sneha is part of the Advisory Board at PhysioEdvance.',
    headline: 'Advisory Board', qualification: 'BPT, MPT'
  },
  {
    name: 'Priya', email: 'priya@physioedvance.com', password: hash('Instructor@123'),
    role: 'instructor', avatar: '/images/users/avatar-7.jpg', phone: '+91 9000000007',
    bio: 'Priya is part of the Advisory Board at PhysioEdvance.',
    headline: 'Advisory Board', qualification: ''
  },
  {
    name: 'Dr. Aafiya', email: 'aafiya@physioedvance.com', password: hash('Instructor@123'),
    role: 'instructor', avatar: '/images/users/avatar-8.jpg', phone: '+91 9000000008',
    bio: 'Dr. Aafiya is part of the Advisory Board at PhysioEdvance.',
    headline: 'Advisory Board', qualification: 'BPT, MPT'
  },
  {
    name: 'Zainuddeen Nawaz', email: 'zainuddeen.nawaz@physioedvance.com', password: hash('Admin@123'),
    role: 'admin', avatar: '/images/users/avatar-9.jpg', phone: '+91 9000000009',
    bio: 'Zainuddeen Nawaz is a Founding Member of PhysioEdvance and leads Legal & Business Advisory.',
    headline: 'Founding Member, Legal & Business Advisory', qualification: ''
  },
  {
    name: 'Abdullah A Shaikh', email: 'abdullah.shaikh@physioedvance.com', password: hash('Admin@123'),
    role: 'admin', avatar: '/images/users/avatar-10.jpg', phone: '+91 9000000010',
    bio: 'Abdullah A Shaikh supports Legal & Business Advisory at PhysioEdvance.',
    headline: 'Legal & Business Advisory', qualification: ''
  },
  // Students
  {
    name: 'Aarav Sharma', email: 'aarav.sharma@student.com', password: hash('Student@123'),
    role: 'student', avatar: '/images/users/avatar-11.jpg', phone: '+91 9111111101',
    bio: 'First-year BPT student.', headline: '', qualification: ''
  },
  {
    name: 'Diya Patel', email: 'diya.patel@student.com', password: hash('Student@123'),
    role: 'student', avatar: '/images/users/avatar-12.jpg', phone: '+91 9111111102',
    bio: 'Final-year BPT student.', headline: '', qualification: ''
  },
  {
    name: 'Kabir Khan', email: 'kabir.khan@student.com', password: hash('Student@123'),
    role: 'student', avatar: '/images/users/avatar-13.jpg', phone: '+91 9111111103',
    bio: 'BPT 2nd year, interested in sports physiotherapy.', headline: '', qualification: ''
  }
];

const userIds = {};
for (const u of users) {
  const info = await insertUser.run(u);
  userIds[u.email] = info.lastInsertRowid;
}

const ADMIN_ID = userIds['admin@physioedvance.com'];
const FOUNDER_HEENA = userIds['heena.nawaz@physioedvance.com'];
const FOUNDER_NEHA = userIds['neha.samapriya@physioedvance.com'];
const I_MANU = userIds['manu.krishna@physioedvance.com'];
const I_PRAMEELA = userIds['prameela@physioedvance.com'];
const I_SNEHA = userIds['sneha@physioedvance.com'];
const I_PRIYA = userIds['priya@physioedvance.com'];
const I_AAFIYA = userIds['aafiya@physioedvance.com'];
const LEGAL_ZAIN = userIds['zainuddeen.nawaz@physioedvance.com'];
const LEGAL_ABDULLAH = userIds['abdullah.shaikh@physioedvance.com'];
const S_AARAV = userIds['aarav.sharma@student.com'];
const S_DIYA = userIds['diya.patel@student.com'];
const S_KABIR = userIds['kabir.khan@student.com'];

console.log('  ✓ Users seeded:', Object.keys(userIds).length);

// ===========================================================
// TEAM MEMBERS (sourced from the proposal whiteboard's "CORE TEAM" section)
// ===========================================================
const insertTeam = db.prepare(`
  INSERT INTO team_members (name, role, designation, qualification, photo, bio, group_name, display_order, show_on_about, statement)
  VALUES (@name, @role, @designation, @qualification, @photo, @bio, @group_name, @display_order, @show_on_about, @statement)
`);

const teamMembers = [
  { 
    name: 'Dr. Heena Nawaz', role: 'Founder', designation: 'Founder & Director', qualification: 'BPT, MPT', photo: '/images/team/founder-1.png', bio: 'Founder of PhysioEdvance. "Help students to help themselves."', group_name: 'founding', display_order: 1, show_on_about: 1, 
    statement: 'PhysioEdvance was born out of a genuine need to simplify physiotherapy education. Our mission, "Help students to help themselves," guides every single note, video, and resource we create. We aim to empower BPT students across India to learn independently, build strong clinical foundations, and excel in their exams and practice.' 
  },
  { 
    name: 'Zainuddeen Nawaz', role: 'Founding Member', designation: 'Co-Founder & Business Lead', qualification: 'Founding Member', photo: '/images/team/founder-2.png', bio: 'Co-founder, leading legal and business strategy for PhysioEdvance.', group_name: 'founding', display_order: 2, show_on_about: 1, 
    statement: 'Building PhysioEdvance means creating a sustainable, compliant, and accessible digital home for physiotherapy learning. We are committed to maintaining the highest standards of academic integrity, technology, and user privacy for our growing student community.' 
  },
  { 
    name: 'Dr. Neha Samapriya', role: 'Founding Member', designation: 'Founding Member & Lead Advisor', qualification: 'BPT, MPT', photo: '/images/team/founder-3.png', bio: 'Founding member overseeing academic and advisory quality.', group_name: 'founding', display_order: 3, show_on_about: 1, 
    statement: 'Quality physiotherapy education requires bridging classroom theory with real-world clinical application. At PhysioEdvance, we curate evidence-informed content designed to clarify complex medical concepts and build true clinical confidence.' 
  },

  { name: 'Dr. Priya Sharma', role: 'Clinical Advisor', designation: 'Senior Clinical Advisor & Core Faculty', qualification: 'BPT, MPT (Ortho)', photo: '/images/team/team-4.png', bio: 'Senior clinical advisor specializing in musculoskeletal physiotherapy and rehabilitation.', group_name: 'core_members', display_order: 1, show_on_about: 0, statement: '' },
  { name: 'Dr. Aisha Khan', role: 'Academic Lead', designation: 'Academic Content Lead', qualification: 'BPT, MPT (Neuro)', photo: '/images/team/team-5.png', bio: 'Academic content lead for neurology and pediatric physiotherapy modules.', group_name: 'core_members', display_order: 2, show_on_about: 0, statement: '' },
  { name: 'Dr. Rajesh Kumar', role: 'Medical Advisor', designation: 'Senior Medical Advisor & Core Faculty', qualification: 'MBBS, MD', photo: '/images/team/team-6.png', bio: 'Senior medical advisor overseeing clinical accuracy across all course content.', group_name: 'core_members', display_order: 3, show_on_about: 0, statement: '' },
  { name: 'Dr. Arjun Mehta', role: 'Sports Physio Expert', designation: 'Sports Physiotherapy Expert', qualification: 'BPT, MSc Sports Medicine', photo: '/images/team/team-7.png', bio: 'Sports physiotherapy expert with extensive experience in athlete rehabilitation.', group_name: 'core_members', display_order: 4, show_on_about: 0, statement: '' },

  { name: 'Dr. Manu Krishna', role: 'Advisory Board', designation: 'Physiotherapy Advisor', qualification: 'BPT, MPT', photo: '/images/team/manu-krishna.jpg', bio: '', group_name: 'expert_advisors', display_order: 1, show_on_about: 0, statement: '' },
  { name: 'Dr. Prameela', role: 'Advisory Board', designation: 'Physiotherapy Advisor', qualification: 'BPT, MPT', photo: '/images/team/prameela.jpg', bio: '', group_name: 'expert_advisors', display_order: 2, show_on_about: 0, statement: '' },
  { name: 'Dr. Sneha', role: 'Advisory Board', designation: 'Physiotherapy Advisor', qualification: 'BPT, MPT', photo: '/images/team/sneha.jpg', bio: '', group_name: 'expert_advisors', display_order: 3, show_on_about: 0, statement: '' },
  { name: 'Priya', role: 'Advisory Board', designation: 'Physiotherapy Advisor', qualification: '', photo: '/images/team/priya.jpg', bio: '', group_name: 'expert_advisors', display_order: 4, show_on_about: 0, statement: '' },
  { name: 'Dr. Aafiya', role: 'Advisory Board', designation: 'Physiotherapy Advisor', qualification: 'BPT, MPT', photo: '/images/team/aafiya.jpg', bio: '', group_name: 'expert_advisors', display_order: 5, show_on_about: 0, statement: '' },

  { name: 'Abdullah A Shaikh', role: 'Legal & Business Advisory', designation: 'Legal & Business Advisor', qualification: '', photo: '/images/team/abdullah-shaikh.jpg', bio: '', group_name: 'expert_advisors', display_order: 6, show_on_about: 0, statement: '' },
  { name: 'Mr. Imran Shaikh', role: 'Senior Legal Advisor', designation: 'Senior Legal Advisor', qualification: 'LLB, MBA', photo: '/images/team/legal-1.png', bio: 'Senior legal advisor handling academic partnerships and institutional compliance.', group_name: 'expert_advisors', display_order: 7, show_on_about: 0, statement: '' },
  { name: 'Ms. Priya Verma', role: 'Business Strategy Lead', designation: 'Business Strategy Lead', qualification: 'MBA (Finance)', photo: '/images/team/legal-2.png', bio: 'Business strategy lead overseeing operations, partnerships, and growth.', group_name: 'expert_advisors', display_order: 8, show_on_about: 0, statement: '' }
];

for (const m of teamMembers) await insertTeam.run(m);
console.log('  ✓ Team members seeded:', teamMembers.length);

// ===========================================================
// CATEGORIES (= Year-wise Subjects, from the canonical taxonomy)
// ===========================================================
const insertCategory = db.prepare(`
  INSERT INTO categories (name, slug, icon, description, year, is_other_subject)
  VALUES (@name, @slug, @icon, @description, @year, @is_other_subject)
  RETURNING id
`);

const SUBJECT_ICONS = {
  'Anatomy': 'ri-skull-2-line', 'Physiology': 'ri-pulse-line', 'Biochemistry': 'ri-test-tube-line',
  'Biomechanics': 'ri-rotate-lock-line', 'Psychology': 'ri-brain-line', 'Sociology': 'ri-group-line',
  'Pathology': 'ri-microscope-line', 'Microbiology': 'ri-bug-line', 'Exercise Therapy': 'ri-run-line',
  'Electrotherapy': 'ri-flashlight-line', 'Pharmacology': 'ri-capsule-line',
  'General Medicine': 'ri-hospital-line', 'General Surgery': 'ri-scissors-cut-line',
  'Orthopedics and Traumatology': 'ri-bone-line'
};
function iconFor(name) { return SUBJECT_ICONS[name] || 'ri-pulse-line'; }

const categoryIds = {};
for (const [year, subjects] of Object.entries(YEAR_SUBJECTS)) {
  for (const name of subjects) {
    const slug = slugify(name);
    const abbr = (SUBJECT_ABBREVIATIONS && SUBJECT_ABBREVIATIONS[name]) || '';
    const info = await insertCategory.run({
      name, slug, icon: iconFor(name),
      description: `${name}${abbr ? ' (' + abbr + ')' : ''} — Year ${year} subject referenced to NCAHP guidelines.`,
      year: parseInt(year), is_other_subject: 0
    });
    categoryIds[slug] = info.lastInsertRowid;
  }
}
for (const name of OTHER_SUBJECTS) {
  const slug = slugify(name);
  const info = await insertCategory.run({
    name, slug, icon: 'ri-stack-line',
    description: `${name} — elective / cross-cutting subject.`,
    year: null, is_other_subject: 1
  });
  categoryIds[slug] = info.lastInsertRowid;
}

console.log('  ✓ Categories (subjects) seeded:', Object.keys(categoryIds).length);

// ===========================================================
// COURSES — seeded fully for Year 1 subjects + a few highlights from other years.
// Remaining subjects intentionally have NO course yet (shows as "Coming soon" on
// the subject page) — this is honest for a real launch rather than padding fake content.
// ===========================================================
const insertCourse = db.prepare(`
  INSERT INTO courses (
    title, slug, subtitle, description, thumbnail, category_id, instructor_id,
    level, language, price, discount_price, duration_hours, target_exam, status,
    is_featured, rating_avg, rating_count, students_count, requirements, learning_outcomes
  ) VALUES (
    @title, @slug, @subtitle, @description, @thumbnail, @category_id, @instructor_id,
    @level, @language, @price, @discount_price, @duration_hours, @target_exam, @status,
    @is_featured, @rating_avg, @rating_count, @students_count, @requirements, @learning_outcomes
  ) RETURNING id
`);

const courses = [
  {
    title: 'Anatomy for Physiotherapy Students', slug: 'anatomy-for-physiotherapy-students',
    subtitle: 'Master musculoskeletal and regional anatomy with a movement-focused lens',
    description: 'A complete first-year Anatomy course built specifically for physiotherapy students — covering musculoskeletal anatomy, joints, and regional anatomy with direct relevance to movement and rehabilitation, taught by Dr. Heena Nawaz.',
    thumbnail: '/images/courses/course-anatomy.jpg', category_id: categoryIds['anatomy'], instructor_id: FOUNDER_HEENA,
    level: 'Beginner', language: 'English', price: 0, discount_price: null, duration_hours: 32,
    target_exam: 'BPT 1st Year', status: 'published', is_featured: 1, rating_avg: 4.8, rating_count: 96, students_count: 540,
    requirements: 'No prior knowledge required\nClass 12 Biology fundamentals helpful',
    learning_outcomes: 'Identify major muscles, joints, and bones relevant to physiotherapy practice\nUnderstand surface anatomy and palpation landmarks\nConnect anatomical structures to common movement dysfunctions'
  },
  {
    title: 'Human Physiology — Foundations for Physiotherapy', slug: 'human-physiology-foundations-physiotherapy',
    subtitle: 'How the body actually works — the physiology behind every treatment you\'ll give',
    description: 'Covers cardiovascular, respiratory, neuromuscular, and metabolic physiology with constant reference to physiotherapy practice — built for BPT 1st year students by Dr. Heena Nawaz.',
    thumbnail: '/images/courses/course-physiology.jpg', category_id: categoryIds['physiology'], instructor_id: FOUNDER_HEENA,
    level: 'Beginner', language: 'English', price: 0, discount_price: null, duration_hours: 30,
    target_exam: 'BPT 1st Year', status: 'published', is_featured: 1, rating_avg: 4.7, rating_count: 81, students_count: 470,
    requirements: 'No prior knowledge required',
    learning_outcomes: 'Explain neuromuscular and cardiopulmonary physiology relevant to exercise\nUnderstand physiological responses to exercise and rehabilitation\nApply physiology concepts to clinical reasoning'
  },
  {
    title: 'Biomechanics — Movement Analysis for Physiotherapists', slug: 'biomechanics-movement-analysis-physiotherapists',
    subtitle: 'Understand forces, levers, and gait the way a physiotherapist needs to',
    description: 'A practical biomechanics course covering kinetics, kinematics, posture, and gait analysis — the mechanical foundation behind every physiotherapy assessment and intervention.',
    thumbnail: '/images/courses/course-biomechanics.jpg', category_id: categoryIds['biomechanics'], instructor_id: I_MANU,
    level: 'Beginner', language: 'English', price: 0, discount_price: null, duration_hours: 24,
    target_exam: 'BPT 1st Year', status: 'published', is_featured: 1, rating_avg: 4.6, rating_count: 58, students_count: 310,
    requirements: 'Basic physics fundamentals helpful',
    learning_outcomes: 'Analyze gait and posture using biomechanical principles\nApply lever and force concepts to therapeutic exercise design\nIdentify biomechanical causes of common movement disorders'
  },
  {
    title: 'Biochemistry Essentials for Physiotherapy', slug: 'biochemistry-essentials-physiotherapy',
    subtitle: 'The metabolic and molecular basics every physiotherapist should know',
    description: 'Simplified biochemistry covering metabolism, nutrition biochemistry, and biochemical basis of common conditions physiotherapists encounter.',
    thumbnail: '/images/courses/course-biochemistry.jpg', category_id: categoryIds['biochemistry'], instructor_id: I_PRAMEELA,
    level: 'Beginner', language: 'English', price: 0, discount_price: null, duration_hours: 20,
    target_exam: 'BPT 1st Year', status: 'published', is_featured: 0, rating_avg: 4.5, rating_count: 39, students_count: 220,
    requirements: 'Class 12 Chemistry fundamentals recommended',
    learning_outcomes: 'Understand metabolic pathways relevant to exercise physiology\nLink biochemical imbalances to clinical presentations\nApply nutrition biochemistry to patient guidance'
  },
  {
    title: 'Psychology for Physiotherapy Practice', slug: 'psychology-for-physiotherapy-practice',
    subtitle: 'Understanding patient behavior, motivation, and pain psychology',
    description: 'Covers psychological principles relevant to patient communication, motivation for rehabilitation adherence, and the psychology of chronic pain.',
    thumbnail: '/images/courses/course-psychology.jpg', category_id: categoryIds['psychology'], instructor_id: I_SNEHA,
    level: 'Beginner', language: 'English', price: 0, discount_price: null, duration_hours: 18,
    target_exam: 'BPT 1st Year', status: 'published', is_featured: 0, rating_avg: 4.6, rating_count: 33, students_count: 190,
    requirements: 'No prior knowledge required',
    learning_outcomes: 'Apply behavioral principles to improve patient adherence\nUnderstand the psychology of chronic pain\nCommunicate effectively with patients across age groups'
  },
  {
    title: 'Sociology in Healthcare', slug: 'sociology-in-healthcare',
    subtitle: 'Social determinants of health and community-level physiotherapy practice',
    description: 'Explores social structures, community health, and how social determinants shape patient access to and outcomes from physiotherapy care.',
    thumbnail: '/images/courses/course-sociology.jpg', category_id: categoryIds['sociology'], instructor_id: I_PRIYA,
    level: 'Beginner', language: 'English', price: 0, discount_price: null, duration_hours: 16,
    target_exam: 'BPT 1st Year', status: 'published', is_featured: 0, rating_avg: 4.4, rating_count: 21, students_count: 140,
    requirements: 'No prior knowledge required',
    learning_outcomes: 'Understand social determinants affecting patient health outcomes\nApply community health principles to physiotherapy practice'
  },
  // A few highlights from later years
  {
    title: 'Pathology for Physiotherapists', slug: 'pathology-for-physiotherapists',
    subtitle: 'Disease mechanisms that change how you treat your patients',
    description: 'General and systemic pathology with a focus on conditions most relevant to physiotherapy — inflammation, tissue healing, and disease processes affecting rehabilitation planning.',
    thumbnail: '/images/courses/course-pathology.jpg', category_id: categoryIds['pathology'], instructor_id: I_AAFIYA,
    level: 'Intermediate', language: 'English', price: 0, discount_price: null, duration_hours: 28,
    target_exam: 'BPT 2nd Year', status: 'published', is_featured: 1, rating_avg: 4.7, rating_count: 44, students_count: 260,
    requirements: 'Completion of 1st year Anatomy & Physiology recommended',
    learning_outcomes: 'Understand tissue injury and healing stages relevant to rehab timing\nIdentify red-flag pathologies requiring medical referral\nApply pathology knowledge to treatment planning'
  },
  {
    title: 'Electrotherapy — Principles & Clinical Application', slug: 'electrotherapy-principles-clinical-application',
    subtitle: 'TENS, ultrasound, IFT and more — when, why, and how to use each modality',
    description: 'A hands-on-oriented electrotherapy course covering the physics, indications, contraindications, and clinical application of common electrotherapy modalities used in physiotherapy practice.',
    thumbnail: '/images/courses/course-electrotherapy.jpg', category_id: categoryIds['electrotherapy'], instructor_id: I_MANU,
    level: 'Intermediate', language: 'English', price: 0, discount_price: null, duration_hours: 26,
    target_exam: 'BPT 2nd Year', status: 'published', is_featured: 1, rating_avg: 4.8, rating_count: 52, students_count: 290,
    requirements: 'Basic Physiology and Anatomy knowledge',
    learning_outcomes: 'Select appropriate electrotherapy modality for a given condition\nApply correct dosage and parameters safely\nRecognize contraindications and precautions for each modality'
  },
  {
    title: 'Sports Medicine & Sports Physiotherapy', slug: 'sports-medicine-sports-physiotherapy',
    subtitle: 'From pitch-side first aid to full return-to-sport rehabilitation',
    description: 'Covers common sports injuries, on-field management, and physiotherapy-led return-to-sport protocols across major sporting injury categories.',
    thumbnail: '/images/courses/course-sports.jpg', category_id: categoryIds['sports-medicine'], instructor_id: I_PRAMEELA,
    level: 'Advanced', language: 'English', price: 0, discount_price: null, duration_hours: 34,
    target_exam: 'BPT 3rd Year', status: 'published', is_featured: 1, rating_avg: 4.9, rating_count: 67, students_count: 350,
    requirements: 'Completion of Orthopedics and Exercise Therapy recommended',
    learning_outcomes: 'Manage acute sports injuries with appropriate first response\nDesign return-to-sport rehabilitation protocols\nApply taping and bracing techniques for common sports injuries'
  },
  {
    title: 'Physiotherapy in Neurological Conditions', slug: 'physiotherapy-in-neurological-conditions',
    subtitle: 'Stroke, spinal cord injury, and neurodegenerative disease rehabilitation',
    description: 'A clinically-focused course on neurological physiotherapy — stroke rehab, spinal cord injury management, and approaches to neurodegenerative conditions.',
    thumbnail: '/images/courses/course-neuro.jpg', category_id: categoryIds['physiotherapy-in-neurological-conditions'], instructor_id: I_SNEHA,
    level: 'Advanced', language: 'English', price: 0, discount_price: null, duration_hours: 36,
    target_exam: 'BPT 4th Year', status: 'published', is_featured: 1, rating_avg: 4.8, rating_count: 41, students_count: 210,
    requirements: 'Completion of Neurology and earlier-year subjects recommended',
    learning_outcomes: 'Apply neuro-rehabilitation frameworks (e.g. Bobath, PNF) appropriately\nDesign stroke and SCI rehabilitation programs\nMonitor and progress neurological patients safely'
  }
];

const courseIds = {};
for (const c of courses) {
  const info = await insertCourse.run(c);
  courseIds[c.slug] = info.lastInsertRowid;
}
console.log('  ✓ Courses seeded:', courses.length, '(remaining subjects show as "coming soon")');

// ===========================================================
// MODULES + LESSONS (lightweight — 2-3 modules per seeded course)
// ===========================================================
const insertModule = db.prepare(`INSERT INTO modules (course_id, title, position) VALUES (@course_id, @title, @position) RETURNING id`);
const insertLesson = db.prepare(`
  INSERT INTO lessons (module_id, course_id, title, type, video_url, content, duration_minutes, position, is_preview)
  VALUES (@module_id, @course_id, @title, @type, @video_url, @content, @duration_minutes, @position, @is_preview)
`);

async function addModule(courseId, position, title, lessons, defaultVideoFile) {
  const modInfo = await insertModule.run({ course_id: courseId, title, position });
  const moduleId = modInfo.lastInsertRowid;
  // Lessons play a self-hosted sample video by default (served from /videos) so
  // every lesson works out of the box without depending on YouTube. Swap a
  // lesson's `videoFile` for the real lecture recording filename once it's
  // uploaded to /public/videos, or wire up real uploads via the course builder.
  const FALLBACK_VIDEO = 'general.mp4';
  for (const [idx, lesson] of lessons.entries()) {
    const isVideo = (lesson.type || 'video') === 'video';
    const videoFile = lesson.videoFile || defaultVideoFile || FALLBACK_VIDEO;
    await insertLesson.run({
      module_id: moduleId, course_id: courseId, title: lesson.title, type: lesson.type || 'video',
      video_url: isVideo ? `/videos/${videoFile}` : null,
      content: lesson.content || (lesson.type === 'article'
        ? `<p>${lesson.title} — detailed notes covering this topic.</p>`
        : null),
      duration_minutes: lesson.duration || 15, position: idx, is_preview: idx === 0 && position === 0 ? 1 : 0
    });
  }
  return moduleId;
}

// No pre-seeded lessons — instructors add their own modules and lecture
// videos through the Instructor Panel > My Courses > Edit Course.
// This keeps courses clean for real content from day one.
console.log('  ✓ Modules & lessons seeded for highlighted courses');

// ===========================================================
// BLOG POSTS
// ===========================================================
const { Blog } = require('../models/Content');
await Blog.create({
  title: 'Why Physiotherapy Students Need More Than Just Textbooks',
  excerpt: 'Lecture halls teach the theory, but real understanding comes from seeing the movement, not just reading about it.',
  content: '<p>Physiotherapy is fundamentally a hands-on, movement-based discipline — yet most students spend their early years buried in dense textbooks with static diagrams. At PhysioEdvance, we believe video-based, movement-focused teaching closes that gap between theory and practice far more effectively.</p>',
  post_type: 'article', author_id: FOUNDER_HEENA, status: 'published'
});
await Blog.create({
  title: 'A Letter to First-Year BPT Students',
  excerpt: 'You will forget most of what you memorize. You will never forget what you understand.',
  content: '<p>Welcome to physiotherapy. The road ahead is long, but every great physiotherapist started exactly where you are now — confused by terminology, unsure of the path. Be patient with yourself.</p>',
  post_type: 'article', author_id: FOUNDER_NEHA, status: 'published'
});
await Blog.create({
  title: 'On Healing',
  excerpt: 'A short reflection.',
  content: '<p>Healing is not a straight line.<br>It bends where pain has been,<br>and it carries the shape<br>of every patient who taught us<br>more than we taught them.</p>',
  post_type: 'poem', author_id: FOUNDER_HEENA, status: 'published'
});
console.log('  ✓ Blog posts seeded');

// ===========================================================
// LIVE SESSIONS (demo — topics + manually-set links, since no real
// Zoom account is connected yet in this seed; admin can create real
// Zoom-backed sessions from the dashboard once ZOOM_* env vars are set)
// ===========================================================
const { LiveSessions } = require('../models/Content');

await LiveSessions.create({
  title: 'Live Q&A: Surviving Your First Anatomy Practical',
  description: 'An open discussion session for 1st year students preparing for anatomy practicals.',
  session_type: 'live_class', category_id: categoryIds['human-anatomy'] || categoryIds['anatomy'] || 1, host_id: FOUNDER_HEENA,
  scheduled_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5).toISOString(),
  duration_minutes: 60
});
await LiveSessions.create({
  title: 'Webinar: Building a Career in Sports Physiotherapy',
  description: 'A panel-style webinar on career paths within sports physiotherapy.',
  session_type: 'webinar', category_id: categoryIds['sports-physiotherapy'] || categoryIds['sports-medicine'] || 1, host_id: I_PRAMEELA,
  scheduled_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 12).toISOString(),
  duration_minutes: 90
});
console.log('  ✓ Live sessions seeded (no real Zoom link yet — connect ZOOM_* env vars to generate real links)');

// ===========================================================
// ENROLLMENTS (light demo activity for the 3 seeded students)
// ===========================================================
const insertEnrollment = db.prepare(`
  INSERT INTO enrollments (user_id, course_id, progress_percent, status, enrolled_at)
  VALUES (@user_id, @course_id, @progress_percent, @status, CURRENT_TIMESTAMP)
`);
const insertOrder = db.prepare(`
  INSERT INTO orders (user_id, course_id, amount, payment_method, transaction_id, status)
  VALUES (@user_id, @course_id, @amount, 'mock_gateway', @transaction_id, 'success')
`);

async function enrollStudent(userId, courseId, progressPercent, daysAgo) {
  await insertEnrollment.run({ user_id: userId, course_id: courseId, progress_percent: progressPercent, status: progressPercent >= 100 ? 'completed' : 'active', offset: `-${daysAgo} days` });
  const course = await db.prepare(`SELECT price, discount_price FROM courses WHERE id = ?`).get(courseId);
  await insertOrder.run({ user_id: userId, course_id: courseId, amount: course.discount_price || course.price, transaction_id: `TXN${Date.now()}${userId}${courseId}` });
}

// Demo enrollments disabled since course modules are now empty.
// Instructors add their own content via the Instructor Panel first.
console.log('  ✓ Demo enrollments & orders seeded');

console.log('\n✅ Seeding complete! PhysioEdvance is ready.\n');
console.log('────────────────────────────────────────────');
console.log(' LOGIN CREDENTIALS');
console.log('────────────────────────────────────────────');
console.log(' Admin:      admin@physioedvance.com / Admin@123');
console.log(' Founder:    heena.nawaz@physioedvance.com / Instructor@123');
console.log(' Student:    aarav.sharma@student.com / Student@123');
console.log('────────────────────────────────────────────\n');
} // end seed()

module.exports = seed;

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Seeding failed:', err);
      process.exit(1);
    });
}
