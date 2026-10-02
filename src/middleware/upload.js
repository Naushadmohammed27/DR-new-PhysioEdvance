const fs = require('fs');
const path = require('path');
const multer = require('multer');

const AVATAR_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const VIDEO_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'lessons');
fs.mkdirSync(VIDEO_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATAR_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    cb(null, `user-${req.session.user.id}-${Date.now()}${safeExt}`);
  }
});

function imageFileFilter(req, file, cb) {
  const allowed = /jpeg|jpg|png|webp|gif/;
  const isAllowed = allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype);
  if (isAllowed) return cb(null, true);
  cb(new Error('Only image files (jpg, png, webp, gif) are allowed.'));
}

const uploadAvatar = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: imageFileFilter
});

const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, VIDEO_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.mp4').toLowerCase();
    const safeExt = ['.mp4', '.webm', '.ogg'].includes(ext) ? ext : '.mp4';
    cb(null, `lesson-${Date.now()}-${Math.round(Math.random() * 1e6)}${safeExt}`);
  }
});

function videoFileFilter(req, file, cb) {
  const allowed = /mp4|webm|ogg/;
  const isAllowed = allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype);
  if (isAllowed) return cb(null, true);
  cb(new Error('Only video files (mp4, webm, ogg) are allowed.'));
}

const uploadLessonVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  fileFilter: videoFileFilter
});

const COURSE_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'courses');
fs.mkdirSync(COURSE_DIR, { recursive: true });

const courseStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, COURSE_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    cb(null, `course-${Date.now()}-${Math.round(Math.random() * 1e6)}${safeExt}`);
  }
});

const uploadCourseThumbnail = multer({
  storage: courseStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFileFilter
});

const NOTES_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'notes');
fs.mkdirSync(NOTES_DIR, { recursive: true });

const wizardStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname.startsWith('video_file')) {
      cb(null, VIDEO_DIR);
    } else if (file.fieldname.startsWith('pdf_file') || file.fieldname.startsWith('note_file') || file.fieldname.startsWith('doc_file')) {
      cb(null, NOTES_DIR);
    } else {
      cb(null, COURSE_DIR);
    }
  },
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase();
    if (file.fieldname.startsWith('video_file')) {
      const safeExt = ['.mp4', '.webm', '.ogg'].includes(ext) ? ext : '.mp4';
      cb(null, `lesson-${Date.now()}-${Math.round(Math.random() * 1e6)}${safeExt}`);
    } else if (file.fieldname.startsWith('pdf_file') || file.fieldname.startsWith('note_file') || file.fieldname.startsWith('doc_file')) {
      const safeExt = ext || '.pdf';
      cb(null, `note-${Date.now()}-${Math.round(Math.random() * 1e6)}${safeExt}`);
    } else {
      const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
      cb(null, `course-${Date.now()}-${Math.round(Math.random() * 1e6)}${safeExt}`);
    }
  }
});

const uploadWizardFiles = multer({
  storage: wizardStorage,
  limits: { fileSize: 250 * 1024 * 1024 }
});

const uploadDocFile = multer({
  storage: wizardStorage,
  limits: { fileSize: 100 * 1024 * 1024 }
});

// ── Team member photo upload ──────────────────────────────────────────────────
const TEAM_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'team');
fs.mkdirSync(TEAM_DIR, { recursive: true });

const teamPhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TEAM_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    const id = req.params.id || 'new';
    cb(null, `team-${id}-${Date.now()}${safeExt}`);
  }
});

const uploadTeamPhoto = multer({
  storage: teamPhotoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: imageFileFilter
});

module.exports = { uploadAvatar, uploadLessonVideo, uploadCourseThumbnail, uploadWizardFiles, uploadDocFile, uploadTeamPhoto };
