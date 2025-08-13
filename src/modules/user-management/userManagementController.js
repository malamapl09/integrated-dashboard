const UserManagementService = require('./userManagementService');

class UserManagementController {
  constructor() {
    this.userService = new UserManagementService();
  }

  /**
   * Get all users with pagination and filtering
   */
  async getUsers(req, res) {
    try {
      // Check if user has permission
      if (!this.userService.hasPermission(req.user.role, 'user_management')) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to manage users'
        });
      }

      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 10,
        search: req.query.search || '',
        role: req.query.role || '',
        active: req.query.active !== undefined ? req.query.active === 'true' : null,
        sortBy: req.query.sortBy || 'created_at',
        sortOrder: req.query.sortOrder || 'DESC'
      };

      const result = await this.userService.getUsers(options);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch users'
      });
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(req, res) {
    try {
      if (!this.userService.hasPermission(req.user.role, 'user_management')) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }

      const { id } = req.params;
      const user = await this.userService.getUserById(id);

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      console.error('Error fetching user:', error);
      const statusCode = error.message === 'User not found' ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to fetch user'
      });
    }
  }

  /**
   * Create new user
   */
  async createUser(req, res) {
    try {
      if (!this.userService.hasPermission(req.user.role, 'user_management')) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to create users'
        });
      }

      const { username, email, password, firstName, lastName, role } = req.body;

      // Validation
      if (!username || !email || !password || !firstName || !lastName) {
        return res.status(400).json({
          success: false,
          message: 'All required fields must be provided'
        });
      }

      // Only admins can create admin users
      if (role === 'admin' && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Only admin users can create admin accounts'
        });
      }

      const user = await this.userService.createUser({
        username,
        email,
        password,
        firstName,
        lastName,
        role: role || 'user'
      }, req.user.id);

      res.status(201).json({
        success: true,
        data: user,
        message: 'User created successfully'
      });
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create user'
      });
    }
  }

  /**
   * Update user
   */
  async updateUser(req, res) {
    try {
      if (!this.userService.hasPermission(req.user.role, 'user_management')) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to update users'
        });
      }

      const { id } = req.params;
      const { username, email, firstName, lastName, role, active } = req.body;

      // Only admins can change roles or activate/deactivate users
      if ((role !== undefined || active !== undefined) && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Only admin users can change roles or user status'
        });
      }

      // Only admins can create admin users
      if (role === 'admin' && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Only admin users can assign admin role'
        });
      }

      const user = await this.userService.updateUser(id, {
        username,
        email,
        firstName,
        lastName,
        role,
        active
      }, req.user.id);

      res.json({
        success: true,
        data: user,
        message: 'User updated successfully'
      });
    } catch (error) {
      console.error('Error updating user:', error);
      const statusCode = error.message === 'User not found' ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to update user'
      });
    }
  }

  /**
   * Change user password
   */
  async changePassword(req, res) {
    try {
      if (!this.userService.hasPermission(req.user.role, 'user_management')) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }

      const { id } = req.params;
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters long'
        });
      }

      await this.userService.changePassword(id, newPassword, req.user.id);

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      console.error('Error changing password:', error);
      const statusCode = error.message === 'User not found' ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to change password'
      });
    }
  }

  /**
   * Toggle user active status
   */
  async toggleUserStatus(req, res) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Only admin users can change user status'
        });
      }

      const { id } = req.params;
      const newStatus = await this.userService.toggleUserStatus(id, req.user.id);

      res.json({
        success: true,
        data: { active: newStatus },
        message: `User ${newStatus ? 'activated' : 'deactivated'} successfully`
      });
    } catch (error) {
      console.error('Error toggling user status:', error);
      const statusCode = error.message === 'User not found' ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to update user status'
      });
    }
  }

  /**
   * Delete user
   */
  async deleteUser(req, res) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Only admin users can delete users'
        });
      }

      const { id } = req.params;
      
      // Prevent self-deletion
      if (parseInt(id) === req.user.id) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete your own account'
        });
      }

      await this.userService.deleteUser(id, req.user.id);

      res.json({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting user:', error);
      const statusCode = error.message === 'User not found' ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to delete user'
      });
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(req, res) {
    try {
      if (!this.userService.hasPermission(req.user.role, 'user_management')) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }

      const stats = await this.userService.getUserStats();

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error fetching user stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch user statistics'
      });
    }
  }

  /**
   * Get recent user activities
   */
  async getRecentActivities(req, res) {
    try {
      if (!this.userService.hasPermission(req.user.role, 'user_management')) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }

      const limit = parseInt(req.query.limit) || 10;
      const activities = await this.userService.getRecentUserActivities(limit);

      res.json({
        success: true,
        data: activities
      });
    } catch (error) {
      console.error('Error fetching recent activities:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch recent activities'
      });
    }
  }

  /**
   * Unlock user account
   */
  async unlockUser(req, res) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Only admin users can unlock accounts'
        });
      }

      const { id } = req.params;
      await this.userService.unlockUser(id, req.user.id);

      res.json({
        success: true,
        message: 'User account unlocked successfully'
      });
    } catch (error) {
      console.error('Error unlocking user:', error);
      const statusCode = error.message === 'User not found' ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to unlock user account'
      });
    }
  }

  /**
   * Get available roles
   */
  async getRoles(req, res) {
    try {
      if (!this.userService.hasPermission(req.user.role, 'user_management')) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }

      const roles = [
        { value: 'user', label: 'User', description: 'Basic user with limited access' },
        { value: 'manager', label: 'Manager', description: 'Manager with extended permissions' },
        { value: 'admin', label: 'Administrator', description: 'Full system access' }
      ];

      // Non-admin users can't see admin role
      const filteredRoles = req.user.role === 'admin' 
        ? roles 
        : roles.filter(role => role.value !== 'admin');

      res.json({
        success: true,
        data: filteredRoles
      });
    } catch (error) {
      console.error('Error fetching roles:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch roles'
      });
    }
  }

  /**
   * Get user permissions
   */
  async getUserPermissions(req, res) {
    try {
      const { role } = req.query;
      const userRole = role || req.user.role;
      
      const permissions = this.userService.getRolePermissions(userRole);

      res.json({
        success: true,
        data: {
          role: userRole,
          permissions
        }
      });
    } catch (error) {
      console.error('Error fetching permissions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch permissions'
      });
    }
  }

  /**
   * Export users to Excel
   */
  async exportUsersExcel(req, res) {
    try {
      if (!this.userService.hasPermission(req.user.role, 'user_management')) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }

      const options = {
        page: 1,
        limit: parseInt(req.query.limit) || 1000,
        search: req.query.search || '',
        role: req.query.role || '',
        active: req.query.active !== undefined ? req.query.active === 'true' : null,
        sortBy: req.query.sortBy || 'created_at',
        sortOrder: req.query.sortOrder || 'DESC'
      };

      const result = await this.userService.getUsers(options);
      
      const exportData = result.users.map(user => ({
        'Username': user.username,
        'Email': user.email,
        'First Name': user.first_name,
        'Last Name': user.last_name,
        'Role': user.role,
        'Status': user.active ? 'Active' : 'Inactive',
        'Last Login': user.last_login || 'Never',
        'Created Date': user.created_at,
        'Created By': user.created_by_username || 'System'
      }));

      const exportService = require('../../shared/services/exportService');
      const excelBuffer = exportService.generateExcel({
        title: 'Users Report',
        data: exportData,
        sheetName: 'Users',
        metadata: {
          generatedBy: `${req.user.first_name} ${req.user.last_name}`,
          dateGenerated: new Date(),
          totalRecords: exportData.length,
          filters: JSON.stringify(options)
        }
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=users_${new Date().toISOString().split('T')[0]}.xlsx`);
      res.send(excelBuffer);

    } catch (error) {
      console.error('Error exporting users to Excel:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export users to Excel'
      });
    }
  }

  /**
   * Export users to PDF
   */
  async exportUsersPDF(req, res) {
    try {
      if (!this.userService.hasPermission(req.user.role, 'user_management')) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }

      const options = {
        page: 1,
        limit: parseInt(req.query.limit) || 1000,
        search: req.query.search || '',
        role: req.query.role || '',
        active: req.query.active !== undefined ? req.query.active === 'true' : null,
        sortBy: req.query.sortBy || 'created_at',
        sortOrder: req.query.sortOrder || 'DESC'
      };

      const result = await this.userService.getUsers(options);

      const columns = [
        { key: 'username', header: 'Username', align: 'left' },
        { key: 'first_name', header: 'First Name', align: 'left' },
        { key: 'last_name', header: 'Last Name', align: 'left' },
        { key: 'email', header: 'Email', align: 'left' },
        { key: 'role', header: 'Role', align: 'center' },
        { key: 'active', header: 'Status', align: 'center' },
        { key: 'created_at', header: 'Created', align: 'center', type: 'date' }
      ];

      const exportData = result.users.map(user => ({
        ...user,
        active: user.active ? 'Active' : 'Inactive'
      }));

      const exportService = require('../../shared/services/exportService');
      const pdfBuffer = await exportService.generatePDF({
        title: 'Users Report',
        data: exportData,
        columns: columns,
        metadata: {
          generatedBy: `${req.user.first_name} ${req.user.last_name}`,
          dateGenerated: new Date(),
          totalRecords: exportData.length
        }
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=users_${new Date().toISOString().split('T')[0]}.pdf`);
      res.send(pdfBuffer);

    } catch (error) {
      console.error('Error exporting users to PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export users to PDF'
      });
    }
  }
}

module.exports = UserManagementController;