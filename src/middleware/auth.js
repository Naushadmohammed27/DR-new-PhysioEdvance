const User = require('../models/User');
const PermissionService = require('../services/permissionService');

async function attachUser(req, res, next) {
  const user = req.session.user || null;
  res.locals.currentUser = user;
  res.locals.currentPath = req.path;
  res.locals.isSuperAdmin = user && (user.role === 'superadmin' || user.role === 'admin');
  res.locals.isAdmin = user && (user.role === 'admin' || user.role === 'superadmin');
  res.locals.isInstructor = user && (user.role === 'instructor' || user.role === 'superadmin' || user.role === 'admin');

  // Helper available in EJS templates: hasPermission('COURSE', 'CREATE')
  res.locals.hasPermission = (resource, action) => {
    if (user && (user.role === 'superadmin' || user.role === 'admin')) return true;
    return PermissionService.hasPermissionSync(user, resource, action);
  };

  res.locals.hasModulePermission = (moduleKey) => {
    if (user && (user.role === 'superadmin' || user.role === 'admin')) return true;
    return PermissionService.hasModulePermissionSync(user, moduleKey);
  };

  next();
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.flash('error', 'Please log in to continue.');
    return res.redirect('/auth/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  // Check if account is active
  if (req.session.user.is_active === 0 || req.session.user.is_active === false) {
    req.session.destroy(() => {});
    return res.status(403).render('public/404', {
      title: 'Account Disabled',
      message: 'Your administrative access has been disabled. Please contact the Super Admin.'
    });
  }
  next();
}

function requireGuest(req, res, next) {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  next();
}

/**
 * Enforce role hierarchy:
 * - 'superadmin' automatically satisfies 'admin' and 'instructor' requirements
 * - 'admin' satisfies 'instructor' where applicable
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      req.flash('error', 'Please log in to continue.');
      return res.redirect('/auth/login');
    }

    const userRole = req.session.user.role;

    // Super Admin has master authority over all roles
    if (userRole === 'superadmin') {
      return next();
    }

    // Role matching
    let isAllowed = roles.includes(userRole);
    if (!isAllowed && roles.includes('instructor') && userRole === 'admin') {
      isAllowed = true; // Admin can access instructor interfaces
    }

    if (!isAllowed) {
      if (req.xhr || req.headers.accept?.includes('json')) {
        return res.status(403).json({ success: false, message: "You don't have permission to perform this action." });
      }
      req.flash('error', "You don't have permission to access that page.");
      return res.redirect(userRole === 'admin' ? '/admin/dashboard' : userRole === 'instructor' ? '/instructor/dashboard' : '/dashboard');
    }

    next();
  };
}

/**
 * Restrict endpoint strictly to Super Admin
 */
function requireSuperAdmin(req, res, next) {
  if (!req.session.user) {
    req.flash('error', 'Please log in to continue.');
    return res.redirect('/auth/login');
  }
  if (!['superadmin', 'admin'].includes(req.session.user.role)) {
    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.status(403).json({ success: false, message: "Only Super Admin is authorized to perform this operation." });
    }
    req.flash('error', 'Access denied. Only Super Admin has access to this module.');
    return res.redirect('/admin/dashboard');
  }
  next();
}

/**
 * Enforce granular resource-action permission
 * @param {string} resource - e.g. 'COURSE', 'BLOG', 'LIVE_CLASS'
 * @param {string} action - e.g. 'CREATE', 'EDIT', 'DELETE', 'PUBLISH'
 */
function requirePermission(resource, action) {
  return async (req, res, next) => {
    if (!req.session.user) {
      req.flash('error', 'Please log in to continue.');
      return res.redirect('/auth/login');
    }

    const user = req.session.user;

    // Super Admin and Admin have full master bypass
    if (user.role === 'superadmin' || user.role === 'admin') {
      return next();
    }

    const isPermitted = await PermissionService.hasPermission(user, resource, action);
    if (!isPermitted) {
      await PermissionService.logAudit({
        actorId: user.id,
        action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        resource: resource.toUpperCase(),
        details: JSON.stringify({ attemptedAction: action, path: req.originalUrl, method: req.method }),
        req
      });

      if (req.xhr || req.headers.accept?.includes('json')) {
        return res.status(403).json({
          success: false,
          message: `You don't have permission to ${action.toLowerCase()} ${resource.toLowerCase().replace(/_/g, ' ')}.`
        });
      }

      req.flash('error', `You don't have permission to ${action.toLowerCase()} ${resource.toLowerCase().replace(/_/g, ' ')}.`);
      return res.redirect(user.role === 'instructor' ? '/instructor/dashboard' : '/admin/dashboard');
    }

    next();
  };
}

// Refresh session user from DB and sync their permissions
async function refreshUser(req, res, next) {
  if (req.session.user) {
    const fresh = await User.findById(req.session.user.id);
    if (fresh && fresh.is_active !== 0) {
      const perms = await PermissionService.getUserPermissions(fresh.id);
      req.session.user = {
        id: fresh.id,
        name: fresh.name,
        email: fresh.email,
        role: fresh.role,
        avatar: fresh.avatar,
        phone: fresh.phone,
        user_code: fresh.user_code,
        is_active: fresh.is_active,
        permissions: Array.from(perms)
      };
    } else {
      req.session.destroy(() => {});
    }
  }
  next();
}

module.exports = {
  attachUser,
  requireAuth,
  requireGuest,
  requireRole,
  requireSuperAdmin,
  requirePermission,
  refreshUser
};
