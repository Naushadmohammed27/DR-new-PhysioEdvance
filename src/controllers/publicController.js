const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const db = require('../db/connection');
const { Team, Blog, LiveSessions, HeroFeature, ClinicalSpecialty, SiteSettings, CurriculumYearCard, LearningJourneyCard, HomepageSection, AboutSettings } = require('../models/Content');
const { PHYSIOTHERAPY_SPECIALTIES, THERAPY_TYPES, slugify, SUBJECT_ABBREVIATIONS, YEAR_SUBJECTS, OTHER_SUBJECTS } = require('../config/subjectTaxonomy');
const subjectInteractiveData = require('../data/subjectInteractiveData');
const { getSubjectLearningData, learningModulesData } = require('../data/learningModulesData');
const LearningModule = require('../models/LearningModule');
const LiveDiscussion = require('../models/LiveDiscussion');
const courseSystemData = require('../data/courseSystemData');
const videoService = require('../services/videoService');

exports.home = async (req, res) => {
  const featured = await Course.featured(6);
  const allCategories = await Course.countCoursesByCategory();
  const categoriesByYear = { 1: [], 2: [], 3: [], 4: [] };
  const otherSubjects = [];
  allCategories.forEach(cat => {
    if (cat.year) categoriesByYear[cat.year].push(cat);
    else otherSubjects.push(cat);
  });

  const stats = await Course.stats();
  const dbLessons = Number((await db.prepare(`SELECT COUNT(*) as c FROM lessons`).get()).c);
  const dbLive = Number((await db.prepare(`SELECT COUNT(*) as c FROM live_sessions`).get()).c);
  const dbCourses = Number((await db.prepare(`SELECT COUNT(*) as c FROM courses`).get()).c);

  stats.totalLessons = Math.max(120, dbLessons * 4);
  stats.totalWorkshops = Math.max(18, dbLive * 9);
  stats.totalFreeCourses = Math.max(30, dbCourses * 3);

  const founders = await Team.featuredHomepage();
  const heroFeatures = await HeroFeature.allActive();
  const specialties = await ClinicalSpecialty.allActive();
  const activeCourses = await Course.allPublished();
  const visionMission = await SiteSettings.getVisionMission();
  const heroSettings = await SiteSettings.getHeroSettings();
  const curriculumCards = await CurriculumYearCard.allActive();
  const curriculumSettings = await SiteSettings.getCurriculumSettings();
  const journeyCards = await LearningJourneyCard.allActive();
  const journeySettings = await SiteSettings.getLearningJourneySettings();
  const homepageSections = await HomepageSection.allActive();
  const ctaSettings = await SiteSettings.getCTASettings();

  res.render('public/home', {
    title: 'PhysioEdvance — One-Stop Solution for Physiotherapy Students',
    featured, categoriesByYear, otherSubjects, stats, founders, heroFeatures, activeCourses,
    specialties, therapyTypes: THERAPY_TYPES, slugify, visionMission, heroSettings, SUBJECT_ABBREVIATIONS,
    curriculumCards, curriculumSettings, journeyCards, journeySettings, homepageSections, ctaSettings,
    bodyClass: 'landing-page'
  });
};

exports.courseList = async (req, res) => {
  const { category, search, level, sort } = req.query;
  const courses = await Course.allPublished({ category, search, level, sort });
  const categories = await Course.countCoursesByCategory();

  res.render('public/courses', {
    title: 'Explore Subjects & Courses',
    courses, categories,
    filters: { category: category || '', search: search || '', level: level || '', sort: sort || '' }
  });
};

exports.courseDetail = async (req, res) => {
  const course = await Course.findBySlug(req.params.slug);
  if (!course) {
    req.flash('error', 'Subject not found.');
    return res.redirect('/subjects');
  }
  // Seamlessly redirect to the Subject Interactive Portal layout for this course
  if (course.category_slug) {
    return res.redirect(`/subjects/${course.category_slug}`);
  }
  return res.redirect('/subjects');
};

// ===== SUBJECTS (subdomain-ready: subjects.physioedvance.com per proposal) =====
exports.subjectsIndex = async (req, res) => {
  const allCategories = await Course.countCoursesByCategory();
  const categoriesByYear = { 1: [], 2: [], 3: [], 4: [] };
  const otherSubjects = [];
  allCategories.forEach(cat => {
    if (cat.year) categoriesByYear[cat.year].push(cat);
    else otherSubjects.push(cat);
  });
  res.render('public/subjects-index', { title: 'All Subjects — NCAHP Syllabus', categoriesByYear, otherSubjects, SUBJECT_ABBREVIATIONS });
};

function buildSubjectInteractiveData(category) {
  const existing = subjectInteractiveData[category.slug];
  const fallback = subjectInteractiveData['anatomy'];
  const base = existing || fallback;

  return {
    ...base,
    intro: {
      title: `Introduction to ${category.name}`,
      description: category.description || `Comprehensive study of clinical procedures, theoretical foundations, surgical considerations, and rehabilitation protocols for ${category.name} in BPT & MPT physiotherapy curriculum.`
    },
    syllabusUnits: (base.syllabusUnits || []).map((u) => ({
      ...u,
      title: u.title.includes('Anatomy') ? u.title.replace('Anatomy', category.name) : `${category.name}: ${u.title}`
    }))
  };
}

function getSubjectActiveFeatures(category, courses) {
  let activeList = new Set();
  
  if (category && category.active_features) {
    try {
      const parsed = JSON.parse(category.active_features);
      if (Array.isArray(parsed)) parsed.forEach(p => activeList.add(String(p)));
    } catch(e) {}
  }

  if (courses && courses.length > 0) {
    courses.forEach(c => {
      if (c.active_features) {
        try {
          const parsed = JSON.parse(c.active_features);
          if (Array.isArray(parsed)) parsed.forEach(p => activeList.add(String(p)));
        } catch(e) {}
      } else {
        activeList.add("1");
        activeList.add("6");
        activeList.add("8");
      }
    });
  }

  if (activeList.size === 0) {
    activeList.add("1");
    activeList.add("6");
    activeList.add("8");
  }

  return Array.from(activeList);
}

exports.subjectDetail = async (req, res) => {
  const category = await db.prepare(`SELECT * FROM categories WHERE slug = ?`).get(req.params.slug);
  if (!category) {
    req.flash('error', 'Subject not found.');
    return res.redirect('/subjects');
  }
  const courses = await db.prepare(`
    SELECT c.*, u.name as instructor_name, u.avatar as instructor_avatar,
           (SELECT COUNT(*) FROM modules m WHERE m.course_id = c.id) as modules_count,
           (SELECT COUNT(*) FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.course_id = c.id) as lessons_count
    FROM courses c
    JOIN users u ON c.instructor_id = u.id
    WHERE c.category_id = ? AND c.status = 'published' AND COALESCE(c.is_deleted, 0) = 0
    ORDER BY c.created_at DESC
  `).all(category.id);

  const { Notes, SubjectHubSettings } = require('../models/Content');
  const notes = await Notes.byCategory(category.id);
  const research = await db.prepare(`SELECT * FROM research_articles WHERE category_id = ? ORDER BY created_at DESC`).all(category.id);

  // Load complete interactive hub data with all options for any subject
  const interactiveData = buildSubjectInteractiveData(category);
  const activeFeatures = getSubjectActiveFeatures(category, courses);
  const hubBlocks = await SubjectHubSettings.allActive();

  res.render('public/subject-detail', { 
    title: category.name, 
    category, 
    courses: courses || [], 
    notes: notes || [], 
    research: research || [], 
    interactiveData,
    activeFeatures,
    hubBlocks
  });
};

exports.subjectSectionDetail = async (req, res) => {
  const category = await db.prepare(`SELECT * FROM categories WHERE slug = ?`).get(req.params.slug);
  if (!category) {
    req.flash('error', 'Subject not found.');
    return res.redirect('/subjects');
  }
  const courses = await db.prepare(`
    SELECT * FROM courses WHERE category_id = ? AND status = 'published' AND COALESCE(is_deleted, 0) = 0
  `).all(category.id);

  const interactiveData = buildSubjectInteractiveData(category);
  const { Notes } = require('../models/Content');
  const notes = await Notes.byCategory(category.id);
  const activeFeatures = getSubjectActiveFeatures(category, courses);

  let activeSection = req.params.section || 'syllabus';
  if (activeSection === '3d-models') {
    return res.redirect(`/subjects/${category.slug}/module/interactive-modules`);
  }

  res.render('public/subject-section', {
    title: `${category.name} - ${activeSection.replace('-', ' ').toUpperCase()}`,
    category,
    interactiveData,
    notes,
    activeSection,
    activeFeatures
  });
};

exports.subjectCourseDetail = async (req, res) => {
  const category = await db.prepare(`SELECT * FROM categories WHERE slug = ?`).get(req.params.slug);
  if (!category) {
    req.flash('error', 'Subject not found.');
    return res.redirect('/subjects');
  }

  const requestedCourseId = req.query.courseId ? parseInt(req.query.courseId, 10) : null;
  const requestedCourseSlug = req.query.course || null;

  let dbCourse = null;
  if (requestedCourseId) {
    dbCourse = await db.prepare(`
      SELECT * FROM courses WHERE id = ? AND category_id = ? AND status = 'published'
    `).get(requestedCourseId, category.id);
  } else if (requestedCourseSlug) {
    dbCourse = await db.prepare(`
      SELECT * FROM courses WHERE slug = ? AND category_id = ? AND status = 'published'
    `).get(requestedCourseSlug, category.id);
  }

  if (!dbCourse) {
    dbCourse = await db.prepare(`
      SELECT * FROM courses WHERE category_id = ? AND status = 'published' ORDER BY id DESC LIMIT 1
    `).get(category.id);
  }

  const allCategoryCourses = await db.prepare(`
    SELECT c.*, u.name as instructor_name,
           (SELECT COUNT(*) FROM modules m WHERE m.course_id = c.id) as modules_count,
           (SELECT COUNT(*) FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.course_id = c.id) as lessons_count
    FROM courses c
    JOIN users u ON c.instructor_id = u.id
    WHERE c.category_id = ? AND c.status = 'published'
    ORDER BY c.created_at DESC
  `).all(category.id);

  let courseData = null;
  if (dbCourse) {
    const Course = require('../models/Course');
    const modules = await Course.getModulesWithLessons(dbCourse.id);
    courseData = {
      id: dbCourse.id,
      slug: dbCourse.slug,
      title: dbCourse.title,
      subtitle: dbCourse.subtitle || `${dbCourse.title} — Comprehensive Reading Notes`,
      course_type: dbCourse.course_type || 'video_hybrid',
      stats: {
        modulesCount: modules.length || 1,
        videoCount: dbCourse.course_type === 'pdf_document' ? 0 : 12,
        notesCount: modules.reduce((acc, m) => acc + (m.lessons ? m.lessons.length : 0), 0) || 1,
        threeDModelsCount: 4,
        clinicalCasesCount: 5,
        practiceQuestionsCount: 20
      },
      modules: (modules && modules.length > 0) ? modules.map((m, mIdx) => ({
        id: `mod-${m.id}`,
        number: mIdx + 1,
        title: m.title,
        description: m.description || '',
        lessons: (m.lessons || []).map((l, lIdx) => ({
          id: `l-${l.id}`,
          lesson_db_id: l.id,
          title: l.title,
          duration: `${l.duration_minutes || 30} mins`,
          type: dbCourse.course_type === 'pdf_document' ? 'pdf' : (l.type || 'video'),
          pdf_url: l.content && l.content.includes('[PDF_DOCUMENT:') ? l.content.match(/\[PDF_DOCUMENT:(.*?)\]/)[1] : null
        }))
      })) : [{
        id: 'mod-1',
        number: 1,
        title: 'Module 1: Complete Study Notes',
        description: 'Reading notes and syllabus documents.',
        lessons: [{ id: 'l-1', title: dbCourse.title, duration: '30 mins', type: dbCourse.course_type === 'pdf_document' ? 'pdf' : 'video' }]
      }]
    };
  }

  if (!courseData || !courseData.modules || courseData.modules.length === 0) {
    courseData = courseSystemData.getCourseForSubject(category.slug);
  }

  const activeTab = req.query.tab || 'modules';

  res.render('public/subject-course', {
    title: `${category.name} - Complete Structured Course`,
    category,
    courseData,
    dbCourse,
    allCategoryCourses: allCategoryCourses || [],
    activeTab
  });
};

exports.subjectLessonDetail = async (req, res) => {
  const category = await db.prepare(`SELECT * FROM categories WHERE slug = ?`).get(req.params.slug);
  if (!category) {
    req.flash('error', 'Subject not found.');
    return res.redirect('/subjects');
  }

  const dbCourse = await db.prepare(`
    SELECT * FROM courses WHERE category_id = ? AND status = 'published' ORDER BY id DESC LIMIT 1
  `).get(category.id);

  let courseData = null;
  if (dbCourse) {
    const Course = require('../models/Course');
    const modules = await Course.getModulesWithLessons(dbCourse.id);
    courseData = {
      id: dbCourse.id,
      slug: dbCourse.slug,
      title: dbCourse.title,
      subtitle: dbCourse.subtitle || `${dbCourse.title} — Comprehensive Study Notes`,
      course_type: dbCourse.course_type || 'video_hybrid',
      modules: (modules && modules.length > 0) ? modules.map((m, mIdx) => ({
        id: `mod-${m.id}`,
        number: mIdx + 1,
        title: m.title,
        description: m.description || '',
        lessons: (m.lessons || []).map((l, lIdx) => {
          let pdfUrl = l.content && l.content.includes('[PDF_DOCUMENT:') ? l.content.match(/\[PDF_DOCUMENT:(.*?)\]/)[1] : null;
          if (!pdfUrl && l.video_url && (l.video_url.endsWith('.pdf') || l.video_url.includes('/notes/'))) {
            pdfUrl = l.video_url;
          }
          return {
            id: `l-${l.id}`,
            lesson_db_id: l.id,
            title: l.title,
            duration: `${l.duration_minutes || 30} mins`,
            type: dbCourse.course_type === 'pdf_document' ? 'pdf' : (l.type || 'video'),
            pdf_url: pdfUrl,
            videoUrl: l.video_url || '',
            summary: l.content || dbCourse.description || 'Comprehensive reading notes & study material.',
            notesContent: l.content || dbCourse.description || ''
          };
        })
      })) : []
    };
  }

  if (!courseData || !courseData.modules || courseData.modules.length === 0) {
    courseData = courseSystemData.getCourseForSubject(category.slug);
  }

  const lessonId = req.params.lessonId;
  let currentModule = null;
  let currentLesson = null;
  let prevLesson = null;
  let nextLesson = null;

  const allLessons = [];
  courseData.modules.forEach(m => {
    (m.lessons || []).forEach(l => {
      allLessons.push({ module: m, lesson: l });
    });
  });

  const foundIndex = allLessons.findIndex(item => String(item.lesson.id) === String(lessonId) || String(item.lesson.lesson_db_id) === String(lessonId));
  if (foundIndex !== -1) {
    currentModule = allLessons[foundIndex].module;
    currentLesson = allLessons[foundIndex].lesson;
    if (foundIndex > 0) prevLesson = allLessons[foundIndex - 1].lesson;
    if (foundIndex < allLessons.length - 1) nextLesson = allLessons[foundIndex + 1].lesson;
  } else if (allLessons.length > 0) {
    currentModule = allLessons[0].module;
    currentLesson = allLessons[0].lesson;
    if (allLessons.length > 1) nextLesson = allLessons[1].lesson;
  }

  res.render('public/subject-lesson', {
    title: currentLesson ? currentLesson.title : `${category.name} Lesson`,
    category,
    courseData,
    dbCourse,
    currentModule,
    currentLesson,
    prevLesson,
    nextLesson
  });
};

exports.streamVideo = async (req, res) => {
  return videoService.handleStreamRequest(req, res, req.params.videoId);
};

exports.about = async (req, res) => {
  const sectionsOrder = await AboutSettings.getSectionsOrder();
  const aboutHero = await AboutSettings.getHero();
  const aboutPurpose = await AboutSettings.getPurpose();
  const aboutOnboarding = await AboutSettings.getOnboarding();
  const storyMilestones = await AboutSettings.getMilestones();
  let aboutStatements = await Team.aboutStatements();
  if (!aboutStatements || aboutStatements.length === 0) {
    aboutStatements = await db.prepare(`
      SELECT * FROM team_members 
      WHERE (group_name IN ('founding', 'the_face') OR show_on_about = 1) AND is_active = 1 
      ORDER BY display_order ASC, id ASC
    `).all();
  }
  if (!aboutStatements || aboutStatements.length === 0) {
    aboutStatements = [
      {
        id: 1,
        name: 'Dr. Heena Shaikh (PT)',
        role: 'Founder',
        designation: 'Founder & Director',
        qualification: 'BPT, MPT',
        photo: '/images/team/founder-1.png',
        statement: 'PhysioEdvance was born out of a genuine need to simplify physiotherapy education. Our mission, "Help students to help themselves," guides every single note, video, and resource we create. We aim to empower BPT students across India to learn independently, build strong clinical foundations, and excel in their exams and practice.'
      },
      {
        id: 2,
        name: 'Zainuddeen Nawaz',
        role: 'Co-Founder',
        designation: 'Co-Founder',
        qualification: 'Founding Member',
        photo: '/images/team/founder-2.png',
        statement: 'Building PhysioEdvance means creating a sustainable, compliant, and accessible digital home for physiotherapy learning. We are committed to maintaining the highest standards of academic integrity, technology, and user privacy for our growing student community.'
      },
      {
        id: 3,
        name: 'Dr. Neha Samapriya (PT)',
        role: 'Founding Member',
        designation: 'Founding Member & Lead Advisor',
        qualification: 'BPT, MPT',
        photo: '/images/team/founder-3.png',
        statement: 'Quality physiotherapy education requires bridging classroom theory with real-world clinical application. At PhysioEdvance, we curate evidence-informed content designed to clarify complex medical concepts and build true clinical confidence.'
      }
    ];
  }
  const visionMission = await SiteSettings.getVisionMission();
  const sectionTitles = await AboutSettings.getSectionTitles();

  console.log(`[About Controller] Rendering /about with ${aboutStatements.length} leadership statements and ${storyMilestones.length} milestones`);
  res.render('public/about', {
    title: 'About Us',
    sectionsOrder,
    sectionTitles,
    aboutHero,
    aboutPurpose,
    aboutOnboarding,
    storyMilestones,
    aboutStatements,
    visionMission
  });
};

exports.theTeam = async (req, res) => {
  const theFaceRaw = await db.prepare(`SELECT * FROM team_members WHERE (group_name IN ('the_face', 'founding') OR show_on_about = 1) AND is_active = 1 ORDER BY display_order ASC, id ASC`).all();
  const coreMembersRaw = await db.prepare(`SELECT * FROM team_members WHERE group_name IN ('core_members', 'teaching_staff', 'teaching', 'non_teaching_staff') AND is_active = 1 ORDER BY display_order ASC, id ASC`).all();
  const expertAdvisorsRaw = await db.prepare(`SELECT * FROM team_members WHERE group_name IN ('expert_advisors', 'subject_experts', 'advisory', 'technical_assistance', 'legal_business', 'other_staff') AND is_active = 1 ORDER BY display_order ASC, id ASC`).all();

  const foundingFallback = await Team.byGroup('founding');
  const advisoryFallback = await Team.byGroup('advisory');
  const legalFallback = await Team.byGroup('legal_business');
  const teachingFallback = await db.prepare(`SELECT * FROM team_members WHERE (group_name = 'teaching_staff' OR group_name = 'teaching') AND is_active = 1 ORDER BY display_order, id`).all();

  const theFace = (theFaceRaw && theFaceRaw.length > 0) ? theFaceRaw : (foundingFallback || []);
  const expertAdvisors = (expertAdvisorsRaw && expertAdvisorsRaw.length > 0) ? expertAdvisorsRaw : [...(advisoryFallback || []), ...(legalFallback || [])];
  const coreMembers = (coreMembersRaw && coreMembersRaw.length > 0) ? coreMembersRaw : (teachingFallback || []);

  res.render('public/the-team', {
    title: 'Team',
    theFace: theFace || [],
    coreMembers: coreMembers || [],
    expertAdvisors: expertAdvisors || []
  });
};

exports.blogIndex = async (req, res) => {
  const type = req.query.type;
  const posts = await Blog.published({ type });
  res.render('public/blog', { title: 'Blog', posts, filterType: type || '' });
};

exports.blogDetail = async (req, res) => {
  const post = await Blog.findBySlug(req.params.slug);
  if (!post) {
    req.flash('error', 'Post not found.');
    return res.redirect('/blog');
  }
  res.render('public/blog-detail', { title: post.title, post });
};

exports.liveSessions = async (req, res) => {
  const upcoming = await LiveSessions.upcoming();
  res.render('public/live-sessions', { title: 'Live Classes & Workshops', upcoming });
};

exports.registerForSession = async (req, res) => {
  if (!req.session.user) {
    req.flash('error', 'Please log in to register for live sessions.');
    return res.redirect('/auth/login');
  }
  await LiveSessions.register(req.params.id, req.session.user.id);
  req.flash('success', 'You are registered! Join link will be shared closer to the session.');
  res.redirect('/live-sessions');
};

exports.contact = (req, res) => {
  res.render('public/contact', { title: 'Contact Us' });
};

exports.submitContact = async (req, res) => {
  try {
    const { name, phone, email, message, request_type, service_type } = req.body;
    let fullMessage = message || '';
    const metaNotes = [];
    if (service_type) metaNotes.push(`Program: ${service_type}`);
    if (metaNotes.length > 0) {
      fullMessage = `[${metaNotes.join(' | ')}] ${fullMessage}`.trim();
    }

    await db.prepare(`
      INSERT INTO appointment_requests (name, phone, email, preferred_date, message, request_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(name, phone || 'Not Provided', email || null, null, fullMessage || null, request_type || 'contact');

    req.flash('success', "Thanks! We've received your request and will contact you shortly.");
  } catch (err) {
    req.flash('error', "Could not submit your request. Please try again or reach out on WhatsApp.");
  }
  res.redirect('/contact');
};

exports.submitAppointment = async (req, res) => {
  const { name, phone, email, preferred_date, message, request_type, service_type, academic_year } = req.body;
  let fullMessage = message || '';
  const metaNotes = [];
  if (service_type) metaNotes.push(`Service: ${service_type}`);
  if (academic_year) metaNotes.push(`Year/Subject: ${academic_year}`);
  if (metaNotes.length > 0) {
    fullMessage = `[${metaNotes.join(' | ')}] ${fullMessage}`.trim();
  }

  await db.prepare(`
    INSERT INTO appointment_requests (name, phone, email, preferred_date, message, request_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, phone, email || null, preferred_date || null, fullMessage || null, request_type || 'appointment');
  req.flash('success', "Thanks! We've received your request and will contact you shortly.");
  res.redirect('/');
};

exports.instructorProfile = async (req, res) => {
  const instructor = await db.prepare(`SELECT * FROM users WHERE id = ? AND role = 'instructor'`).get(req.params.id);
  if (!instructor) {
    req.flash('error', 'Instructor not found.');
    return res.redirect('/subjects');
  }
  const allCourses = await Course.byInstructor(instructor.id);
  const courses = allCourses.filter(c => c.status === 'published');
  res.render('public/instructor-profile', { title: instructor.name, instructor, courses });
};

exports.learningModules = async (req, res) => {
  const allCategories = await Course.countCoursesByCategory();
  const categoriesByYear = { 1: [], 2: [], 3: [], 4: [] };
  const otherSubjects = [];
  allCategories.forEach(cat => {
    if (cat.year) categoriesByYear[cat.year].push(cat);
    else otherSubjects.push(cat);
  });
  const filterType = req.query.type || 'all';

  res.render('public/learning-modules', {
    title: 'Learning Modules — MCQs, Large & Small Q&A',
    allCategories,
    categoriesByYear,
    otherSubjects,
    SUBJECT_ABBREVIATIONS,
    filterType
  });
};

exports.learningModuleDetail = async (req, res) => {
  const slug = req.params.slug;
  const category = await db.prepare(`SELECT * FROM categories WHERE slug = ?`).get(slug);
  if (!category) {
    req.flash('error', 'Subject not found in Learning Modules.');
    return res.redirect('/learning-modules');
  }

  const baseLearningData = getSubjectLearningData(slug, category.name, category.year);
  const activeTab = req.params.type || req.query.tab || 'mcq';

  // Fetch dynamic DB questions & documents
  const dbQuestions = await LearningModule.getQuestionsForCategory(category.id, slug);
  const dbDocuments = await LearningModule.getDocumentsForCategory(category.id);

  // Transform DB MCQs
  const dbMcqs = dbQuestions.filter(q => q.question_type === 'mcq').map(q => {
    let opts = [];
    try { opts = JSON.parse(q.options_json); } catch(e) {}
    return {
      id: q.id,
      question: q.question,
      options: Array.isArray(opts) && opts.length > 0 ? opts : ['Option A', 'Option B', 'Option C', 'Option D'],
      correct: q.correct_option || 0,
      explanation: q.explanation || 'Refer to subject curriculum notes for clinical rationale.',
      difficulty: q.difficulty || 'Medium',
      topic: q.topic || category.name
    };
  });

  // Transform DB Large Q&As
  const dbLargeQa = dbQuestions.filter(q => q.question_type === 'large_qa').map(q => ({
    id: `db-lq-${q.id}`,
    title: q.title || `Clinical Case & Long Essay Question #${q.id}`,
    marks: q.marks || 15,
    question: q.question,
    modelAnswer: {
      introduction: q.title ? `Detailed analysis and clinical evaluation for ${q.title}.` : 'Clinical model answer framework.',
      sections: [
        {
          heading: 'Model Answer & Clinical Plan',
          content: q.model_answer || 'Complete answer available in subject curriculum notes.'
        }
      ]
    },
    document_url: q.document_url
  }));

  // Transform DB Small Q&As
  const dbSmallQa = dbQuestions.filter(q => q.question_type === 'small_qa').map(q => ({
    id: `db-sq-${q.id}`,
    title: q.title || `Short Note #${q.id}`,
    marks: q.marks || 5,
    question: q.question,
    answer: q.model_answer || 'Refer to subject notes for full explanation.',
    document_url: q.document_url
  }));

  const learningData = {
    ...baseLearningData,
    mcqs: [...dbMcqs, ...baseLearningData.mcqs],
    largeQA: [...dbLargeQa, ...baseLearningData.largeQA],
    smallQA: [...dbSmallQa, ...baseLearningData.smallQA],
    documents: dbDocuments
  };

  // Get related subjects for quick switching
  const allCategories = await Course.countCoursesByCategory();
  const yearSubjects = allCategories.filter(c => c.year === category.year && c.slug !== slug);

  res.render('public/learning-module-detail', {
    title: `${category.name} — Learning Module (MCQs, Large & Small Q&A)`,
    category,
    learningData,
    activeTab,
    yearSubjects,
    SUBJECT_ABBREVIATIONS
  });
};

exports.liveDiscussion = async (req, res) => {
  const { category, year, q, topic } = req.query;
  const categories = await db.prepare("SELECT * FROM categories WHERE COALESCE(is_deleted, 0) = 0 ORDER BY CASE WHEN year > 0 THEN year ELSE 99 END ASC, name ASC").all();
  const discussions = await LiveDiscussion.all({
    category: 'all',
    search: q || null,
    activeOnly: true
  });
  const headerSettings = await SiteSettings.getLiveDiscussionSettings();
  res.render('public/live-discussion', {
    title: `${headerSettings.title || 'Live Discussion'} — PhysioEdvance`,
    discussions,
    categories: categories || [],
    selectedCategory: category || 'all',
    selectedYear: year || 'all',
    selectedTopic: topic || 'all',
    headerSettings,
    YEAR_SUBJECTS,
    OTHER_SUBJECTS
  });
};

exports.viewSingleDiscussion = async (req, res) => {
  try {
    const disId = parseInt(req.params.id, 10);
    if (isNaN(disId)) {
      return res.status(404).render('public/404', { title: 'Discussion Not Found' });
    }

    const discussion = await LiveDiscussion.findById(disId);
    if (!discussion) {
      return res.status(404).render('public/404', { title: 'Discussion Not Found' });
    }

    const categories = await db.prepare("SELECT * FROM categories WHERE COALESCE(is_deleted, 0) = 0 ORDER BY CASE WHEN year > 0 THEN year ELSE 99 END ASC, name ASC").all();
    const headerSettings = await SiteSettings.getLiveDiscussionSettings();

    const categoryMeta = (categories || []).find(c => c.slug === discussion.category) || null;

    res.render('public/discussion-single', {
      title: `${discussion.title} — Live Discussion | PhysioEdvance`,
      discussion,
      categoryMeta,
      categories: categories || [],
      headerSettings,
      YEAR_SUBJECTS,
      OTHER_SUBJECTS
    });
  } catch (err) {
    console.error('Error rendering single discussion card:', err);
    res.status(500).render('public/500', { error: err.message });
  }
};

exports.addDiscussionReply = async (req, res) => {
  try {
    const { discussion_id, parent_id, author_name, author_role, content } = req.body;
    const user = req.session ? req.session.user : null;

    if (!content || !content.trim()) {
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
        return res.status(400).json({ success: false, message: 'Reply content cannot be empty.' });
      }
      req.flash('error', 'Reply content cannot be empty.');
      return res.redirect('/live-discussion');
    }

    const author = user ? user.name : (author_name || 'Anonymous Peer');
    const role = user ? (user.role === 'admin' || user.role === 'superadmin' ? 'Faculty Moderator' : (user.role === 'instructor' ? 'Mentor / Instructor' : 'Student Member')) : (author_role || 'Physiotherapy Student');
    const isMentor = user && (user.role === 'admin' || user.role === 'superadmin' || user.role === 'instructor') ? 1 : 0;

    const newReply = await LiveDiscussion.addReply(discussion_id, {
      userId: user ? user.id : null,
      authorName: author,
      authorRole: role,
      content: content.trim(),
      isMentor,
      parentId: parent_id ? parseInt(parent_id, 10) : null
    });

    const disc = await LiveDiscussion.findById(discussion_id);

    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
      return res.json({
        success: true,
        reply: newReply,
        totalRepliesCount: disc ? (disc.replies_count || 0) : 0,
        message: 'Your reply has been posted!'
      });
    }

    req.flash('success', 'Your clinical reply was posted to the discussion.');
  } catch (err) {
    console.error('Error posting reply:', err);
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
      return res.status(500).json({ success: false, message: err.message || 'Failed to post reply.' });
    }
    req.flash('error', 'Failed to post reply.');
  }
  res.redirect('/live-discussion');
};

exports.voteReply = async (req, res) => {
  try {
    const { action, previousState } = req.body;
    const result = await LiveDiscussion.voteReply(req.params.id, { action, previousState });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('Error voting reply:', err);
    return res.status(500).json({ success: false, message: 'Failed to vote reply.' });
  }
};

exports.upvoteReply = async (req, res) => {
  try {
    const action = req.body && req.body.action ? req.body.action : 'like';
    const previousState = req.body && req.body.previousState ? req.body.previousState : 'none';
    const result = await LiveDiscussion.voteReply(req.params.id, { action, previousState });
    return res.json({ success: true, upvotes: result.upvotes, downvotes: result.downvotes });
  } catch (err) {
    console.error('Error upvoting reply:', err);
    return res.status(500).json({ success: false, message: 'Failed to upvote reply.' });
  }
};

exports.createDiscussion = async (req, res) => {
  try {
    const user = req.session ? req.session.user : null;
    const PermissionService = require('../services/permissionService');

    const canStartDiscussion = user && (
      ['admin', 'superadmin'].includes(user.role) ||
      PermissionService.hasModulePermissionSync(user, 'MODULE_LIVE_DISCUSSION') ||
      PermissionService.hasPermissionSync(user, 'CASE_DISCUSSION', 'CREATE') ||
      PermissionService.hasPermissionSync(user, 'CASE_DISCUSSION', 'EDIT')
    );

    if (!canStartDiscussion) {
      req.flash('error', 'You do not have permission to start new subject discussions.');
      return res.redirect('/live-discussion');
    }

    const { category, tag_label, title, summary, questions, takeaway, author_name, author_role } = req.body;
    const author = user ? user.name : (author_name || 'Community Clinician');
    const role = user ? (user.role === 'admin' || user.role === 'superadmin' ? 'Faculty Lead' : (user.role === 'instructor' ? 'Course Instructor' : 'Physio Student / Intern')) : (author_role || 'Physiotherapy Scholar');

    await LiveDiscussion.create({
      category: category || 'orthopedics',
      tag_label: tag_label || 'Clinical Case Round',
      title: (title || '').trim(),
      summary: (summary || '').trim(),
      questions: (questions || '').trim(),
      takeaway: takeaway ? takeaway.trim() : null,
      author_name: author,
      author_role: role,
      author_id: user ? user.id : null,
      is_active: 1,
      is_pinned: 0
    });

    req.flash('success', 'Your discussion topic has been published successfully!');
  } catch (err) {
    console.error('Error starting discussion:', err);
    req.flash('error', 'Failed to publish discussion topic.');
  }
  res.redirect('/live-discussion');
};

exports.voteDiscussion = async (req, res) => {
  try {
    const { action, previousState } = req.body;
    const result = await LiveDiscussion.vote(req.params.id, { action, previousState });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('Error voting discussion:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.upvoteDiscussion = async (req, res) => {
  try {
    const action = req.body && req.body.action ? req.body.action : 'like';
    const previousState = req.body && req.body.previousState ? req.body.previousState : 'none';
    const result = await LiveDiscussion.vote(req.params.id, { action, previousState });
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
      return res.json({ success: true, upvotes: result.upvotes, downvotes: result.downvotes });
    }
  } catch (err) {
    console.error('Error upvoting discussion:', err);
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
  res.redirect('/live-discussion');
};

exports.privacyPolicy = async (req, res) => {
  res.render('public/privacy-policy', {
    title: 'Privacy Policy — PhysioEdvance'
  });
};

exports.termsOfUse = async (req, res) => {
  res.render('public/terms-of-use', {
    title: 'Terms of Use — PhysioEdvance'
  });
};

