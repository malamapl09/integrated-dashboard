const express = require('express');
const UserManagementController = require('../modules/user-management/userManagementController');
const authMiddleware = require('../shared/middleware/authMiddleware');

const router = express.Router();
const userController = new UserManagementController();

// All user management routes require authentication
router.use(authMiddleware.authenticate());

// User CRUD operations
router.get('/', userController.getUsers.bind(userController));
router.get('/stats', userController.getUserStats.bind(userController));
router.get('/activities', userController.getRecentActivities.bind(userController));
router.get('/roles', userController.getRoles.bind(userController));
router.get('/permissions', userController.getUserPermissions.bind(userController));
router.post('/', userController.createUser.bind(userController));
router.get('/:id', userController.getUserById.bind(userController));
router.put('/:id', userController.updateUser.bind(userController));
router.delete('/:id', userController.deleteUser.bind(userController));

// Special operations
router.put('/:id/password', userController.changePassword.bind(userController));
router.put('/:id/toggle-status', userController.toggleUserStatus.bind(userController));
router.put('/:id/unlock', userController.unlockUser.bind(userController));

// Export routes
router.get('/export/excel', userController.exportUsersExcel.bind(userController));
router.get('/export/pdf', userController.exportUsersPDF.bind(userController));

module.exports = router;