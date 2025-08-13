const { database } = require('../../shared/database');
const bcrypt = require('bcrypt');

class UserManagementService {
  constructor() {
    this.db = database.sqlite;
    this.validRoles = ['admin', 'manager', 'user'];
  }

  /**
   * Get all users with pagination and filtering
   */
  async getUsers(options = {}) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        search = '', 
        role = '', 
        active = null,
        sortBy = 'created_at',
        sortOrder = 'DESC'
      } = options;

      const offset = (page - 1) * limit;
      let whereClause = '1=1';
      const params = [];

      // Build WHERE clause
      if (search) {
        whereClause += ` AND (username LIKE ? OR email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)`;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
      }

      if (role) {
        whereClause += ` AND role = ?`;
        params.push(role);
      }

      if (active !== null) {
        whereClause += ` AND active = ?`;
        params.push(active ? 1 : 0);
      }

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM users WHERE ${whereClause}`;
      const [countResult] = await this.db.execute(countQuery, params);
      const total = countResult[0].total;

      // Get users
      const validSortColumns = ['username', 'email', 'first_name', 'last_name', 'role', 'created_at', 'last_login'];
      const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
      const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const usersQuery = `
        SELECT 
          id, username, email, first_name, last_name, role, active, 
          last_login, password_changed_at, failed_login_attempts, 
          locked_until, created_at, updated_at,
          (SELECT username FROM users u2 WHERE u2.id = users.created_by) as created_by_username
        FROM users 
        WHERE ${whereClause}
        ORDER BY ${sortColumn} ${order}
        LIMIT ? OFFSET ?
      `;

      const [users] = await this.db.execute(usersQuery, [...params, parseInt(limit), offset]);

      return {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching users:', error);
      throw new Error('Failed to fetch users');
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(id) {
    try {
      const [users] = await this.db.execute(
        `SELECT 
          id, username, email, first_name, last_name, role, active, 
          last_login, password_changed_at, failed_login_attempts, 
          locked_until, created_at, updated_at,
          (SELECT username FROM users u2 WHERE u2.id = users.created_by) as created_by_username
        FROM users 
        WHERE id = ?`,
        [id]
      );

      if (!users.length) {
        throw new Error('User not found');
      }

      return users[0];
    } catch (error) {
      console.error('Error fetching user:', error);
      throw error;
    }
  }

  /**
   * Create new user
   */
  async createUser(userData, createdBy) {
    try {
      const { username, email, password, firstName, lastName, role = 'user' } = userData;

      // Validation
      if (!username || !email || !password || !firstName || !lastName) {
        throw new Error('All required fields must be provided');
      }

      if (!this.validRoles.includes(role)) {
        throw new Error('Invalid role specified');
      }

      // Check if username or email already exists
      const [existing] = await this.db.execute(
        'SELECT id FROM users WHERE username = ? OR email = ?',
        [username, email]
      );

      if (existing.length > 0) {
        throw new Error('Username or email already exists');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Insert user
      const [result] = await this.db.execute(
        `INSERT INTO users (username, email, password_hash, first_name, last_name, role, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [username, email, passwordHash, firstName, lastName, role, createdBy]
      );

      return {
        id: result.insertId,
        username,
        email,
        firstName,
        lastName,
        role
      };
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  /**
   * Update user
   */
  async updateUser(id, userData, updatedBy) {
    try {
      const { username, email, firstName, lastName, role, active } = userData;

      // Get current user
      const currentUser = await this.getUserById(id);

      // Build update query dynamically
      const updates = [];
      const params = [];

      if (username !== undefined && username !== currentUser.username) {
        // Check if new username exists
        const [existing] = await this.db.execute(
          'SELECT id FROM users WHERE username = ? AND id != ?',
          [username, id]
        );
        if (existing.length > 0) {
          throw new Error('Username already exists');
        }
        updates.push('username = ?');
        params.push(username);
      }

      if (email !== undefined && email !== currentUser.email) {
        // Check if new email exists
        const [existing] = await this.db.execute(
          'SELECT id FROM users WHERE email = ? AND id != ?',
          [email, id]
        );
        if (existing.length > 0) {
          throw new Error('Email already exists');
        }
        updates.push('email = ?');
        params.push(email);
      }

      if (firstName !== undefined) {
        updates.push('first_name = ?');
        params.push(firstName);
      }

      if (lastName !== undefined) {
        updates.push('last_name = ?');
        params.push(lastName);
      }

      if (role !== undefined && this.validRoles.includes(role)) {
        updates.push('role = ?');
        params.push(role);
      }

      if (active !== undefined) {
        updates.push('active = ?');
        params.push(active ? 1 : 0);
      }

      if (updates.length === 0) {
        throw new Error('No valid updates provided');
      }

      // Add updated timestamp
      updates.push('updated_at = CURRENT_TIMESTAMP');

      // Execute update
      const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
      params.push(id);

      const [result] = await this.db.execute(query, params);

      if (result.affectedRows === 0) {
        throw new Error('User not found');
      }

      return await this.getUserById(id);
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  /**
   * Change user password
   */
  async changePassword(id, newPassword, changedBy) {
    try {
      const passwordHash = await bcrypt.hash(newPassword, 12);

      const [result] = await this.db.execute(
        `UPDATE users 
         SET password_hash = ?, password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [passwordHash, id]
      );

      if (result.affectedRows === 0) {
        throw new Error('User not found');
      }

      return true;
    } catch (error) {
      console.error('Error changing password:', error);
      throw error;
    }
  }

  /**
   * Toggle user active status
   */
  async toggleUserStatus(id, updatedBy) {
    try {
      const currentUser = await this.getUserById(id);
      const newStatus = !currentUser.active;

      const [result] = await this.db.execute(
        'UPDATE users SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newStatus ? 1 : 0, id]
      );

      if (result.affectedRows === 0) {
        throw new Error('User not found');
      }

      return newStatus;
    } catch (error) {
      console.error('Error toggling user status:', error);
      throw error;
    }
  }

  /**
   * Delete user (soft delete by deactivating)
   */
  async deleteUser(id, deletedBy) {
    try {
      // Don't allow deletion of admin user
      const user = await this.getUserById(id);
      if (user.role === 'admin' && user.username === 'admin') {
        throw new Error('Cannot delete the default admin user');
      }

      const [result] = await this.db.execute(
        'UPDATE users SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [id]
      );

      if (result.affectedRows === 0) {
        throw new Error('User not found');
      }

      return true;
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats() {
    try {
      const [totalUsers] = await this.db.execute('SELECT COUNT(*) as count FROM users');
      const [activeUsers] = await this.db.execute('SELECT COUNT(*) as count FROM users WHERE active = 1');
      const [adminUsers] = await this.db.execute('SELECT COUNT(*) as count FROM users WHERE role = "admin"');
      const [managerUsers] = await this.db.execute('SELECT COUNT(*) as count FROM users WHERE role = "manager"');
      const [regularUsers] = await this.db.execute('SELECT COUNT(*) as count FROM users WHERE role = "user"');
      const [recentLogins] = await this.db.execute(
        'SELECT COUNT(*) as count FROM users WHERE last_login > datetime("now", "-7 days")'
      );

      return {
        total: totalUsers[0].count,
        active: activeUsers[0].count,
        inactive: totalUsers[0].count - activeUsers[0].count,
        byRole: {
          admin: adminUsers[0].count,
          manager: managerUsers[0].count,
          user: regularUsers[0].count
        },
        recentLogins: recentLogins[0].count
      };
    } catch (error) {
      console.error('Error fetching user stats:', error);
      throw error;
    }
  }

  /**
   * Get recent user activities
   */
  async getRecentUserActivities(limit = 10) {
    try {
      const [activities] = await this.db.execute(
        `SELECT 
          username, first_name, last_name, last_login, created_at
        FROM users 
        WHERE last_login IS NOT NULL
        ORDER BY last_login DESC 
        LIMIT ?`,
        [limit]
      );

      return activities;
    } catch (error) {
      console.error('Error fetching recent activities:', error);
      throw error;
    }
  }

  /**
   * Unlock user account
   */
  async unlockUser(id, unlockedBy) {
    try {
      const [result] = await this.db.execute(
        `UPDATE users 
         SET failed_login_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [id]
      );

      if (result.affectedRows === 0) {
        throw new Error('User not found');
      }

      return true;
    } catch (error) {
      console.error('Error unlocking user:', error);
      throw error;
    }
  }

  /**
   * Get role-based permissions
   */
  getRolePermissions(role) {
    const permissions = {
      admin: [
        'user_management',
        'quote_management',
        'client_management',
        'logs_access',
        'catalog_management',
        'sales_analytics',
        'system_settings',
        'export_data'
      ],
      manager: [
        'quote_management',
        'client_management',
        'logs_access',
        'catalog_management',
        'sales_analytics',
        'export_data'
      ],
      user: [
        'quote_management',
        'client_management'
      ]
    };

    return permissions[role] || permissions.user;
  }

  /**
   * Check if user has permission
   */
  hasPermission(userRole, permission) {
    const userPermissions = this.getRolePermissions(userRole);
    return userPermissions.includes(permission);
  }
}

module.exports = UserManagementService;