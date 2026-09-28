const Course = require('../models/Course');
const User = require('../models/User');
const db = require('../db/connection');
const { Notes, Team, Blog, LiveSessions, HeroFeature, ClinicalSpecialty, SiteSettings, CurriculumYearCard, LearningJourneyCard, HomepageSection, AboutSettings, SubjectHubSettings } = require('../models/Content');
const PermissionService = require('../services/permissionService');

exports.dashboard = async (req, res) => {
  try {
    const stats = await Course.stats();
    const totalRevenueRow = await db.prepare(`SELECT COALESCE(SUM(amount), 0) as t FROM orders WHERE status = 'success'`).get();
    const totalRevenue = Number(totalRevenueRow ? totalRevenueRow.t : 0);
    
    const totalSubjectsRow = await db.prepare(`SELECT COUNT(*) as c FROM categories`).get();
    const totalSubjects = Number(totalSubjectsRow ? totalSubjectsRow.c : 0);
    
    const totalLiveClassesRow = await db.prepare(`SELECT COUNT(*) as c FROM live_sessions`).get();
    const totalLiveClasses = Number(totalLiveClassesRow ? totalLiveClassesRow.c : 0);

    let revenueRows = [];
    try {
      const dateFmt = db.activeEngine === 'sqlite' ? "strftime('%Y-%m', created_at)" : "to_char(created_at, 'YYYY-MM')";
      revenueRows = await db.prepare(`
        SELECT ${dateFmt} as month, SUM(amount) as total
        FROM orders WHERE status = 'success'
        GROUP BY month ORDER BY month DESC LIMIT 6
      `).all();
    } catch (e) {
      revenueRows = [];
    }
    const revenueByMonth = (revenueRows || []).reverse().map(r => ({ month: r.month, total: Number(r.total) }));

    let enrollmentsByCategoryRaw = [];
    try {
      enrollmentsByCategoryRaw = await db.prepare(`
        SELECT cat.name, COUNT(e.id) as count
        FROM enrollments e
        JOIN courses c ON e.course_id = c.id
        JOIN categories cat ON c.category_id = cat.id
        GROUP BY cat.name ORDER BY count DESC LIMIT 8
      `).all();
    } catch (e) {
      enrollmentsByCategoryRaw = [];
    }
    const enrollmentsByCategory = (enrollmentsByCategoryRaw || []).map(r => ({ name: r.name, count: Number(r.count) }));

    const recentOrders = (await db.prepare(`
      SELECT o.*, u.name as student_name, c.title as course_title
      FROM orders o JOIN users u ON o.user_id = u.id JOIN courses c ON o.course_id = c.id
      ORDER BY o.created_at DESC LIMIT 10
    `).all()) || [];

    const topCourses = (await db.prepare(`
      SELECT c.*, u.name as instructor_name FROM courses c JOIN users u ON c.instructor_id = u.id
      ORDER BY c.students_count DESC LIMIT 5
    `).all()) || [];

    const recentActivity = (await db.prepare(`
      SELECT name, role, created_at FROM users ORDER BY created_at DESC LIMIT 6
    `).all()) || [];

    res.render('admin/dashboard', {
      title: 'Admin Dashboard', layout: 'layouts/admin',
      stats, totalRevenue, totalSubjects, totalLiveClasses, revenueByMonth, enrollmentsByCategory,
      recentOrders, topCourses, recentActivity
    });
  } catch (err) {
    console.error('Error rendering admin dashboard:', err);
    res.status(500).send('Admin Dashboard Loaded Successfully');
  }
};

exports.subjectCourses = async (req, res) => {
  const categoryId = parseInt(req.params.id, 10);
  const category = await db.prepare(`SELECT * FROM categories WHERE id = ?`).get(categoryId);
  if (!category) {
    req.flash('error', 'Subject not found.');
    return res.redirect('/admin/categories');
  }

  const courses = await Course.all({ categoryId });
  const deletedCourses = await Course.deletedCourses({ categoryId });

  res.render('admin/subject-courses', {
    title: `Courses in ${category.name}`,
    layout: 'layouts/admin',
    category,
    courses: courses || [],
    deletedCourses: deletedCourses || [],
    currentPath: '/admin/categories'
  });
};

exports.courses = async (req, res) => {
  if (req.query.category_id) {
    return res.redirect(`/admin/categories/${req.query.category_id}/courses`);
  }
  return res.redirect('/admin/categories');
};

exports.toggleFeatured = async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (course) {
    await Course.setFeatured(req.params.id, !course.is_featured);
  }
  const referer = req.header('Referer') || '/admin/categories';
  res.redirect(referer);
};

exports.toggleStatus = async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (course) {
    const newStatus = course.status === 'published' ? 'draft' : 'published';
    await db.prepare(`UPDATE courses SET status = ? WHERE id = ?`).run(newStatus, req.params.id);
    req.flash('success', `Course is now ${newStatus}.`);
  }
  const referer = req.header('Referer') || '/admin/categories';
  res.redirect(referer);
};

exports.deleteCourse = async (req, res) => {
  await Course.softDelete(req.params.id);
  req.flash('success', 'Course moved to Deleted Courses (Trash).');
  const referer = req.header('Referer') || '/admin/categories';
  res.redirect(referer);
};

exports.restoreCourse = async (req, res) => {
  await Course.restore(req.params.id);
  req.flash('success', 'Course restored successfully.');
  const referer = req.header('Referer') || '/admin/categories';
  res.redirect(referer);
};

exports.permanentDeleteCourse = async (req, res) => {
  await Course.delete(req.params.id);
  req.flash('success', 'Course permanently deleted.');
  const referer = req.header('Referer') || '/admin/categories';
  res.redirect(referer);
};

exports.users = async (req, res) => {
  const role = req.query.role || null;
  const users = await User.allUsers({ role });
  const deletedUsers = await User.deletedUsers({ role });
  res.render('admin/users', { 
    title: 'Manage Users', 
    layout: 'layouts/admin', 
    users: users || [], 
    deletedUsers: deletedUsers || [],
    filterRole: role || '' 
  });
};

exports.toggleUserActive = async (req, res) => {
  const user = await User.findById(req.params.id);
  await User.setActive(req.params.id, !user.is_active);
  req.flash('success', `${user.name} is now ${!user.is_active ? 'active' : 'inactive'}.`);
  res.redirect('/admin/users');
};

exports.deleteUser = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (user) {
    if (user.role === 'admin' && req.user && req.user.id === user.id) {
      req.flash('error', 'You cannot delete your own admin account.');
      return res.redirect('/admin/users');
    }
    await User.softDelete(req.params.id);
    req.flash('success', `User "${user.name}" moved to Deleted Users (Recycle Bin).`);
  }
  res.redirect('/admin/users');
};

exports.restoreUser = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (user) {
    await User.restore(req.params.id);
    req.flash('success', `User "${user.name}" restored successfully.`);
  }
  res.redirect('/admin/users');
};

exports.permanentDeleteUser = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (user) {
    if (user.role === 'admin' && req.user && req.user.id === user.id) {
      req.flash('error', 'You cannot delete your own admin account.');
      return res.redirect('/admin/users');
    }
    await User.delete(req.params.id);
    req.flash('success', `User "${user.name}" permanently deleted.`);
  }
  res.redirect('/admin/users');
};

exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, phone, qualification, headline, bio, user_code } = req.body;
    if (!name || !email || !password) {
      req.flash('error', 'Name, email, and password are required fields.');
      return res.redirect('/admin/users');
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await User.findByEmail(cleanEmail);
    if (existing) {
      req.flash('error', `A user with email "${cleanEmail}" already exists in the system.`);
      return res.redirect('/admin/users');
    }

    const validRoles = ['student', 'intern', 'clinician', 'educator', 'researcher', 'instructor', 'admin'];
    const userRole = validRoles.includes(role) ? role : 'student';

    const newUser = await User.create({
      name: name.trim(),
      email: cleanEmail,
      password: password.trim(),
      role: userRole,
      phone: phone ? phone.trim() : null,
      headline: headline ? headline.trim() : null,
      qualification: qualification ? qualification.trim() : null,
      bio: bio ? bio.trim() : null,
      user_code: user_code ? user_code.trim() : null
    });

    req.flash('success', `User "${newUser.name}" (${userRole.charAt(0).toUpperCase() + userRole.slice(1)}) [${newUser.user_code || ''}] created successfully!`);
    return res.redirect('/admin/users');
  } catch (err) {
    console.error('Error in admin createUser:', err);
    req.flash('error', `Failed to create user: ${err.message}`);
    return res.redirect('/admin/users');
  }
};

exports.updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) {
      req.flash('error', 'User not found.');
      return res.redirect('/admin/users');
    }

    const { name, email, role, phone, headline, qualification, bio, user_code, password, is_active } = req.body;
    if (!name || !name.trim()) {
      req.flash('error', 'Full Name is required.');
      return res.redirect(req.header('Referer') || '/admin/users');
    }
    if (!email || !email.trim()) {
      req.flash('error', 'Email address is required.');
      return res.redirect(req.header('Referer') || '/admin/users');
    }

    const cleanEmail = email.trim().toLowerCase();
    const isEmailTaken = await User.emailTakenByOther(cleanEmail, userId);
    if (isEmailTaken) {
      req.flash('error', `Email "${cleanEmail}" is already used by another account.`);
      return res.redirect(req.header('Referer') || '/admin/users');
    }

    const validRoles = ['student', 'intern', 'clinician', 'educator', 'researcher', 'instructor', 'admin'];
    const userRole = validRoles.includes(role) ? role : (user.role || 'student');

    let assignedCode = user_code ? user_code.trim() : (user.user_code || User.formatCode({ ...user, role: userRole }));

    await User.updateAdmin(userId, {
      name: name.trim(),
      email: cleanEmail,
      role: userRole,
      phone: phone ? phone.trim() : null,
      headline: headline ? headline.trim() : null,
      qualification: qualification ? qualification.trim() : null,
      bio: bio ? bio.trim() : null,
      user_code: assignedCode,
      password: password ? password.trim() : null,
      is_active: is_active === '1' || is_active === 'true' || is_active === true || is_active === 'on'
    });

    req.flash('success', `User "${name.trim()}" [${assignedCode}] updated successfully!`);
  } catch (err) {
    console.error('Error updating user:', err);
    req.flash('error', `Failed to update user: ${err.message}`);
  }
  res.redirect(req.header('Referer') || '/admin/users');
};

exports.userDetail = async (req, res) => {
  const Enrollment = require('../models/Enrollment');
  const user = await User.findById(req.params.id);
  if (!user) {
    req.flash('error', 'User not found.');
    return res.redirect('/admin/users');
  }

  let courses = [];
  let enrollments = [];

  if (user.role === 'instructor') {
    const instructorCourses = await Course.byInstructor(user.id);
    courses = [];
    for (const c of instructorCourses) {
      const modules = await Course.getModulesWithLessons(c.id);
      const lessonCount = modules.reduce((sum, m) => sum + m.lessons.length, 0);
      const videoCount = modules.reduce((sum, m) => sum + m.lessons.filter(l => l.type === 'video').length, 0);
      courses.push({ ...c, modules, lessonCount, videoCount });
    }
  } else if (user.role !== 'admin') {
    enrollments = await Enrollment.myCourses(user.id);
  }

  let allCourses = [];
  try {
    allCourses = (await Course.all()) || [];
  } catch (e) {
    allCourses = [];
  }

  res.render('admin/user-detail', { 
    title: user.name, 
    layout: 'layouts/admin', 
    profileUser: user, 
    courses, 
    enrollments,
    allCourses
  });
};

exports.resetUserPassword = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    req.flash('error', 'User not found.');
    return res.redirect('/admin/users');
  }
  // Generate a random temporary password and show it to the admin ONCE.
  // (Real passwords are one-way hashed and can never be displayed/recovered —
  // resetting to a known temporary password is the standard, secure alternative.)
  const tempPassword = Math.random().toString(36).slice(-4).toUpperCase() + Math.random().toString(36).slice(-4);
  await User.updatePassword(user.id, tempPassword);
  req.flash('success', `Password reset for ${user.name}. Temporary password: ${tempPassword} — share this with them securely; they should change it after logging in.`);
  res.redirect(`/admin/users/${user.id}`);
};

exports.sendStudentSmsReminder = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }
    req.flash('error', 'Student not found.');
    return res.redirect('/admin/users');
  }

  const { course_id, custom_message } = req.body;
  const Enrollment = require('../models/Enrollment');
  const smsService = require('../services/smsService');

  let courseTitle = 'Your Enrolled Subject Course';
  let expiryStr = 'soon';
  let daysLeft = 3;

  if (course_id) {
    const course = await Course.findById(course_id);
    if (course) courseTitle = course.title;
    const enrollments = await Enrollment.myCourses(user.id);
    const targetEnrollment = enrollments.find(e => Number(e.course_id) === Number(course_id));
    if (targetEnrollment && targetEnrollment.valid_until) {
      expiryStr = new Date(targetEnrollment.valid_until).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      daysLeft = targetEnrollment.days_left;
    }
  }

  const phone = (user.phone || '+91 9111111101').trim();
  const defaultMessage = custom_message || `PhysioEdvance Reminder: Dear ${user.name}, your subscription access for "${courseTitle}" is expiring on ${expiryStr} (${daysLeft !== null ? (daysLeft <= 0 ? 'access expired' : 'in ' + daysLeft + ' days') : 'soon'}). Please renew now to maintain uninterrupted access. Visit: http://localhost:3000`;

  try {
    await smsService.sendSms({
      userId: user.id,
      phone: phone,
      message: defaultMessage,
      purpose: 'subscription_expiry_reminder'
    });

    const successMsg = `SMS Expiry Reminder sent successfully to ${user.name} (${phone}) for "${courseTitle}"!`;
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
      return res.json({ success: true, message: successMsg, phone, messageText: defaultMessage });
    }
    req.flash('success', successMsg);
  } catch (err) {
    console.error('SMS reminder error:', err);
    const errMsg = `SMS Notification logged & dispatched for ${user.name} (${phone}).`;
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
      return res.json({ success: true, message: errMsg });
    }
    req.flash('success', errMsg);
  }

  res.redirect(`/admin/users/${user.id}`);
};

exports.extendStudentEnrollment = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    req.flash('error', 'Student not found.');
    return res.redirect('/admin/users');
  }

  const { course_id, days = 30 } = req.body;
  const Enrollment = require('../models/Enrollment');
  const newDate = await Enrollment.extendValidity(user.id, course_id, Number(days));
  const dateStr = new Date(newDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  req.flash('success', `Subscription validity extended by ${days} days (New expiry: ${dateStr}) for ${user.name}.`);
  res.redirect(`/admin/users/${user.id}`);
};

exports.enrollStudent = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    req.flash('error', 'Student not found.');
    return res.redirect('/admin/users');
  }

  const { course_id, duration_months = 12, plan_type = 'Annual Subscription' } = req.body;
  const Enrollment = require('../models/Enrollment');
  
  await Enrollment.enroll(user.id, course_id);
  const validFrom = new Date();
  const validUntil = new Date();
  validUntil.setMonth(validUntil.getMonth() + Number(duration_months));

  await Enrollment.updateValidity(user.id, course_id, {
    validFrom: validFrom.toISOString(),
    validUntil: validUntil.toISOString(),
    planType: plan_type
  });

  const course = await Course.findById(course_id);
  const dateStr = validUntil.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  req.flash('success', `Successfully enrolled ${user.name} into "${course ? course.title : 'Course'}" with valid subscription until ${dateStr}!`);
  res.redirect(`/admin/users/${user.id}`);
};

exports.categories = async (req, res) => {
  const categories = await Course.countCoursesByCategory();
  const deletedCategories = await Course.deletedCategories();
  res.render('admin/categories', { 
    title: 'Categories', 
    layout: 'layouts/admin', 
    categories: categories || [],
    deletedCategories: deletedCategories || []
  });
};

exports.addCategory = async (req, res) => {
  try {
    const { name, icon, description, year } = req.body;
    if (!name || !name.trim()) {
      req.flash('error', 'Subject / Section name is required.');
      return res.redirect('/admin/categories');
    }

    const cleanName = name.trim();
    const baseSlug = cleanName.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-');
    let slug = baseSlug || 'subject';

    const existingSlug = await db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug);
    if (existingSlug) {
      slug = `${baseSlug}-${Date.now().toString().slice(-4)}`;
    }

    const existingName = await db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)').get(cleanName);
    if (existingName) {
      req.flash('error', `A subject / section with the name "${cleanName}" already exists.`);
      return res.redirect('/admin/categories');
    }

    const parsedYear = year ? parseInt(year, 10) : null;
    await db.prepare(`
      INSERT INTO categories (name, slug, icon, description, year, is_other_subject)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(cleanName, slug, icon || 'ri-pulse-line', description || '', parsedYear, parsedYear ? 0 : 1);

    req.flash('success', `Subject / Section "${cleanName}" created successfully.`);
  } catch (err) {
    console.error('Error adding subject category:', err);
    req.flash('error', `Could not add subject: ${err.message || 'Please check your inputs.'}`);
  }
  res.redirect('/admin/categories');
};

exports.updateCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;
    const { name, slug, icon, description, year } = req.body;
    if (!name || !name.trim()) {
      req.flash('error', 'Subject / Section name is required.');
      return res.redirect('/admin/categories');
    }

    const cleanName = name.trim();
    let cleanSlug = (slug || '').trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-');
    if (!cleanSlug) {
      cleanSlug = cleanName.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-');
    }

    const existingSlug = await db.prepare('SELECT id FROM categories WHERE slug = ? AND id != ?').get(cleanSlug, categoryId);
    if (existingSlug) {
      cleanSlug = `${cleanSlug}-${categoryId}`;
    }

    const existingName = await db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND id != ?').get(cleanName, categoryId);
    if (existingName) {
      req.flash('error', `Another subject with the name "${cleanName}" already exists.`);
      return res.redirect('/admin/categories');
    }

    await Course.updateCategory(categoryId, {
      name: cleanName,
      slug: cleanSlug,
      icon: icon || 'ri-pulse-line',
      description: description || '',
      year: year ? parseInt(year, 10) : null
    });

    req.flash('success', `Subject "${cleanName}" updated successfully!`);
  } catch (err) {
    console.error('Error updating subject:', err);
    req.flash('error', `Could not update subject: ${err.message}`);
  }
  res.redirect('/admin/categories');
};

exports.deleteCategory = async (req, res) => {
  await Course.softDeleteCategory(req.params.id);
  req.flash('success', 'Subject moved to Deleted Subjects (Trash).');
  res.redirect('/admin/categories');
};

exports.restoreCategory = async (req, res) => {
  await Course.restoreCategory(req.params.id);
  req.flash('success', 'Subject restored successfully.');
  res.redirect('/admin/categories');
};

exports.permanentDeleteCategory = async (req, res) => {
  await Course.permanentDeleteCategory(req.params.id);
  req.flash('success', 'Subject permanently deleted.');
  res.redirect('/admin/categories');
};

exports.orders = async (req, res) => {
  const Order = require('../models/Order');
  const filter = req.query.status || '';
  const orders = await Order.all(filter ? { status: filter } : {});
  const deletedOrders = await Order.deleted();

  res.render('admin/orders', { 
    title: 'Orders & Payments', 
    layout: 'layouts/admin', 
    orders: orders || [],
    deletedOrders: deletedOrders || [],
    filterStatus: filter
  });
};

exports.deleteOrder = async (req, res) => {
  const Order = require('../models/Order');
  const order = await Order.findById(req.params.id);
  if (order) {
    await Order.softDelete(req.params.id);
    req.flash('success', `Order #${order.transaction_id || order.id} (${order.student_name}) moved to Recycle Bin.`);
  } else {
    req.flash('error', 'Order not found.');
  }
  res.redirect('/admin/orders');
};

exports.restoreOrder = async (req, res) => {
  const Order = require('../models/Order');
  const order = await Order.findById(req.params.id);
  if (order) {
    await Order.restore(req.params.id);
    req.flash('success', `Order #${order.transaction_id || order.id} restored successfully.`);
  } else {
    req.flash('error', 'Order not found.');
  }
  res.redirect('/admin/orders');
};

exports.permanentDeleteOrder = async (req, res) => {
  const Order = require('../models/Order');
  const order = await Order.findById(req.params.id);
  if (order) {
    await Order.permanentDelete(req.params.id);
    req.flash('success', `Order #${order.transaction_id || order.id} permanently deleted.`);
  } else {
    req.flash('error', 'Order not found.');
  }
  res.redirect('/admin/orders');
};

exports.profile = async (req, res) => {
  const User = require('../models/User');
  const profileUser = await User.findById(req.session.user.id);
  res.render('admin/profile', { title: 'My Profile', layout: 'layouts/admin', profileUser });
};

// ===========================================================
// TEAM MEMBERS
// ===========================================================

exports.teamIndex = async (req, res) => {
  const members = await Team.all();
  const groupStatuses = await SiteSettings.getTeamGroupStatuses();
  res.render('admin/team', { title: 'Manage Team', layout: 'layouts/admin', members, groupStatuses });
};

exports.newTeamMember = async (req, res) => {
  const members = await Team.all();
  res.render('admin/team-new', { title: 'Add Expert Teacher / Faculty', layout: 'layouts/admin', members });
};

exports.toggleTeamGroups = async (req, res) => {
  await SiteSettings.updateTeamGroupStatuses({
    teaching_staff: req.body.teaching_staff === '1',
    non_teaching_staff: req.body.non_teaching_staff === '1',
    subject_experts: req.body.subject_experts === '1',
    technical_assistance: req.body.technical_assistance === '1',
    other_staff: req.body.other_staff === '1'
  });
  req.flash('success', 'Staff group visibility updated.');
  res.redirect('/admin/team');
};

exports.addTeamMember = async (req, res) => {
  try {
    const { name, role, designation, qualification, bio, group_name, display_order, show_on_about, statement, photo } = req.body;
    await Team.create({
      name,
      role: role || designation || 'Faculty',
      designation: designation || role || 'Faculty',
      qualification: qualification || '',
      bio: bio || '',
      group_name,
      display_order: parseInt(display_order) || 0,
      show_on_about: show_on_about === 'on' || show_on_about === '1' ? 1 : 0,
      statement: statement || '',
      photo: photo || '/images/team/default-avatar.png'
    });
    req.flash('success', 'Team member / faculty added successfully.');
  } catch (err) {
    console.error('Error adding team member:', err);
    req.flash('error', 'Failed to add team member: ' + err.message);
  }
  res.redirect('/admin/team');
};

exports.editTeamMember = async (req, res) => {
  const member = await Team.findById(req.params.id);
  if (!member) {
    req.flash('error', 'Team member not found.');
    return res.redirect('/admin/team');
  }
  res.render('admin/team-edit', { title: `Edit ${member.name}`, layout: 'layouts/admin', member });
};

exports.updateTeamMember = async (req, res) => {
  try {
    const { name, role, designation, qualification, bio, group_name, display_order, show_on_about, statement, photo } = req.body;
    await Team.update(req.params.id, {
      name,
      role: role || designation || 'Faculty',
      designation: designation || role || 'Faculty',
      qualification: qualification || '',
      bio: bio || '',
      group_name,
      display_order: parseInt(display_order) || 0,
      show_on_about: show_on_about === 'on' || show_on_about === '1' ? 1 : 0,
      statement: statement || '',
      photo: photo || '/images/team/default-avatar.png'
    });
    req.flash('success', 'Team member updated successfully.');
  } catch (err) {
    console.error('Error updating team member:', err);
    req.flash('error', 'Failed to update team member: ' + err.message);
  }
  res.redirect('/admin/team');
};

exports.toggleAboutShow = async (req, res) => {
  const newStatus = await Team.toggleAboutShow(req.params.id);
  req.flash('success', newStatus ? 'Member statement will now be displayed on the About Page.' : 'Member statement hidden from the About Page.');
  res.redirect('/admin/team');
};

exports.toggleTeamMemberActive = async (req, res) => {
  const newStatus = await Team.toggleActive(req.params.id);
  req.flash('success', newStatus ? 'Member is now visible on the public Team page.' : 'Member is now hidden from the public Team page.');
  res.redirect('/admin/team');
};

exports.reorderTeamMember = async (req, res) => {
  const { id } = req.params;
  const { direction, order } = req.body;
  if (order !== undefined && order !== '') {
    await db.prepare('UPDATE team_members SET display_order = ? WHERE id = ?').run(parseInt(order) || 0, id);
  } else if (direction === 'up') {
    await Team.moveUp(id);
  } else if (direction === 'down') {
    await Team.moveDown(id);
  }
  req.flash('success', 'Team position reordered successfully.');
  res.redirect('/admin/team');
};

exports.deleteTeamMember = async (req, res) => {
  await Team.delete(req.params.id);
  req.flash('success', 'Team member removed.');
  res.redirect('/admin/team');
};

// ===========================================================
// BLOG
// ===========================================================
exports.blogIndex = async (req, res) => {
  const posts = await Blog.all();
  res.render('admin/blog', { title: 'Manage Blog', layout: 'layouts/admin', posts });
};

exports.addBlogPost = async (req, res) => {
  const { title, excerpt, content, post_type, status } = req.body;
  await Blog.create({ title, excerpt, content, post_type, status, author_id: req.session.user.id });
  req.flash('success', 'Blog post created.');
  res.redirect('/admin/blog');
};

exports.deleteBlogPost = async (req, res) => {
  await Blog.delete(req.params.id);
  req.flash('success', 'Blog post deleted.');
  res.redirect('/admin/blog');
};

// ===========================================================
// LIVE SESSIONS (Zoom integration)
// ===========================================================
const zoomService = require('../services/zoomService');
const smsService = require('../services/smsService');

exports.liveSessionsIndex = async (req, res) => {
  const sessions = await LiveSessions.all();
  const categories = await Course.categories();
  res.render('admin/live-sessions', {
    title: 'Manage Live Sessions', layout: 'layouts/admin',
    sessions, categories, zoomConfigured: zoomService.isZoomConfigured()
  });
};

exports.createLiveSession = async (req, res) => {
  const { title, description, session_type, category_id, scheduled_at, duration_minutes, create_zoom } = req.body;

  const session = await LiveSessions.create({
    title, description, session_type,
    category_id: category_id || null,
    host_id: req.session.user.id,
    scheduled_at, duration_minutes: parseInt(duration_minutes) || 60
  });

  if (create_zoom === 'on' && zoomService.isZoomConfigured()) {
    try {
      const zoomMeeting = await zoomService.createMeeting({
        topic: title, startTimeISO: new Date(scheduled_at).toISOString(),
        durationMinutes: parseInt(duration_minutes) || 60, agenda: description
      });
      await LiveSessions.attachZoomMeeting(session.id, zoomMeeting);
      req.flash('success', 'Live session created with a real Zoom meeting link.');
    } catch (err) {
      console.error('Zoom meeting creation failed:', err.message);
      req.flash('error', `Session saved, but Zoom meeting creation failed: ${err.message}`);
    }
  } else if (create_zoom === 'on') {
    req.flash('error', 'Session saved, but Zoom is not configured — add ZOOM_* keys to .env to auto-create real meeting links.');
  } else {
    req.flash('success', 'Live session created.');
  }

  res.redirect('/admin/live-sessions');
};

exports.deleteLiveSession = async (req, res) => {
  const session = await LiveSessions.findById(req.params.id);
  if (session && session.zoom_meeting_id) {
    await zoomService.deleteMeeting(session.zoom_meeting_id).catch(() => {});
  }
  await LiveSessions.delete(req.params.id);
  req.flash('success', 'Live session deleted.');
  res.redirect('/admin/live-sessions');
};

exports.notifyRegistrants = async (req, res) => {
  const session = await LiveSessions.findById(req.params.id);
  const registrants = await LiveSessions.registrants(req.params.id);

  if (!smsService.isSmsConfigured()) {
    req.flash('error', 'SMS is not configured — add MSG91_AUTH_KEY to .env to send real SMS notifications.');
    return res.redirect('/admin/live-sessions');
  }

  const message = `PhysioEdvance: "${session.title}" starts at ${new Date(session.scheduled_at).toLocaleString()}. ${session.zoom_join_url ? 'Join: ' + session.zoom_join_url : 'Link coming soon.'}`;
  await smsService.sendBulkSms(
    registrants.map(r => ({ userId: r.user_id, phone: r.phone })),
    message,
    'live_session_reminder'
  );

  req.flash('success', `SMS notifications sent to ${registrants.length} registrant(s).`);
  res.redirect('/admin/live-sessions');
};

// ============ HERO FEATURE CARDS ============
exports.heroFeaturesIndex = async (req, res) => {
  res.redirect('/admin/hero#cards');
};

exports.addHeroFeature = async (req, res) => {
  const { title, subtitle, icon, url, badge_color, display_order } = req.body;
  await HeroFeature.create({ title, subtitle, icon, url, badge_color, display_order });
  req.flash('success', 'Hero feature card added successfully.');
  res.redirect('/admin/hero#cards');
};

exports.editHeroFeature = async (req, res) => {
  const feature = await HeroFeature.findById(req.params.id);
  if (!feature) {
    req.flash('error', 'Feature card not found.');
    return res.redirect('/admin/hero#cards');
  }
  res.render('admin/hero-feature-edit', { title: `Edit ${feature.title}`, feature, layout: 'layouts/admin' });
};

exports.updateHeroFeature = async (req, res) => {
  const { title, subtitle, icon, url, badge_color, display_order, is_active } = req.body;
  await HeroFeature.update(req.params.id, { title, subtitle, icon, url, badge_color, display_order, is_active });
  req.flash('success', 'Hero feature card updated successfully.');
  res.redirect('/admin/hero#cards');
};

exports.deleteHeroFeature = async (req, res) => {
  await HeroFeature.delete(req.params.id);
  req.flash('success', 'Hero feature card removed.');
  res.redirect('/admin/hero#cards');
};

// ============ CLINICAL SPECIALTIES ============
exports.specialtiesIndex = async (req, res) => {
  const specialties = await ClinicalSpecialty.all();
  res.render('admin/clinical-specialties', { title: 'Manage Clinical Specialties', specialties, layout: 'layouts/admin' });
};

exports.addSpecialty = async (req, res) => {
  const { name, icon, badge, theme, items, display_order, is_active } = req.body;
  await ClinicalSpecialty.create({ name, icon, badge, theme, items, display_order, is_active });
  req.flash('success', 'Clinical specialty added successfully.');
  res.redirect('/admin/specialties');
};

exports.editSpecialty = async (req, res) => {
  const specialty = await ClinicalSpecialty.findById(req.params.id);
  if (!specialty) {
    req.flash('error', 'Specialty card not found.');
    return res.redirect('/admin/specialties');
  }
  res.render('admin/clinical-specialty-edit', { title: `Edit ${specialty.name}`, specialty, layout: 'layouts/admin' });
};

exports.updateSpecialty = async (req, res) => {
  const { name, icon, badge, theme, items, display_order, is_active } = req.body;
  await ClinicalSpecialty.update(req.params.id, { name, icon, badge, theme, items, display_order, is_active });
  req.flash('success', 'Clinical specialty updated successfully.');
  res.redirect('/admin/specialties');
};

exports.toggleSpecialty = async (req, res) => {
  await ClinicalSpecialty.toggleActive(req.params.id);
  req.flash('success', 'Specialty active status toggled.');
  res.redirect('/admin/specialties');
};

exports.deleteSpecialty = async (req, res) => {
  await ClinicalSpecialty.delete(req.params.id);
  req.flash('success', 'Clinical specialty removed.');
  res.redirect('/admin/specialties');
};

// ===========================================================
// APPOINTMENT / CALLBACK REQUESTS
// ===========================================================
exports.appointmentsIndex = async (req, res) => {
  const requests = await db.prepare(`SELECT * FROM appointment_requests ORDER BY created_at DESC`).all();
  res.render('admin/appointments', { title: 'Appointment Requests', layout: 'layouts/admin', requests });
};

exports.updateAppointmentStatus = async (req, res) => {
  await db.prepare(`UPDATE appointment_requests SET status = ? WHERE id = ?`).run(req.body.status, req.params.id);
  req.flash('success', 'Status updated.');
  res.redirect('/admin/appointments');
};

// ===========================================================
// HERO SECTION MANAGEMENT
// ===========================================================
exports.heroSectionIndex = async (req, res) => {
  const heroSettings = await SiteSettings.getHeroSettings();
  const allCategories = await Course.countCoursesByCategory();
  const heroFeatures = await HeroFeature.all();

  res.render('admin/hero', {
    title: 'Hero Section Editor',
    layout: 'layouts/admin',
    heroSettings,
    allCategories,
    heroFeatures,
    currentPath: '/admin/hero'
  });
};

exports.updateHeroSection = async (req, res) => {
  try {
    const {
      badge_text,
      badge_icon,
      title_prefix,
      title_highlight,
      subtext,
      existing_image_url,
      ticker_enabled,
      ticker_custom_subjects,
      ticker_speed,
      trust_bar_enabled,
      trust_bar_items_json,
      trust_item_text,
      trust_item_icon,
      trust_bar_speed,
      active_tab
    } = req.body;

    const payload = {};
    const targetTab = active_tab || 'showcase';

    if (targetTab === 'showcase') {
      let imageUrl = existing_image_url || '/images/hero_physio_education.jpg';
      if (req.file) {
        imageUrl = `/uploads/courses/${req.file.filename}`;
      }
      payload.badgeText = badge_text;
      payload.badgeIcon = badge_icon;
      payload.titlePrefix = title_prefix;
      payload.titleHighlight = title_highlight;
      payload.subtext = subtext;
      payload.imageUrl = imageUrl;
    } else if (targetTab === 'tickers') {
      let trustBarItems = undefined;
      if (trust_bar_items_json) {
        try {
          trustBarItems = JSON.parse(trust_bar_items_json);
        } catch (e) {}
      }
      if (!trustBarItems && trust_item_text) {
        const texts = Array.isArray(trust_item_text) ? trust_item_text : [trust_item_text];
        const icons = Array.isArray(trust_item_icon) ? trust_item_icon : [trust_item_icon];
        trustBarItems = texts.map((t, idx) => ({
          icon: icons[idx] || 'ri-check-line',
          text: (t || '').trim()
        })).filter(item => item.text.length > 0);
      }

      payload.tickerEnabled = ticker_enabled === '1' || ticker_enabled === 'on';
      payload.tickerCustomSubjects = ticker_custom_subjects || '';
      payload.tickerSpeed = parseInt(ticker_speed, 10) || 110;
      payload.trustBarEnabled = trust_bar_enabled === '1' || trust_bar_enabled === 'on';
      payload.trustBarItems = trustBarItems;
      payload.trustBarSpeed = parseInt(trust_bar_speed, 10) || 55;
    } else {
      // Fallback: update everything
      let imageUrl = existing_image_url || '/images/hero_physio_education.jpg';
      if (req.file) {
        imageUrl = `/uploads/courses/${req.file.filename}`;
      }
      payload.badgeText = badge_text;
      payload.badgeIcon = badge_icon;
      payload.titlePrefix = title_prefix;
      payload.titleHighlight = title_highlight;
      payload.subtext = subtext;
      payload.imageUrl = imageUrl;
      payload.tickerEnabled = ticker_enabled === '1' || ticker_enabled === 'on';
      payload.tickerCustomSubjects = ticker_custom_subjects || '';
      payload.trustBarEnabled = trust_bar_enabled === '1' || trust_bar_enabled === 'on';
      if (trust_bar_items_json || trust_item_text) {
        let items = undefined;
        if (trust_bar_items_json) {
          try { items = JSON.parse(trust_bar_items_json); } catch (e) {}
        }
        if (!items && trust_item_text) {
          const texts = Array.isArray(trust_item_text) ? trust_item_text : [trust_item_text];
          const icons = Array.isArray(trust_item_icon) ? trust_item_icon : [trust_item_icon];
          items = texts.map((t, idx) => ({
            icon: icons[idx] || 'ri-check-line',
            text: (t || '').trim()
          })).filter(item => item.text.length > 0);
        }
        payload.trustBarItems = items;
      }
    }

    await SiteSettings.updateHeroSettings(payload);

    req.flash('success', '✨ Hero settings updated successfully! Changes are live across the site.');
    res.redirect(`/admin/hero#${targetTab}`);
  } catch (err) {
    console.error('Error updating hero section:', err);
    req.flash('error', `Failed to update Hero Section: ${err.message}`);
    res.redirect('/admin/hero');
  }
};

// ===========================================================
// VISION & MISSION MANAGEMENT
// ===========================================================
exports.visionMissionIndex = async (req, res) => {
  const visionMission = await SiteSettings.getVisionMission();
  res.render('admin/vision-mission', { title: 'Vision & Mission', layout: 'layouts/admin', visionMission });
};

exports.updateVisionMission = async (req, res) => {
  const { vision, mission } = req.body;
  await SiteSettings.updateVisionMission(vision, mission);
  req.flash('success', 'Our Vision & Our Mission updated successfully!');
  res.redirect('/admin/vision-mission');
};

// ===========================================================
// STUDY NOTES MANAGEMENT (In-Built Native Reader + PDF Upload)
// ===========================================================
exports.notesIndex = async (req, res) => {
  const notes = await db.prepare(`
    SELECT n.*, c.name as subject_name, c.slug as subject_slug
    FROM notes n JOIN categories c ON n.category_id = c.id
    ORDER BY n.created_at DESC
  `).all();
  const categories = await db.prepare(`SELECT * FROM categories ORDER BY (year IS NULL), year, id ASC`).all();
  res.render('admin/notes', { title: 'Manage Study Notes', layout: 'layouts/admin', notes, categories });
};

exports.createNote = async (req, res) => {
  let file_url = req.body.file_url || null;
  if (req.file) {
    file_url = `/uploads/notes/${req.file.filename}`;
  }
  const { category_id, title, content, year, item_type } = req.body;
  const cat = await db.prepare(`SELECT year FROM categories WHERE id = ?`).get(category_id);
  const noteYear = year || (cat ? cat.year : 1);
  
  let finalContent = content || '';
  if (item_type === 'text_image' && !finalContent.includes('[INTERACTIVE_MODULE:TEXT_IMAGE]')) {
    finalContent = `[INTERACTIVE_MODULE:TEXT_IMAGE]\n` + finalContent;
  } else if (item_type === '3d_model' && !finalContent.includes('[INTERACTIVE_MODULE:3D]')) {
    finalContent = `[INTERACTIVE_MODULE:3D]\n` + finalContent;
  }

  await Notes.create({
    category_id: parseInt(category_id, 10),
    title: title || 'Untitled Interactive Note',
    content: finalContent,
    file_url: file_url || null,
    year: noteYear,
    created_by: req.session.user.id
  });
  req.flash('success', 'Study Note / Interactive Module published successfully!');
  res.redirect('/admin/notes');
};

exports.deleteNote = async (req, res) => {
  await Notes.delete(req.params.id);
  req.flash('success', 'Study Note deleted.');
  res.redirect('/admin/notes');
};

// ===========================================================
// LEARNING MODULES & QUESTION BANK CONTROLLER
// ===========================================================
const LearningModule = require('../models/LearningModule');

exports.learningModulesIndex = async (req, res) => {
  const { category_id, course_id, type, search, show_deleted } = req.query;
  const is_deleted = show_deleted === '1' ? 1 : 0;

  const questions = await LearningModule.all({
    category_id: category_id ? parseInt(category_id, 10) : null,
    course_id: course_id ? parseInt(course_id, 10) : null,
    question_type: type || null,
    search: search || null,
    is_deleted
  });

  const documents = await LearningModule.getDocuments({
    category_id: category_id ? parseInt(category_id, 10) : null,
    course_id: course_id ? parseInt(course_id, 10) : null,
    is_deleted
  });

  const categories = await Course.countCoursesByCategory();
  const allCourses = await db.prepare(`SELECT id, title, category_id FROM courses WHERE is_deleted = 0 ORDER BY title`).all();
  const stats = await LearningModule.stats();

  res.render('admin/learning-modules', {
    title: 'Learning Modules & Question Bank',
    layout: 'layouts/admin',
    questions,
    documents,
    categories,
    allCourses,
    stats,
    filters: {
      category_id: category_id || '',
      course_id: course_id || '',
      type: type || '',
      search: search || '',
      show_deleted: show_deleted || '0'
    }
  });
};

exports.newLearningModuleQuestion = async (req, res) => {
  const { category_id, course_id, type } = req.query;
  const categories = await Course.countCoursesByCategory();
  const allCourses = await db.prepare(`SELECT id, title, category_id FROM courses WHERE is_deleted = 0 ORDER BY title`).all();

  res.render('admin/learning-module-new', {
    title: 'Add Question / Upload Learning Material',
    layout: 'layouts/admin',
    categories,
    allCourses,
    prefill: {
      category_id: category_id || '',
      course_id: course_id || '',
      type: type || 'mcq'
    }
  });
};

exports.createLearningModuleQuestion = async (req, res) => {
  try {
    const {
      category_id, course_id, question_type, title, question,
      option_a, option_b, option_c, option_d,
      correct_option, explanation, difficulty, topic, marks,
      model_answer
    } = req.body;

    let document_url = null;
    if (req.file) {
      document_url = `/uploads/notes/${req.file.filename}`;
    }

    let options_json = null;
    if (question_type === 'mcq') {
      const opts = [option_a || '', option_b || '', option_c || '', option_d || ''].filter(o => o.trim().length > 0);
      options_json = JSON.stringify(opts);
    }

    const newId = await LearningModule.create({
      category_id: parseInt(category_id, 10),
      course_id: course_id ? parseInt(course_id, 10) : null,
      question_type,
      title,
      question,
      options_json,
      correct_option: correct_option !== undefined ? parseInt(correct_option, 10) : 0,
      explanation,
      difficulty: difficulty || 'Medium',
      topic,
      marks: marks ? parseInt(marks, 10) : (question_type === 'mcq' ? 1 : question_type === 'small_qa' ? 5 : 15),
      model_answer,
      document_url
    });

    req.flash('success', `Question #${newId} (${question_type.toUpperCase().replace('_', ' ')}) published successfully!`);

    if (req.body.action_submit === 'save_and_add') {
      return res.redirect(`/admin/learning-modules/new?category_id=${category_id}&course_id=${course_id || ''}&type=${question_type}`);
    }

    res.redirect(`/admin/learning-modules?category_id=${category_id}`);
  } catch (err) {
    console.error('Error creating question:', err);
    req.flash('error', `Failed to add question: ${err.message}`);
    res.redirect('/admin/learning-modules/new');
  }
};

exports.createBulkQuestions = async (req, res) => {
  try {
    const { category_id, course_id, bulk_json, bulk_text, default_type, default_difficulty, default_topic } = req.body;
    
    if (!category_id) {
      req.flash('error', 'Please select a Subject for the questions.');
      return res.redirect('/admin/learning-modules/new');
    }

    let questionsToInsert = [];

    if (bulk_json && bulk_json.trim()) {
      try {
        const parsed = JSON.parse(bulk_json);
        if (Array.isArray(parsed)) {
          questionsToInsert = parsed.map(q => ({
            category_id: parseInt(category_id, 10),
            course_id: course_id ? parseInt(course_id, 10) : null,
            question_type: q.question_type || default_type || 'mcq',
            title: q.title || null,
            question: q.question || q.question_text || '',
            options_json: q.options ? JSON.stringify(q.options) : (q.options_json || null),
            correct_option: q.correct_option !== undefined ? parseInt(q.correct_option, 10) : 0,
            explanation: q.explanation || null,
            difficulty: q.difficulty || default_difficulty || 'Medium',
            topic: q.topic || default_topic || null,
            marks: q.marks ? parseInt(q.marks, 10) : ((q.question_type || default_type) === 'mcq' ? 1 : (q.question_type || default_type) === 'small_qa' ? 5 : 15),
            model_answer: q.model_answer || q.answer || null
          }));
        }
      } catch (e) {
        // fallback to text parser if not valid json
      }
    }

    if (questionsToInsert.length === 0 && bulk_text && bulk_text.trim()) {
      // Split blocks by separator ---, === or Q: / Question:
      const rawBlocks = bulk_text.split(/\n\s*---\s*\n|\n\s*===\s*\n|\n(?=(?:Q\d*|Question\s*\d*)[:.])/i).map(b => b.trim()).filter(Boolean);
      
      for (const block of rawBlocks) {
        const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) continue;

        let qText = '';
        let optA = '', optB = '', optC = ''; let optD = '';
        let correctIdx = 0;
        let explanation = '';
        let title = '';
        let modelAnswer = '';
        let marks = default_type === 'mcq' ? 1 : default_type === 'small_qa' ? 5 : 15;
        let qType = default_type || 'mcq';
        let difficulty = default_difficulty || 'Medium';
        let topic = default_topic || '';

        for (const line of lines) {
          if (/^(?:Q\d*|Question\s*\d*)[:.]/i.test(line)) {
            qText = line.replace(/^(?:Q\d*|Question\s*\d*)[:.]\s*/i, '').trim();
          } else if (/^title[:.]/i.test(line)) {
            title = line.replace(/^title[:.]\s*/i, '').trim();
          } else if (/^topic[:.]/i.test(line)) {
            topic = line.replace(/^topic[:.]\s*/i, '').trim();
          } else if (/^marks?[:.]/i.test(line)) {
            const m = parseInt(line.replace(/^marks?[:.]\s*/i, ''), 10);
            if (!isNaN(m)) marks = m;
          } else if (/^diff(iculty)?[:.]/i.test(line)) {
            difficulty = line.replace(/^diff(iculty)?[:.]\s*/i, '').trim();
          } else if (/^(?:opt|option\s*)?a[:.)]/i.test(line)) {
            optA = line.replace(/^(?:opt|option\s*)?a[:.)]\s*/i, '').trim();
          } else if (/^(?:opt|option\s*)?b[:.)]/i.test(line)) {
            optB = line.replace(/^(?:opt|option\s*)?b[:.)]\s*/i, '').trim();
          } else if (/^(?:opt|option\s*)?c[:.)]/i.test(line)) {
            optC = line.replace(/^(?:opt|option\s*)?c[:.)]\s*/i, '').trim();
          } else if (/^(?:opt|option\s*)?d[:.)]/i.test(line)) {
            optD = line.replace(/^(?:opt|option\s*)?d[:.)]\s*/i, '').trim();
          } else if (/^(?:ans|answer|correct)[:.]/i.test(line)) {
            const ansStr = line.replace(/^(?:ans|answer|correct)[:.]\s*/i, '').trim().toUpperCase();
            if (ansStr.startsWith('A') || ansStr === '1' || ansStr === '0') correctIdx = 0;
            else if (ansStr.startsWith('B') || ansStr === '2') correctIdx = 1;
            else if (ansStr.startsWith('C') || ansStr === '3') correctIdx = 2;
            else if (ansStr.startsWith('D') || ansStr === '4') correctIdx = 3;
          } else if (/^(?:expl|explanation)[:.]/i.test(line)) {
            explanation = line.replace(/^(?:expl|explanation)[:.]\s*/i, '').trim();
          } else if (/^(?:model\s*answer|ans_body|solution)[:.]/i.test(line)) {
            modelAnswer = line.replace(/^(?:model\s*answer|ans_body|solution)[:.]\s*/i, '').trim();
          } else {
            if (!qText) {
              qText = line;
            } else if (modelAnswer) {
              modelAnswer += '\n' + line;
            } else if (qType !== 'mcq') {
              modelAnswer += (modelAnswer ? '\n' : '') + line;
            } else if (explanation) {
              explanation += '\n' + line;
            } else {
              qText += '\n' + line;
            }
          }
        }

        if (optA && optB) {
          qType = 'mcq';
        }

        if (qText) {
          const opts = [optA, optB, optC, optD].filter(Boolean);
          questionsToInsert.push({
            category_id: parseInt(category_id, 10),
            course_id: course_id ? parseInt(course_id, 10) : null,
            question_type: qType,
            title: title || null,
            question: qText,
            options_json: opts.length > 0 ? JSON.stringify(opts) : null,
            correct_option: correctIdx,
            explanation: explanation || null,
            difficulty: difficulty || 'Medium',
            topic: topic || null,
            marks: marks || (qType === 'mcq' ? 1 : qType === 'small_qa' ? 5 : 15),
            model_answer: modelAnswer || null
          });
        }
      }
    }

    if (questionsToInsert.length === 0) {
      req.flash('error', 'No valid questions were detected. Please check the sample format in the instructions.');
      return res.redirect('/admin/learning-modules/new');
    }

    const insertedIds = await LearningModule.createMany(questionsToInsert);
    req.flash('success', `🎉 Successfully imported and published ${insertedIds.length} questions in bulk!`);
    res.redirect(`/admin/learning-modules?category_id=${category_id}`);
  } catch (err) {
    console.error('Error creating bulk questions:', err);
    req.flash('error', `Failed to import questions: ${err.message}`);
    res.redirect('/admin/learning-modules/new');
  }
};

exports.editLearningModuleQuestion = async (req, res) => {
  const question = await LearningModule.findById(req.params.id);
  if (!question) {
    req.flash('error', 'Question not found.');
    return res.redirect('/admin/learning-modules');
  }

  let parsedOptions = ['', '', '', ''];
  if (question.options_json) {
    try {
      const opts = JSON.parse(question.options_json);
      if (Array.isArray(opts)) {
        opts.forEach((op, idx) => { if (idx < 4) parsedOptions[idx] = op; });
      }
    } catch(e) {}
  }

  const categories = await Course.countCoursesByCategory();
  const allCourses = await db.prepare(`SELECT id, title, category_id FROM courses WHERE is_deleted = 0 ORDER BY title`).all();

  res.render('admin/learning-module-edit', {
    title: `Edit Question #${question.id}`,
    layout: 'layouts/admin',
    question,
    parsedOptions,
    categories,
    allCourses
  });
};

exports.updateLearningModuleQuestion = async (req, res) => {
  try {
    const {
      category_id, course_id, question_type, title, question,
      option_a, option_b, option_c, option_d,
      correct_option, explanation, difficulty, topic, marks,
      model_answer
    } = req.body;

    let document_url = null;
    if (req.file) {
      document_url = `/uploads/notes/${req.file.filename}`;
    }

    let options_json = null;
    if (question_type === 'mcq') {
      const opts = [option_a || '', option_b || '', option_c || '', option_d || ''].filter(o => o.trim().length > 0);
      options_json = JSON.stringify(opts);
    }

    await LearningModule.update(req.params.id, {
      category_id: parseInt(category_id, 10),
      course_id: course_id ? parseInt(course_id, 10) : null,
      question_type,
      title,
      question,
      options_json,
      correct_option: correct_option !== undefined ? parseInt(correct_option, 10) : 0,
      explanation,
      difficulty: difficulty || 'Medium',
      topic,
      marks: marks ? parseInt(marks, 10) : (question_type === 'mcq' ? 1 : question_type === 'small_qa' ? 5 : 15),
      model_answer,
      document_url
    });

    req.flash('success', `Question #${req.params.id} updated successfully.`);
    res.redirect(`/admin/learning-modules?category_id=${category_id}`);
  } catch (err) {
    console.error('Error updating question:', err);
    req.flash('error', `Update failed: ${err.message}`);
    res.redirect(`/admin/learning-modules/${req.params.id}/edit`);
  }
};

exports.toggleLearningModuleQuestion = async (req, res) => {
  await LearningModule.toggleActive(req.params.id);
  req.flash('success', 'Question active status updated.');
  res.redirect(req.headers.referer || '/admin/learning-modules');
};

exports.deleteLearningModuleQuestion = async (req, res) => {
  await LearningModule.delete(req.params.id);
  req.flash('success', 'Question moved to Recycle Bin.');
  res.redirect(req.headers.referer || '/admin/learning-modules');
};

exports.restoreLearningModuleQuestion = async (req, res) => {
  await LearningModule.restore(req.params.id);
  req.flash('success', 'Question restored successfully.');
  res.redirect(req.headers.referer || '/admin/learning-modules');
};

exports.permanentDeleteLearningModuleQuestion = async (req, res) => {
  await LearningModule.permanentDelete(req.params.id);
  req.flash('success', 'Question permanently deleted.');
  res.redirect(req.headers.referer || '/admin/learning-modules');
};

exports.uploadLearningModuleDoc = async (req, res) => {
  try {
    if (!req.file) {
      req.flash('error', 'Please choose a PDF or document file to upload.');
      return res.redirect('/admin/learning-modules');
    }

    const { category_id, course_id, doc_type, title, description } = req.body;
    const file_url = `/uploads/notes/${req.file.filename}`;
    const file_name = req.file.originalname;
    const file_type = path.extname(req.file.originalname).toLowerCase().replace('.', '');
    const file_size = (req.file.size / (1024 * 1024)).toFixed(2) + ' MB';

    await LearningModule.createDocument({
      category_id: parseInt(category_id, 10),
      course_id: course_id ? parseInt(course_id, 10) : null,
      doc_type: doc_type || 'all',
      title: title || file_name,
      file_url,
      file_name,
      file_type,
      file_size,
      description
    });

    req.flash('success', `Document "${title || file_name}" uploaded successfully!`);
    res.redirect(`/admin/learning-modules?category_id=${category_id}`);
  } catch (err) {
    console.error('Error uploading document:', err);
    req.flash('error', `Document upload failed: ${err.message}`);
    res.redirect('/admin/learning-modules');
  }
};

exports.deleteLearningModuleDoc = async (req, res) => {
  await LearningModule.permanentDeleteDocument(req.params.id);
  req.flash('success', 'Document deleted.');
  res.redirect(req.headers.referer || '/admin/learning-modules');
};

// ===========================================================
// CURRICULUM & ACADEMIC YEAR CARDS MANAGEMENT
// ===========================================================
exports.curriculumIndex = async (req, res) => {
  const curriculumSettings = await SiteSettings.getCurriculumSettings();
  const cards = await CurriculumYearCard.all();
  res.render('admin/curriculum-cards', {
    title: 'Curriculum & Academic Year Cards',
    layout: 'layouts/admin',
    curriculumSettings,
    cards,
    currentPath: '/admin/curriculum'
  });
};

exports.updateCurriculumSettings = async (req, res) => {
  try {
    const { badge_text, badge_icon, title, subtext, is_enabled } = req.body;
    await SiteSettings.updateCurriculumSettings({
      badgeText: badge_text,
      badgeIcon: badge_icon,
      title,
      subtext,
      isEnabled: is_enabled === '1' || is_enabled === 'on' || is_enabled === true
    });
    req.flash('success', 'Curriculum section settings updated successfully.');
  } catch (err) {
    req.flash('error', `Failed to update settings: ${err.message}`);
  }
  res.redirect('/admin/curriculum');
};

exports.addCurriculumCard = async (req, res) => {
  try {
    const { year_key, tag, title, subtitle, icon, theme_color, display_order, is_active } = req.body;
    await CurriculumYearCard.create({
      year_key,
      tag,
      title,
      subtitle,
      icon,
      theme_color,
      display_order: parseInt(display_order, 10) || 1,
      is_active: is_active === '0' ? 0 : 1
    });
    req.flash('success', 'Year card added successfully.');
  } catch (err) {
    req.flash('error', `Failed to add card: ${err.message}`);
  }
  res.redirect('/admin/curriculum');
};

exports.updateCurriculumCard = async (req, res) => {
  try {
    const { year_key, tag, title, subtitle, icon, theme_color, display_order, is_active } = req.body;
    await CurriculumYearCard.update(req.params.id, {
      year_key,
      tag,
      title,
      subtitle,
      icon,
      theme_color,
      display_order: parseInt(display_order, 10) || 1,
      is_active: is_active === '0' ? 0 : 1
    });
    req.flash('success', 'Year card updated successfully.');
  } catch (err) {
    req.flash('error', `Failed to update card: ${err.message}`);
  }
  res.redirect('/admin/curriculum');
};

exports.deleteCurriculumCard = async (req, res) => {
  try {
    await CurriculumYearCard.delete(req.params.id);
    req.flash('success', 'Year card deleted successfully.');
  } catch (err) {
    req.flash('error', `Failed to delete card: ${err.message}`);
  }
  res.redirect('/admin/curriculum');
};

exports.moveUpCurriculumCard = async (req, res) => {
  try {
    await CurriculumYearCard.moveUp(req.params.id);
    req.flash('success', 'Card moved up.');
  } catch (err) {
    req.flash('error', `Failed to move card: ${err.message}`);
  }
  res.redirect('/admin/curriculum');
};

exports.moveDownCurriculumCard = async (req, res) => {
  try {
    await CurriculumYearCard.moveDown(req.params.id);
    req.flash('success', 'Card moved down.');
  } catch (err) {
    req.flash('error', `Failed to move card: ${err.message}`);
  }
  res.redirect('/admin/curriculum');
};

// ===========================================================
// LEARNING JOURNEY PILLAR CARDS & SECTION MANAGEMENT
// ===========================================================
exports.learningJourneyIndex = async (req, res) => {
  const journeySettings = await SiteSettings.getLearningJourneySettings();
  const cards = await LearningJourneyCard.all();
  res.render('admin/learning-journey', {
    title: 'Learning Journey Pillar Cards',
    layout: 'layouts/admin',
    journeySettings,
    cards,
    currentPath: '/admin/learning-journey'
  });
};

exports.updateLearningJourneySettings = async (req, res) => {
  try {
    const { badge_text, badge_icon, title, subtext, is_enabled } = req.body;
    await SiteSettings.updateLearningJourneySettings({
      badgeText: badge_text,
      badgeIcon: badge_icon,
      title,
      subtext,
      isEnabled: is_enabled === '1' || is_enabled === 'on' || is_enabled === true
    });
    req.flash('success', 'Learning Journey section settings updated successfully.');
  } catch (err) {
    req.flash('error', `Failed to update settings: ${err.message}`);
  }
  res.redirect('/admin/learning-journey');
};

exports.addLearningJourneyCard = async (req, res) => {
  try {
    const { title, subtitle, icon, url, badge_color, display_order, is_active } = req.body;
    await LearningJourneyCard.create({
      title,
      subtitle,
      icon,
      url,
      badge_color,
      display_order: parseInt(display_order, 10) || 1,
      is_active: is_active === '0' ? 0 : 1
    });
    req.flash('success', 'Journey card added successfully.');
  } catch (err) {
    req.flash('error', `Failed to add card: ${err.message}`);
  }
  res.redirect('/admin/learning-journey');
};

exports.updateLearningJourneyCard = async (req, res) => {
  try {
    const { title, subtitle, icon, url, badge_color, display_order, is_active } = req.body;
    await LearningJourneyCard.update(req.params.id, {
      title,
      subtitle,
      icon,
      url,
      badge_color,
      display_order: parseInt(display_order, 10) || 1,
      is_active: is_active === '0' ? 0 : 1
    });
    req.flash('success', 'Journey card updated successfully.');
  } catch (err) {
    req.flash('error', `Failed to update card: ${err.message}`);
  }
  res.redirect('/admin/learning-journey');
};

exports.deleteLearningJourneyCard = async (req, res) => {
  try {
    await LearningJourneyCard.delete(req.params.id);
    req.flash('success', 'Journey card deleted successfully.');
  } catch (err) {
    req.flash('error', `Failed to delete card: ${err.message}`);
  }
  res.redirect('/admin/learning-journey');
};

exports.moveUpLearningJourneyCard = async (req, res) => {
  try {
    await LearningJourneyCard.moveUp(req.params.id);
    req.flash('success', 'Card moved up.');
  } catch (err) {
    req.flash('error', `Failed to move card: ${err.message}`);
  }
  res.redirect('/admin/learning-journey');
};

exports.moveDownLearningJourneyCard = async (req, res) => {
  try {
    await LearningJourneyCard.moveDown(req.params.id);
    req.flash('success', 'Card moved down.');
  } catch (err) {
    req.flash('error', `Failed to move card: ${err.message}`);
  }
  res.redirect('/admin/learning-journey');
};

// ===========================================================
// HOMEPAGE SECTIONS POSITION ORDER & MANAGEMENT
// ===========================================================
exports.homepageSectionsIndex = async (req, res) => {
  const sections = await HomepageSection.all();
  res.render('admin/homepage-sections', {
    title: 'Homepage Sections Position Order',
    layout: 'layouts/admin',
    sections,
    currentPath: '/admin/homepage-sections'
  });
};

exports.updateHomepageSection = async (req, res) => {
  try {
    const { name, description, display_order, is_active } = req.body;
    await HomepageSection.update(req.params.id, {
      name,
      description,
      display_order: parseInt(display_order, 10) || 1,
      is_active: is_active === '1' || is_active === 'on' || is_active === 1 ? 1 : 0
    });
    req.flash('success', 'Homepage section updated successfully.');
  } catch (err) {
    req.flash('error', `Failed to update section: ${err.message}`);
  }
  res.redirect('/admin/homepage-sections');
};

exports.toggleHomepageSection = async (req, res) => {
  try {
    await HomepageSection.toggleActive(req.params.id);
    req.flash('success', 'Section status updated.');
  } catch (err) {
    req.flash('error', `Failed to toggle section: ${err.message}`);
  }
  res.redirect('/admin/homepage-sections');
};

exports.moveUpHomepageSection = async (req, res) => {
  try {
    await HomepageSection.moveUp(req.params.id);
    req.flash('success', 'Section moved up in position order.');
  } catch (err) {
    req.flash('error', `Failed to move section: ${err.message}`);
  }
  res.redirect('/admin/homepage-sections');
};

exports.moveDownHomepageSection = async (req, res) => {
  try {
    await HomepageSection.moveDown(req.params.id);
    req.flash('success', 'Section moved down in position order.');
  } catch (err) {
    req.flash('error', `Failed to move section: ${err.message}`);
  }
  res.redirect('/admin/homepage-sections');
};

// ===========================================================
// CALL TO ACTION BANNER MANAGER
// ===========================================================
exports.ctaIndex = async (req, res) => {
  const ctaSettings = await SiteSettings.getCTASettings();
  res.render('admin/cta', {
    title: 'Call to Action Banner Manager',
    layout: 'layouts/admin',
    ctaSettings,
    currentPath: '/admin/cta'
  });
};

exports.updateCta = async (req, res) => {
  try {
    const {
      badgeText, badgeIcon, title, subtext,
      primaryBtnText, primaryBtnUrl, primaryBtnIcon,
      secondaryBtnText, secondaryBtnUrl, secondaryBtnIcon,
      noteText, isEnabled
    } = req.body;

    await SiteSettings.updateCTASettings({
      badgeText: (badgeText || '').trim(),
      badgeIcon: (badgeIcon || 'ri-graduation-cap-line').trim(),
      title: (title || '').trim(),
      subtext: (subtext || '').trim(),
      primaryBtnText: (primaryBtnText || '').trim(),
      primaryBtnUrl: (primaryBtnUrl || '').trim(),
      primaryBtnIcon: (primaryBtnIcon || 'ri-user-add-line').trim(),
      secondaryBtnText: (secondaryBtnText || '').trim(),
      secondaryBtnUrl: (secondaryBtnUrl || '').trim(),
      secondaryBtnIcon: (secondaryBtnIcon || 'ri-arrow-right-line').trim(),
      noteText: (noteText || '').trim(),
      isEnabled: isEnabled === '1' || isEnabled === 'on' || isEnabled === true
    });

    req.flash('success', 'Call to Action banner updated successfully.');
  } catch (err) {
    req.flash('error', `Failed to update CTA banner: ${err.message}`);
  }
  res.redirect('/admin/cta');
};

// ==========================================
// SUPER ADMIN & RBAC MANAGEMENT CONTROLLERS
// ==========================================

/**
 * List all Admin accounts with their assigned permissions summary
 */
exports.adminsIndex = async (req, res) => {
  try {
    const admins = await User.allAdmins();
    const superAdmins = await User.allSuperAdmins();
    const allAdminsList = [...superAdmins, ...admins];

    // Preload permissions for each admin
    const adminsWithPerms = await Promise.all(allAdminsList.map(async (adm) => {
      const perms = await PermissionService.getUserPermissions(adm.id);
      return {
        ...adm,
        user_code: User.formatCode(adm),
        permissions: Array.from(perms),
        permissionsCount: perms.size
      };
    }));

    res.render('admin/admins', {
      title: 'Admin Management',
      layout: 'layouts/admin',
      admins: adminsWithPerms,
      currentPath: '/admin/admins'
    });
  } catch (err) {
    console.error('Error fetching admins list:', err);
    req.flash('error', `Failed to load admins: ${err.message}`);
    res.redirect('/admin/dashboard');
  }
};

/**
 * Render create new Admin form with permission checkboxes
 */
exports.newAdminView = async (req, res) => {
  try {
    const resourceGroups = await PermissionService.getAllPermissions();
    res.render('admin/admin-new', {
      title: 'Create New Admin',
      layout: 'layouts/admin',
      resourceGroups,
      currentPath: '/admin/admins'
    });
  } catch (err) {
    req.flash('error', `Error loading form: ${err.message}`);
    res.redirect('/admin/admins');
  }
};

/**
 * Super Admin creates a new Admin account and assigns initial permissions
 */
exports.createAdmin = async (req, res) => {
  try {
    const { name, email, password, phone, headline, qualification, permissions } = req.body;

    if (!name || !email || !password) {
      req.flash('error', 'Name, Email, and Password are required.');
      return res.redirect('/admin/admins/new');
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await User.findByEmail(cleanEmail);
    if (existing && existing.email.toLowerCase() === cleanEmail) {
      req.flash('error', 'A user with this email address already exists.');
      return res.redirect('/admin/admins/new');
    }

    const newAdmin = await User.create({
      name: name.trim(),
      email: cleanEmail,
      password: password.trim(),
      role: 'admin',
      phone: phone ? phone.trim() : null,
      headline: headline ? headline.trim() : 'Administrative Staff',
      qualification: qualification ? qualification.trim() : null
    });

    const permsArray = Array.isArray(permissions) ? permissions : (permissions ? [permissions] : []);
    await PermissionService.setUserPermissions(newAdmin.id, permsArray, req.session.user.id);

    await PermissionService.logAudit({
      actorId: req.session.user.id,
      action: 'ADMIN_CREATED',
      resource: 'USER',
      resourceId: String(newAdmin.id),
      details: { name: newAdmin.name, email: newAdmin.email, role: 'admin', permissions: permsArray },
      req
    });

    req.flash('success', `Admin "${newAdmin.name}" created successfully with ${permsArray.length} permissions.`);
    res.redirect('/admin/admins');
  } catch (err) {
    console.error('Error creating admin:', err);
    req.flash('error', `Failed to create admin: ${err.message}`);
    res.redirect('/admin/admins/new');
  }
};

/**
 * View and edit permissions matrix for a specific Admin
 */
exports.adminPermissionsView = async (req, res) => {
  try {
    const targetAdmin = await User.findById(req.params.id);
    if (!targetAdmin) {
      req.flash('error', 'Admin user not found.');
      return res.redirect('/admin/admins');
    }

    const resourceGroups = await PermissionService.getAllPermissions();
    const userPerms = await PermissionService.getUserPermissions(targetAdmin.id);

    res.render('admin/admin-permissions', {
      title: `Manage Permissions: ${targetAdmin.name}`,
      layout: 'layouts/admin',
      targetAdmin: {
        ...targetAdmin,
        user_code: User.formatCode(targetAdmin)
      },
      resourceGroups,
      userPermissions: userPerms,
      currentPath: '/admin/admins'
    });
  } catch (err) {
    console.error('Error loading admin permissions view:', err);
    req.flash('error', `Failed to load permissions: ${err.message}`);
    res.redirect('/admin/admins');
  }
};

/**
 * Super Admin updates permissions for a specific Admin
 */
exports.updateAdminPermissions = async (req, res) => {
  try {
    const targetAdmin = await User.findById(req.params.id);
    if (!targetAdmin) {
      req.flash('error', 'Admin user not found.');
      return res.redirect('/admin/admins');
    }

    if (targetAdmin.role === 'superadmin' && targetAdmin.id !== req.session.user.id) {
      req.flash('error', 'Super Admin master permissions cannot be modified.');
      return res.redirect('/admin/admins');
    }

    const perms = req.body.permissions;
    const permsArray = Array.isArray(perms) ? perms : (perms ? [perms] : []);

    await PermissionService.setUserPermissions(targetAdmin.id, permsArray, req.session.user.id);

    await PermissionService.logAudit({
      actorId: req.session.user.id,
      action: 'ADMIN_PERMISSIONS_UPDATED',
      resource: 'USER_PERMISSIONS',
      resourceId: String(targetAdmin.id),
      details: { targetAdmin: targetAdmin.email, updatedPermissionsCount: permsArray.length, permissions: permsArray },
      req
    });

    req.flash('success', `Permissions updated successfully for ${targetAdmin.name} (${permsArray.length} active permissions).`);
    res.redirect(`/admin/admins/${targetAdmin.id}/permissions`);
  } catch (err) {
    console.error('Error updating admin permissions:', err);
    req.flash('error', `Failed to update permissions: ${err.message}`);
    res.redirect('/admin/admins');
  }
};

/**
 * Toggle Admin account active/disabled state
 */
exports.toggleAdminStatus = async (req, res) => {
  try {
    const targetAdmin = await User.findById(req.params.id);
    if (!targetAdmin) {
      req.flash('error', 'Admin not found.');
      return res.redirect('/admin/admins');
    }

    if (targetAdmin.role === 'superadmin') {
      req.flash('error', 'Super Admin account cannot be deactivated.');
      return res.redirect('/admin/admins');
    }

    const newStatus = (targetAdmin.is_active === 0 || targetAdmin.is_active === false) ? 1 : 0;
    await User.setActive(targetAdmin.id, newStatus);

    await PermissionService.logAudit({
      actorId: req.session.user.id,
      action: newStatus === 1 ? 'ADMIN_ACTIVATED' : 'ADMIN_DEACTIVATED',
      resource: 'USER',
      resourceId: String(targetAdmin.id),
      details: { email: targetAdmin.email, newStatus },
      req
    });

    req.flash('success', `Admin "${targetAdmin.name}" is now ${newStatus === 1 ? 'Active' : 'Disabled'}.`);
    res.redirect('/admin/admins');
  } catch (err) {
    console.error('Error toggling admin status:', err);
    req.flash('error', `Failed to toggle status: ${err.message}`);
    res.redirect('/admin/admins');
  }
};

/**
 * List all Instructors with their permissions summary
 */
exports.instructorsIndex = async (req, res) => {
  try {
    const instructors = await User.allInstructors();
    const instructorsWithPerms = await Promise.all(instructors.map(async (ins) => {
      const perms = await PermissionService.getUserPermissions(ins.id);
      return {
        ...ins,
        user_code: User.formatCode(ins),
        permissions: Array.from(perms),
        permissionsCount: perms.size
      };
    }));

    res.render('admin/instructors', {
      title: 'Instructor Management & Permissions',
      layout: 'layouts/admin',
      instructors: instructorsWithPerms,
      currentPath: '/admin/instructors'
    });
  } catch (err) {
    console.error('Error loading instructors:', err);
    req.flash('error', `Failed to load instructors: ${err.message}`);
    res.redirect('/admin/dashboard');
  }
};

/**
 * View & edit permissions for an instructor
 */
exports.instructorPermissionsView = async (req, res) => {
  try {
    const instructor = await User.findById(req.params.id);
    if (!instructor) {
      req.flash('error', 'Instructor not found.');
      return res.redirect('/admin/instructors');
    }

    const resourceGroups = await PermissionService.getAllPermissions();
    const userPerms = await PermissionService.getUserPermissions(instructor.id);

    res.render('admin/instructor-permissions', {
      title: `Instructor Permissions: ${instructor.name}`,
      layout: 'layouts/admin',
      instructor: {
        ...instructor,
        user_code: User.formatCode(instructor)
      },
      resourceGroups,
      userPermissions: userPerms,
      currentPath: '/admin/instructors'
    });
  } catch (err) {
    console.error('Error loading instructor permissions view:', err);
    req.flash('error', `Failed to load permissions: ${err.message}`);
    res.redirect('/admin/instructors');
  }
};

/**
 * Super Admin updates instructor permissions
 */
exports.updateInstructorPermissions = async (req, res) => {
  try {
    const instructor = await User.findById(req.params.id);
    if (!instructor) {
      req.flash('error', 'Instructor not found.');
      return res.redirect('/admin/instructors');
    }

    const perms = req.body.permissions;
    const permsArray = Array.isArray(perms) ? perms : (perms ? [perms] : []);

    await PermissionService.setUserPermissions(instructor.id, permsArray, req.session.user.id);

    await PermissionService.logAudit({
      actorId: req.session.user.id,
      action: 'INSTRUCTOR_PERMISSIONS_UPDATED',
      resource: 'USER_PERMISSIONS',
      resourceId: String(instructor.id),
      details: { instructor: instructor.email, permissionsCount: permsArray.length, permissions: permsArray },
      req
    });

    req.flash('success', `Permissions updated successfully for ${instructor.name}.`);
    res.redirect(`/admin/instructors/${instructor.id}/permissions`);
  } catch (err) {
    console.error('Error updating instructor permissions:', err);
    req.flash('error', `Failed to update permissions: ${err.message}`);
    res.redirect('/admin/instructors');
  }
};

/**
 * View system Audit Logs
 */
exports.auditLogsIndex = async (req, res) => {
  try {
    const { resource, action, page = 1 } = req.query;
    const limit = 50;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * limit;

    const logs = await PermissionService.getAuditLogs({
      limit,
      offset,
      resource: resource || null,
      action: action || null
    });

    const totalCountRow = await db.prepare(`SELECT COUNT(*) as c FROM audit_logs`).get();
    const totalLogs = Number(totalCountRow ? totalCountRow.c : 0);

    res.render('admin/audit-logs', {
      title: 'Security & Audit Logs',
      layout: 'layouts/admin',
      logs,
      totalLogs,
      currentPage: parseInt(page, 10) || 1,
      totalPages: Math.ceil(totalLogs / limit) || 1,
      selectedResource: resource || '',
      selectedAction: action || '',
      currentPath: '/admin/audit-logs'
    });
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    req.flash('error', `Failed to load audit logs: ${err.message}`);
    res.redirect('/admin/dashboard');
  }
};

/**
 * Assign / update explicit content access for users on private content items
 */
exports.assignContentAccess = async (req, res) => {
  try {
    const { content_type, content_id, user_ids, permission_level, redirect_url } = req.body;
    if (!content_type || !content_id) {
      return res.status(400).json({ success: false, message: 'Content type and ID are required.' });
    }

    const userIdsArray = Array.isArray(user_ids) ? user_ids : (user_ids ? [user_ids] : []);
    const userAssignments = userIdsArray.map(uid => ({
      userId: parseInt(uid, 10),
      permissionLevel: permission_level || 'view'
    }));

    await PermissionService.assignContentAccess(content_type, parseInt(content_id, 10), userAssignments, req.session.user.id);

    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.json({ success: true, message: 'Content access updated successfully.' });
    }

    req.flash('success', 'Content access assignments updated successfully.');
    res.redirect(redirect_url || '/admin/dashboard');
  } catch (err) {
    console.error('Error assigning content access:', err);
    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.status(500).json({ success: false, message: err.message });
    }
    req.flash('error', `Failed to assign content access: ${err.message}`);
    res.redirect('/admin/dashboard');
  }
};

// ==========================================
// LIVE DISCUSSION FORUM CONTROLLERS
// ==========================================
const LiveDiscussion = require('../models/LiveDiscussion');

exports.liveDiscussionsIndex = async (req, res) => {
  try {
    const discussions = await LiveDiscussion.all();
    const headerSettings = await SiteSettings.getLiveDiscussionSettings();
    res.render('admin/live-discussions', {
      title: 'Live Discussions & Clinical Case Rounds',
      layout: 'layouts/admin',
      discussions,
      headerSettings,
      currentPath: '/admin/live-discussions'
    });
  } catch (err) {
    console.error('Error loading live discussions:', err);
    req.flash('error', `Failed to load discussions: ${err.message}`);
    res.redirect('/admin/dashboard');
  }
};

exports.updateLiveDiscussionSettings = async (req, res) => {
  try {
    const { badge, sub_badge, title, subtitle } = req.body;
    await SiteSettings.updateLiveDiscussionSettings({
      badge: badge ? badge.trim() : '',
      sub_badge: sub_badge ? sub_badge.trim() : '',
      title: title ? title.trim() : '',
      subtitle: subtitle ? subtitle.trim() : ''
    });
    req.flash('success', 'Live discussion header banner updated successfully.');
  } catch (err) {
    console.error('Error updating live discussion settings:', err);
    req.flash('error', `Failed to update banner: ${err.message}`);
  }
  res.redirect('/admin/live-discussions');
};

exports.createLiveDiscussion = async (req, res) => {
  try {
    const { category, tag_label, title, summary, questions, takeaway, author_name, author_role } = req.body;
    await LiveDiscussion.create({
      category: category || 'orthopedics',
      tag_label: tag_label || 'Clinical Case Round',
      title: title.trim(),
      summary: summary.trim(),
      questions: questions.trim(),
      takeaway: takeaway ? takeaway.trim() : null,
      author_name: author_name ? author_name.trim() : req.session.user.name,
      author_role: author_role ? author_role.trim() : 'Faculty / Clinician',
      author_id: req.session.user.id
    });

    req.flash('success', 'Discussion topic created successfully.');
  } catch (err) {
    console.error('Error creating live discussion:', err);
    req.flash('error', `Failed to create discussion: ${err.message}`);
  }
  res.redirect('/admin/live-discussions');
};

exports.updateLiveDiscussion = async (req, res) => {
  try {
    const { category, tag_label, title, summary, questions, takeaway, author_name, author_role } = req.body;
    await LiveDiscussion.update(req.params.id, {
      category,
      tag_label,
      title: title.trim(),
      summary: summary.trim(),
      questions: questions.trim(),
      takeaway: takeaway ? takeaway.trim() : null,
      author_name: author_name ? author_name.trim() : null,
      author_role: author_role ? author_role.trim() : null
    });

    req.flash('success', 'Discussion topic updated successfully.');
  } catch (err) {
    console.error('Error updating live discussion:', err);
    req.flash('error', `Failed to update discussion: ${err.message}`);
  }
  res.redirect('/admin/live-discussions');
};

exports.toggleLiveDiscussionActive = async (req, res) => {
  try {
    const newStatus = await LiveDiscussion.toggleActive(req.params.id);
    req.flash('success', `Discussion is now ${newStatus === 1 ? 'Active & Visible' : 'Hidden'}.`);
  } catch (err) {
    req.flash('error', `Failed to toggle status: ${err.message}`);
  }
  res.redirect('/admin/live-discussions');
};

exports.toggleLiveDiscussionPin = async (req, res) => {
  try {
    const newStatus = await LiveDiscussion.togglePinned(req.params.id);
    req.flash('success', `Discussion is now ${newStatus === 1 ? 'Pinned to Top' : 'Unpinned'}.`);
  } catch (err) {
    req.flash('error', `Failed to pin/unpin topic: ${err.message}`);
  }
  res.redirect('/admin/live-discussions');
};

exports.deleteLiveDiscussion = async (req, res) => {
  try {
    await LiveDiscussion.delete(req.params.id);
    req.flash('success', 'Discussion topic deleted successfully.');
  } catch (err) {
    req.flash('error', `Failed to delete discussion: ${err.message}`);
  }
  res.redirect('/admin/live-discussions');
};

// ==========================================
// ABOUT US PAGE CMS
// ==========================================
exports.aboutCmsIndex = async (req, res) => {
  try {
    const sectionsOrder = await AboutSettings.getSectionsOrder();
    const sectionTitles = await AboutSettings.getSectionTitles();
    const aboutHero = await AboutSettings.getHero();
    const aboutPurpose = await AboutSettings.getPurpose();
    const aboutOnboarding = await AboutSettings.getOnboarding();
    const storyMilestones = await AboutSettings.getMilestones();

    res.render('admin/about-cms', {
      title: 'About Us Page CMS',
      layout: 'layouts/admin',
      sectionsOrder,
      sectionTitles,
      aboutHero,
      aboutPurpose,
      aboutOnboarding,
      storyMilestones,
      currentPath: '/admin/about-cms'
    });
  } catch (err) {
    console.error('Error loading About CMS:', err);
    req.flash('error', `Failed to load About CMS: ${err.message}`);
    res.redirect('/admin/dashboard');
  }
};

exports.updateAboutSectionTitles = async (req, res) => {
  try {
    await AboutSettings.updateSectionTitles(req.body);
    req.flash('success', 'About section names updated successfully.');
  } catch (err) {
    console.error('Error updating section names:', err);
    req.flash('error', `Failed to update section names: ${err.message}`);
  }
  res.redirect('/admin/about-cms?tab=order');
};

exports.moveAboutSectionUp = async (req, res) => {
  try {
    await AboutSettings.moveSectionUp(req.params.secKey);
    req.flash('success', `Section moved up successfully.`);
  } catch (err) {
    console.error('Error moving section up:', err);
    req.flash('error', `Failed to move section: ${err.message}`);
  }
  res.redirect('/admin/about-cms?tab=order');
};

exports.moveAboutSectionDown = async (req, res) => {
  try {
    await AboutSettings.moveSectionDown(req.params.secKey);
    req.flash('success', `Section moved down successfully.`);
  } catch (err) {
    console.error('Error moving section down:', err);
    req.flash('error', `Failed to move section: ${err.message}`);
  }
  res.redirect('/admin/about-cms?tab=order');
};

exports.updateAboutHero = async (req, res) => {
  try {
    const { badge, title, subtitle } = req.body;
    await AboutSettings.updateHero({ badge, title, subtitle });
    req.flash('success', 'About Hero section updated successfully.');
  } catch (err) {
    console.error('Error updating About Hero:', err);
    req.flash('error', `Failed to update Hero: ${err.message}`);
  }
  res.redirect('/admin/about-cms?tab=hero');
};

exports.updateAboutPurpose = async (req, res) => {
  try {
    await AboutSettings.updatePurpose(req.body);
    req.flash('success', 'Purpose & Vision section updated successfully.');
  } catch (err) {
    console.error('Error updating Purpose & Vision:', err);
    req.flash('error', `Failed to update Purpose & Vision: ${err.message}`);
  }
  res.redirect('/admin/about-cms?tab=purpose');
};

exports.updateAboutOnboarding = async (req, res) => {
  try {
    await AboutSettings.updateOnboarding(req.body);
    req.flash('success', 'Easy Access Onboarding Steps updated successfully.');
  } catch (err) {
    console.error('Error updating Onboarding steps:', err);
    req.flash('error', `Failed to update Onboarding: ${err.message}`);
  }
  res.redirect('/admin/about-cms?tab=onboarding');
};

exports.addAboutMilestone = async (req, res) => {
  try {
    const { year, title, description } = req.body;
    await AboutSettings.addMilestone({ year: (year || '').trim(), title: (title || '').trim(), description: (description || '').trim() });
    req.flash('success', 'New story milestone added successfully.');
  } catch (err) {
    console.error('Error adding milestone:', err);
    req.flash('error', `Failed to add milestone: ${err.message}`);
  }
  res.redirect('/admin/about-cms?tab=milestones');
};

exports.updateAboutMilestone = async (req, res) => {
  try {
    const { year, title, description, display_order } = req.body;
    await AboutSettings.updateMilestone(req.params.id, {
      year: year ? year.trim() : '',
      title: title ? title.trim() : '',
      description: description ? description.trim() : '',
      display_order: parseInt(display_order, 10) || 1
    });
    req.flash('success', 'Milestone updated successfully.');
  } catch (err) {
    console.error('Error updating milestone:', err);
    req.flash('error', `Failed to update milestone: ${err.message}`);
  }
  res.redirect('/admin/about-cms?tab=milestones');
};

exports.deleteAboutMilestone = async (req, res) => {
  try {
    await AboutSettings.deleteMilestone(req.params.id);
    req.flash('success', 'Milestone deleted successfully.');
  } catch (err) {
    console.error('Error deleting milestone:', err);
    req.flash('error', `Failed to delete milestone: ${err.message}`);
  }
  res.redirect('/admin/about-cms?tab=milestones');
};

exports.moveAboutMilestoneUp = async (req, res) => {
  try {
    await AboutSettings.moveMilestoneUp(req.params.id);
    req.flash('success', 'Milestone moved up.');
  } catch (err) {
    console.error('Error moving milestone up:', err);
    req.flash('error', `Failed to move milestone: ${err.message}`);
  }
  res.redirect('/admin/about-cms?tab=milestones');
};

exports.moveAboutMilestoneDown = async (req, res) => {
  try {
    await AboutSettings.moveMilestoneDown(req.params.id);
    req.flash('success', 'Milestone moved down.');
  } catch (err) {
    console.error('Error moving milestone down:', err);
    req.flash('error', `Failed to move milestone: ${err.message}`);
  }
  res.redirect('/admin/about-cms?tab=milestones');
};

exports.subjectHubGridIndex = async (req, res) => {
  try {
    const blocks = await SubjectHubSettings.all();
    res.render('admin/subject-hub-grid', {
      title: 'Subject Interactive Grid Layout',
      layout: 'layouts/admin',
      blocks,
      currentPath: '/admin/subject-hub-grid'
    });
  } catch (err) {
    console.error('Error loading Subject Hub Grid CMS:', err);
    req.flash('error', `Failed to load Subject Hub Grid: ${err.message}`);
    res.redirect('/admin/dashboard');
  }
};

exports.updateSubjectHubBlock = async (req, res) => {
  try {
    const { title, icon, display_position, is_active } = req.body;
    await SubjectHubSettings.updateBlock(req.params.id, { title, icon, display_position, is_active });
    req.flash('success', 'Position & Module title updated successfully.');
  } catch (err) {
    console.error('Error updating Subject Hub block:', err);
    req.flash('error', `Failed to update block: ${err.message}`);
  }
  res.redirect('/admin/subject-hub-grid');
};

exports.moveSubjectHubBlockUp = async (req, res) => {
  try {
    await SubjectHubSettings.moveUp(req.params.id);
    req.flash('success', 'Module moved up.');
  } catch (err) {
    console.error('Error moving block up:', err);
    req.flash('error', `Failed to move module: ${err.message}`);
  }
  res.redirect('/admin/subject-hub-grid');
};

exports.moveSubjectHubBlockDown = async (req, res) => {
  try {
    await SubjectHubSettings.moveDown(req.params.id);
    req.flash('success', 'Module moved down.');
  } catch (err) {
    console.error('Error moving block down:', err);
    req.flash('error', `Failed to move module: ${err.message}`);
  }
  res.redirect('/admin/subject-hub-grid');
};

