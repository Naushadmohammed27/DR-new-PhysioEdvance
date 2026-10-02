const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAuth, requireRole, requireSuperAdmin, requirePermission } = require('../middleware/auth');
const { uploadDocFile, uploadCourseThumbnail, uploadTeamPhoto } = require('../middleware/upload');

// Base admin access: role must be 'admin' or 'superadmin'
router.use(requireAuth, requireRole('admin'));

router.get('/dashboard', adminController.dashboard);
router.get('/profile', adminController.profile);

// ==========================================
// SUPER ADMIN EXCLUSIVE ROUTES
// ==========================================
router.get('/admins', requireSuperAdmin, adminController.adminsIndex);
router.get('/admins/new', requireSuperAdmin, adminController.newAdminView);
router.post('/admins', requireSuperAdmin, adminController.createAdmin);
router.get('/admins/:id', requireSuperAdmin, adminController.userDetail);
router.get('/admins/:id/permissions', requireSuperAdmin, adminController.adminPermissionsView);
router.post('/admins/:id/permissions', requireSuperAdmin, adminController.updateAdminPermissions);
router.post('/admins/:id/toggle-status', requireSuperAdmin, adminController.toggleAdminStatus);

router.get('/instructors', requireSuperAdmin, adminController.instructorsIndex);
router.get('/instructors/:id/permissions', requireSuperAdmin, adminController.instructorPermissionsView);
router.post('/instructors/:id/permissions', requireSuperAdmin, adminController.updateInstructorPermissions);

router.get('/audit-logs', requireSuperAdmin, adminController.auditLogsIndex);
router.post('/content-access/assign', requirePermission('COURSE', 'ASSIGN'), adminController.assignContentAccess);

// ==========================================
// COURSES & SUBJECTS
// ==========================================
router.get('/courses', requirePermission('COURSE', 'VIEW'), adminController.courses);
router.post('/courses/:id/toggle-featured', requirePermission('COURSE', 'EDIT'), adminController.toggleFeatured);
router.post('/courses/:id/toggle-status', requirePermission('COURSE', 'PUBLISH'), adminController.toggleStatus);
router.post('/courses/:id/delete', requirePermission('COURSE', 'DELETE'), adminController.deleteCourse);
router.post('/courses/:id/restore', requirePermission('COURSE', 'DELETE'), adminController.restoreCourse);
router.post('/courses/:id/permanent-delete', requirePermission('COURSE', 'DELETE'), adminController.permanentDeleteCourse);

router.get('/categories', requirePermission('SUBJECT', 'VIEW'), adminController.categories);
router.get('/categories/:id/courses', requirePermission('SUBJECT', 'VIEW'), adminController.subjectCourses);
router.get('/categories/:id', requirePermission('SUBJECT', 'VIEW'), adminController.subjectCourses);
router.post('/categories', requirePermission('SUBJECT', 'CREATE'), adminController.addCategory);
router.post('/categories/:id/edit', requirePermission('SUBJECT', 'EDIT'), adminController.updateCategory);
router.post('/categories/:id/update', requirePermission('SUBJECT', 'EDIT'), adminController.updateCategory);
router.post('/categories/:id/delete', requirePermission('SUBJECT', 'DELETE'), adminController.deleteCategory);
router.post('/categories/:id/restore', requirePermission('SUBJECT', 'DELETE'), adminController.restoreCategory);
router.post('/categories/:id/permanent-delete', requirePermission('SUBJECT', 'DELETE'), adminController.permanentDeleteCategory);

// ==========================================
// USER MANAGEMENT
// ==========================================
router.get('/users', requirePermission('USER', 'VIEW'), adminController.users);
router.post('/users', requirePermission('USER', 'CREATE'), adminController.createUser);
router.post('/users/create', requirePermission('USER', 'CREATE'), adminController.createUser);
router.get('/users/:id', requirePermission('USER', 'VIEW'), adminController.userDetail);
router.post('/users/:id/edit', requirePermission('USER', 'EDIT'), adminController.updateUser);
router.post('/users/:id/update', requirePermission('USER', 'EDIT'), adminController.updateUser);
router.post('/users/:id/toggle-active', requirePermission('USER', 'TOGGLE_STATUS'), adminController.toggleUserActive);
router.post('/users/:id/delete', requirePermission('USER', 'DELETE'), adminController.deleteUser);
router.post('/users/:id/restore', requirePermission('USER', 'DELETE'), adminController.restoreUser);
router.post('/users/:id/permanent-delete', requirePermission('USER', 'DELETE'), adminController.permanentDeleteUser);
router.post('/users/:id/reset-password', requirePermission('USER', 'EDIT'), adminController.resetUserPassword);
router.post('/users/:id/send-sms-reminder', requirePermission('USER', 'EDIT'), adminController.sendStudentSmsReminder);
router.post('/users/:id/extend-enrollment', requirePermission('USER', 'EDIT'), adminController.extendStudentEnrollment);
router.post('/users/:id/enroll', requirePermission('USER', 'EDIT'), adminController.enrollStudent);

// ==========================================
// BLOG MANAGEMENT
// ==========================================
router.get('/blog', requirePermission('BLOG', 'VIEW'), adminController.blogIndex);
router.post('/blog', requirePermission('BLOG', 'CREATE'), adminController.addBlogPost);
router.post('/blog/:id/delete', requirePermission('BLOG', 'DELETE'), adminController.deleteBlogPost);

// ==========================================
// LIVE SESSIONS / WEBINARS
// ==========================================
router.get('/live-sessions', requirePermission('LIVE_CLASS', 'VIEW'), adminController.liveSessionsIndex);
router.post('/live-sessions', requirePermission('LIVE_CLASS', 'CREATE'), adminController.createLiveSession);
router.post('/live-sessions/:id/delete', requirePermission('LIVE_CLASS', 'DELETE'), adminController.deleteLiveSession);
router.post('/live-sessions/:id/notify', requirePermission('LIVE_CLASS', 'SCHEDULE'), adminController.notifyRegistrants);

// ==========================================
// CASE DISCUSSIONS & LEARNING MODULES
// ==========================================
const handleNoteUpload = (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    uploadDocFile.single('note_file')(req, res, (err) => {
      if (err) {
        console.warn("File upload notice:", err.message);
      }
      next();
    });
  } else {
    next();
  }
};

router.get('/learning-modules', requirePermission('CASE_DISCUSSION', 'VIEW'), adminController.learningModulesIndex);
router.get('/learning-modules/new', requirePermission('CASE_DISCUSSION', 'CREATE'), adminController.newLearningModuleQuestion);
router.post('/learning-modules', requirePermission('CASE_DISCUSSION', 'CREATE'), handleNoteUpload, adminController.createLearningModuleQuestion);
router.post('/learning-modules/bulk', requirePermission('CASE_DISCUSSION', 'CREATE'), adminController.createBulkQuestions);
router.get('/learning-modules/:id/edit', requirePermission('CASE_DISCUSSION', 'EDIT'), adminController.editLearningModuleQuestion);
router.post('/learning-modules/:id/update', requirePermission('CASE_DISCUSSION', 'EDIT'), handleNoteUpload, adminController.updateLearningModuleQuestion);
router.post('/learning-modules/:id/toggle', requirePermission('CASE_DISCUSSION', 'PUBLISH'), adminController.toggleLearningModuleQuestion);
router.post('/learning-modules/:id/delete', requirePermission('CASE_DISCUSSION', 'DELETE'), adminController.deleteLearningModuleQuestion);
router.post('/learning-modules/:id/restore', requirePermission('CASE_DISCUSSION', 'DELETE'), adminController.restoreLearningModuleQuestion);
router.post('/learning-modules/:id/permanent-delete', requirePermission('CASE_DISCUSSION', 'DELETE'), adminController.permanentDeleteLearningModuleQuestion);

router.post('/learning-modules/upload-doc', requirePermission('CASE_DISCUSSION', 'CREATE'), handleNoteUpload, adminController.uploadLearningModuleDoc);
router.post('/learning-modules/doc/:id/delete', requirePermission('CASE_DISCUSSION', 'DELETE'), adminController.deleteLearningModuleDoc);

// ==========================================
// LIVE DISCUSSIONS (CLINICAL CASE ROUNDS)
// ==========================================
router.get('/live-discussions', requirePermission('CASE_DISCUSSION', 'VIEW'), adminController.liveDiscussionsIndex);
router.post('/live-discussions/settings', requirePermission('SETTINGS', 'EDIT'), adminController.updateLiveDiscussionSettings);
router.post('/live-discussions', requirePermission('CASE_DISCUSSION', 'CREATE'), adminController.createLiveDiscussion);
router.post('/live-discussions/:id/update', requirePermission('CASE_DISCUSSION', 'EDIT'), adminController.updateLiveDiscussion);
router.post('/live-discussions/:id/toggle-active', requirePermission('CASE_DISCUSSION', 'EDIT'), adminController.toggleLiveDiscussionActive);
router.post('/live-discussions/:id/toggle-pin', requirePermission('CASE_DISCUSSION', 'EDIT'), adminController.toggleLiveDiscussionPin);
router.post('/live-discussions/:id/delete', requirePermission('CASE_DISCUSSION', 'DELETE'), adminController.deleteLiveDiscussion);

// Notes / Study Materials
router.get('/notes', requirePermission('COURSE', 'VIEW'), adminController.notesIndex);
router.post('/notes', requirePermission('COURSE', 'CREATE'), handleNoteUpload, adminController.createNote);
router.post('/notes/:id/delete', requirePermission('COURSE', 'DELETE'), adminController.deleteNote);

// Orders / Enrollments
router.get('/orders', requirePermission('USER', 'VIEW'), adminController.orders);
router.post('/orders/:id/delete', requirePermission('USER', 'DELETE'), adminController.deleteOrder);
router.post('/orders/:id/restore', requirePermission('USER', 'DELETE'), adminController.restoreOrder);
router.post('/orders/:id/permanent-delete', requirePermission('USER', 'DELETE'), adminController.permanentDeleteOrder);

// Appointments
router.get('/appointments', requirePermission('USER', 'VIEW'), adminController.appointmentsIndex);
router.post('/appointments/:id/status', requirePermission('USER', 'EDIT'), adminController.updateAppointmentStatus);

// ==========================================
// HOMEPAGE & PLATFORM SETTINGS
// ==========================================
const handleHeroImageUpload = (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    uploadCourseThumbnail.single('hero_image')(req, res, (err) => {
      if (err) {
        console.warn("Hero image upload notice:", err.message);
      }
      next();
    });
  } else {
    next();
  }
};

router.get('/hero', requirePermission('SETTINGS', 'VIEW'), adminController.heroSectionIndex);
router.post('/hero', requirePermission('SETTINGS', 'EDIT'), handleHeroImageUpload, adminController.updateHeroSection);

router.get('/features', requirePermission('SETTINGS', 'VIEW'), adminController.heroFeaturesIndex);
router.post('/features', requirePermission('SETTINGS', 'EDIT'), adminController.addHeroFeature);
router.get('/features/:id/edit', requirePermission('SETTINGS', 'EDIT'), adminController.editHeroFeature);
router.post('/features/:id/update', requirePermission('SETTINGS', 'EDIT'), adminController.updateHeroFeature);
router.post('/features/:id/delete', requirePermission('SETTINGS', 'EDIT'), adminController.deleteHeroFeature);

router.get('/curriculum', requirePermission('SETTINGS', 'VIEW'), adminController.curriculumIndex);
router.post('/curriculum/settings', requirePermission('SETTINGS', 'EDIT'), adminController.updateCurriculumSettings);
router.post('/curriculum/cards', requirePermission('SETTINGS', 'EDIT'), adminController.addCurriculumCard);
router.post('/curriculum/cards/:id/update', requirePermission('SETTINGS', 'EDIT'), adminController.updateCurriculumCard);
router.post('/curriculum/cards/:id/delete', requirePermission('SETTINGS', 'EDIT'), adminController.deleteCurriculumCard);
router.post('/curriculum/cards/:id/move-up', requirePermission('SETTINGS', 'EDIT'), adminController.moveUpCurriculumCard);
router.post('/curriculum/cards/:id/move-down', requirePermission('SETTINGS', 'EDIT'), adminController.moveDownCurriculumCard);

router.get('/learning-journey', requirePermission('SETTINGS', 'VIEW'), adminController.learningJourneyIndex);
router.post('/learning-journey/settings', requirePermission('SETTINGS', 'EDIT'), adminController.updateLearningJourneySettings);
router.post('/learning-journey/cards', requirePermission('SETTINGS', 'EDIT'), adminController.addLearningJourneyCard);
router.post('/learning-journey/cards/:id/update', requirePermission('SETTINGS', 'EDIT'), adminController.updateLearningJourneyCard);
router.post('/learning-journey/cards/:id/delete', requirePermission('SETTINGS', 'EDIT'), adminController.deleteLearningJourneyCard);
router.post('/learning-journey/cards/:id/move-up', requirePermission('SETTINGS', 'EDIT'), adminController.moveUpLearningJourneyCard);
router.post('/learning-journey/cards/:id/move-down', requirePermission('SETTINGS', 'EDIT'), adminController.moveDownLearningJourneyCard);

router.get('/homepage-sections', requirePermission('SETTINGS', 'VIEW'), adminController.homepageSectionsIndex);
router.post('/homepage-sections/:id/update', requirePermission('SETTINGS', 'EDIT'), adminController.updateHomepageSection);
router.post('/homepage-sections/:id/toggle', requirePermission('SETTINGS', 'EDIT'), adminController.toggleHomepageSection);
router.post('/homepage-sections/:id/move-up', requirePermission('SETTINGS', 'EDIT'), adminController.moveUpHomepageSection);
router.post('/homepage-sections/:id/move-down', requirePermission('SETTINGS', 'EDIT'), adminController.moveDownHomepageSection);

router.get('/vision-mission', requirePermission('SETTINGS', 'VIEW'), adminController.visionMissionIndex);
router.post('/vision-mission', requirePermission('SETTINGS', 'EDIT'), adminController.updateVisionMission);

router.get('/cta', requirePermission('SETTINGS', 'VIEW'), adminController.ctaIndex);
router.post('/cta', requirePermission('SETTINGS', 'EDIT'), adminController.updateCta);

router.get('/specialties', requirePermission('SETTINGS', 'VIEW'), adminController.specialtiesIndex);
router.post('/specialties', requirePermission('SETTINGS', 'EDIT'), adminController.addSpecialty);
router.get('/specialties/:id/edit', requirePermission('SETTINGS', 'EDIT'), adminController.editSpecialty);
router.post('/specialties/:id/update', requirePermission('SETTINGS', 'EDIT'), adminController.updateSpecialty);
router.post('/specialties/:id/toggle', requirePermission('SETTINGS', 'EDIT'), adminController.toggleSpecialty);
router.post('/specialties/:id/delete', requirePermission('SETTINGS', 'EDIT'), adminController.deleteSpecialty);

router.get('/team', requirePermission('SETTINGS', 'VIEW'), adminController.teamIndex);
router.get('/team/new', requirePermission('SETTINGS', 'EDIT'), adminController.newTeamMember);
router.post('/team/toggle-groups', requirePermission('SETTINGS', 'EDIT'), adminController.toggleTeamGroups);
router.post('/team', requirePermission('SETTINGS', 'EDIT'), uploadTeamPhoto.single('photo_file'), adminController.addTeamMember);
router.get('/team/:id/edit', requirePermission('SETTINGS', 'EDIT'), adminController.editTeamMember);
router.post('/team/:id/update', requirePermission('SETTINGS', 'EDIT'), uploadTeamPhoto.single('photo_file'), adminController.updateTeamMember);
router.get('/team/:id/toggle-about', requirePermission('SETTINGS', 'EDIT'), adminController.toggleAboutShow);
router.post('/team/:id/toggle-about', requirePermission('SETTINGS', 'EDIT'), adminController.toggleAboutShow);
router.get('/team/:id/toggle-active', requirePermission('SETTINGS', 'EDIT'), adminController.toggleTeamMemberActive);
router.post('/team/:id/toggle-active', requirePermission('SETTINGS', 'EDIT'), adminController.toggleTeamMemberActive);
router.post('/team/:id/reorder', requirePermission('SETTINGS', 'EDIT'), adminController.reorderTeamMember);
router.post('/team/:id/delete', requirePermission('SETTINGS', 'EDIT'), adminController.deleteTeamMember);

// ==========================================
// ABOUT US PAGE CMS
// ==========================================
router.get('/about-cms', requirePermission('SETTINGS', 'VIEW'), adminController.aboutCmsIndex);
router.post('/about-cms/sections/:secKey/move-up', requirePermission('SETTINGS', 'EDIT'), adminController.moveAboutSectionUp);
router.post('/about-cms/sections/:secKey/move-down', requirePermission('SETTINGS', 'EDIT'), adminController.moveAboutSectionDown);
router.post('/about-cms/section-titles', requirePermission('SETTINGS', 'EDIT'), adminController.updateAboutSectionTitles);
router.post('/about-cms/hero', requirePermission('SETTINGS', 'EDIT'), adminController.updateAboutHero);
router.post('/about-cms/purpose', requirePermission('SETTINGS', 'EDIT'), adminController.updateAboutPurpose);
router.post('/about-cms/onboarding', requirePermission('SETTINGS', 'EDIT'), adminController.updateAboutOnboarding);
router.post('/about-cms/milestones/new', requirePermission('SETTINGS', 'EDIT'), adminController.addAboutMilestone);
router.post('/about-cms/milestones/add', requirePermission('SETTINGS', 'EDIT'), adminController.addAboutMilestone);
router.post('/about-cms/milestones/:id/update', requirePermission('SETTINGS', 'EDIT'), adminController.updateAboutMilestone);
router.post('/about-cms/milestones/:id/delete', requirePermission('SETTINGS', 'EDIT'), adminController.deleteAboutMilestone);
router.post('/about-cms/milestones/:id/move-up', requirePermission('SETTINGS', 'EDIT'), adminController.moveAboutMilestoneUp);
router.post('/about-cms/milestones/:id/move-down', requirePermission('SETTINGS', 'EDIT'), adminController.moveAboutMilestoneDown);

// ==========================================
// CONTACT PAGE CMS
// ==========================================
router.get('/contact-cms', requirePermission('SETTINGS', 'VIEW'), adminController.contactCmsIndex);
router.post('/contact-cms', requirePermission('SETTINGS', 'EDIT'), adminController.updateContactCms);



// ==========================================
// SUBJECT INTERACTIVE HUB GRID CMS
// ==========================================
router.get('/subject-hub-grid', requirePermission('SETTINGS', 'VIEW'), adminController.subjectHubGridIndex);
router.post('/subject-hub-grid/:id/update', requirePermission('SETTINGS', 'EDIT'), adminController.updateSubjectHubBlock);
router.post('/subject-hub-grid/:id/move-up', requirePermission('SETTINGS', 'EDIT'), adminController.moveSubjectHubBlockUp);
router.post('/subject-hub-grid/:id/move-down', requirePermission('SETTINGS', 'EDIT'), adminController.moveSubjectHubBlockDown);

module.exports = router;

