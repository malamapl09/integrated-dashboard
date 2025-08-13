class UserManager {
    constructor() {
        this.users = [];
        this.currentPage = 1;
        this.totalPages = 1;
        this.searchTerm = '';
        this.roleFilter = '';
        this.statusFilter = '';
        this.editingUser = null;
    }

    async loadUsers(page = 1) {
        try {
            const params = new URLSearchParams({
                page: page,
                limit: 20
            });

            if (this.searchTerm) {
                params.append('search', this.searchTerm);
            }
            if (this.roleFilter) {
                params.append('role', this.roleFilter);
            }
            if (this.statusFilter !== '') {
                params.append('active', this.statusFilter);
            }

            const response = await authManager.makeAuthenticatedRequest(`/api/users?${params}`);
            const data = await response.json();

            if (response.ok) {
                this.users = data.users;
                this.currentPage = data.pagination.page;
                this.totalPages = data.pagination.totalPages;
                this.renderUserList();
                this.renderPagination();
            } else {
                throw new Error(data.error || 'Failed to load users');
            }
        } catch (error) {
            console.error('Error loading users:', error);
            this.showError('Failed to load users: ' + error.message);
        }
    }

    renderUserList() {
        const container = document.getElementById('userTableBody');
        if (!container) return;

        if (this.users.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center">
                        <div class="empty-state">
                            <i class="fas fa-users" style="font-size: 3rem; color: var(--text-muted); margin-bottom: 1rem;"></i>
                            <p>No users found</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        container.innerHTML = this.users.map(user => `
            <tr class="user-row ${!user.active ? 'inactive-user' : ''}">
                <td>
                    <div class="user-info">
                        <div class="user-avatar ${user.role}">
                            ${user.firstName.charAt(0)}${user.lastName.charAt(0)}
                        </div>
                        <div>
                            <div class="user-name">${user.firstName} ${user.lastName}</div>
                            <div class="user-username">@${user.username}</div>
                        </div>
                    </div>
                </td>
                <td>${user.email}</td>
                <td>
                    <span class="role-badge role-${user.role}">
                        <i class="fas ${this.getRoleIcon(user.role)}"></i>
                        ${this.capitalizeFirst(user.role)}
                    </span>
                </td>
                <td>
                    <span class="status-badge ${user.active ? 'active' : 'inactive'}">
                        <i class="fas ${user.active ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                        ${user.active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td class="text-muted">
                    ${user.lastLogin ? this.formatDate(user.lastLogin) : 'Never'}
                </td>
                <td class="text-muted">
                    ${this.formatDate(user.createdAt)}
                </td>
                <td>
                    <div class="action-buttons">
                        <button 
                            class="action-btn edit-btn" 
                            onclick="userManager.editUser(${user.id})"
                            title="Edit User">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button 
                            class="action-btn sessions-btn" 
                            onclick="userManager.viewSessions(${user.id})"
                            title="View Sessions">
                            <i class="fas fa-history"></i>
                        </button>
                        <button 
                            class="action-btn ${user.active ? 'deactivate-btn' : 'activate-btn'}" 
                            onclick="userManager.toggleUserStatus(${user.id}, ${user.active})"
                            title="${user.active ? 'Deactivate' : 'Activate'} User">
                            <i class="fas ${user.active ? 'fa-user-slash' : 'fa-user-check'}"></i>
                        </button>
                        <button 
                            class="action-btn password-btn" 
                            onclick="userManager.resetPassword(${user.id})"
                            title="Reset Password">
                            <i class="fas fa-key"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    renderPagination() {
        const container = document.getElementById('userPagination');
        if (!container || this.totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        const buttons = [];

        // Previous button
        if (this.currentPage > 1) {
            buttons.push(`
                <button class="pagination-btn" onclick="userManager.loadUsers(${this.currentPage - 1})">
                    <i class="fas fa-chevron-left"></i>
                </button>
            `);
        }

        // Page numbers
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(this.totalPages, this.currentPage + 2);

        for (let i = startPage; i <= endPage; i++) {
            buttons.push(`
                <button 
                    class="pagination-btn ${i === this.currentPage ? 'active' : ''}" 
                    onclick="userManager.loadUsers(${i})">
                    ${i}
                </button>
            `);
        }

        // Next button
        if (this.currentPage < this.totalPages) {
            buttons.push(`
                <button class="pagination-btn" onclick="userManager.loadUsers(${this.currentPage + 1})">
                    <i class="fas fa-chevron-right"></i>
                </button>
            `);
        }

        container.innerHTML = `
            <div class="pagination-info">
                Showing page ${this.currentPage} of ${this.totalPages}
            </div>
            <div class="pagination-buttons">
                ${buttons.join('')}
            </div>
        `;
    }

    async createUser() {
        const form = document.getElementById('createUserForm');
        const formData = new FormData(form);
        
        const userData = {
            username: formData.get('username'),
            email: formData.get('email'),
            password: formData.get('password'),
            firstName: formData.get('firstName'),
            lastName: formData.get('lastName'),
            role: formData.get('role')
        };

        try {
            const response = await authManager.makeAuthenticatedRequest('/api/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (response.ok) {
                this.showSuccess('User created successfully');
                this.closeCreateUserModal();
                form.reset();
                this.loadUsers();
            } else {
                throw new Error(data.error || 'Failed to create user');
            }
        } catch (error) {
            console.error('Error creating user:', error);
            this.showError('Failed to create user: ' + error.message);
        }
    }

    async editUser(userId) {
        try {
            const response = await authManager.makeAuthenticatedRequest(`/api/users/${userId}`);
            const data = await response.json();

            if (response.ok) {
                this.editingUser = data.user;
                this.openEditUserModal();
            } else {
                throw new Error(data.error || 'Failed to load user');
            }
        } catch (error) {
            console.error('Error loading user:', error);
            this.showError('Failed to load user: ' + error.message);
        }
    }

    async saveUserChanges() {
        if (!this.editingUser) return;

        const form = document.getElementById('editUserForm');
        const formData = new FormData(form);
        
        const userData = {
            firstName: formData.get('firstName'),
            lastName: formData.get('lastName'),
            email: formData.get('email'),
            role: formData.get('role'),
            active: formData.get('active') === 'true'
        };

        try {
            const response = await authManager.makeAuthenticatedRequest(`/api/users/${this.editingUser.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (response.ok) {
                this.showSuccess('User updated successfully');
                this.closeEditUserModal();
                this.loadUsers();
            } else {
                throw new Error(data.error || 'Failed to update user');
            }
        } catch (error) {
            console.error('Error updating user:', error);
            this.showError('Failed to update user: ' + error.message);
        }
    }

    async toggleUserStatus(userId, currentStatus) {
        const action = currentStatus ? 'deactivate' : 'activate';
        const confirmMessage = currentStatus 
            ? 'Are you sure you want to deactivate this user?' 
            : 'Are you sure you want to activate this user?';

        if (!confirm(confirmMessage)) return;

        try {
            const response = await authManager.makeAuthenticatedRequest(
                `/api/users/${userId}/${action}`, 
                { method: 'PATCH' }
            );

            const data = await response.json();

            if (response.ok) {
                this.showSuccess(`User ${action}d successfully`);
                this.loadUsers();
            } else {
                throw new Error(data.error || `Failed to ${action} user`);
            }
        } catch (error) {
            console.error(`Error ${action}ing user:`, error);
            this.showError(`Failed to ${action} user: ` + error.message);
        }
    }

    async resetPassword(userId) {
        const newPassword = prompt('Enter new password for user:');
        if (!newPassword) return;

        // Basic password validation
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            alert('Password must be at least 8 characters with uppercase, lowercase, number, and special character');
            return;
        }

        try {
            const response = await authManager.makeAuthenticatedRequest(
                `/api/users/${userId}/reset-password`, 
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ newPassword })
                }
            );

            const data = await response.json();

            if (response.ok) {
                this.showSuccess('Password reset successfully');
            } else {
                throw new Error(data.error || 'Failed to reset password');
            }
        } catch (error) {
            console.error('Error resetting password:', error);
            this.showError('Failed to reset password: ' + error.message);
        }
    }

    async viewSessions(userId) {
        try {
            const response = await authManager.makeAuthenticatedRequest(`/api/users/${userId}/sessions`);
            const data = await response.json();

            if (response.ok) {
                this.showSessionsModal(userId, data.sessions);
            } else {
                throw new Error(data.error || 'Failed to load sessions');
            }
        } catch (error) {
            console.error('Error loading sessions:', error);
            this.showError('Failed to load sessions: ' + error.message);
        }
    }

    // Modal management
    openCreateUserModal() {
        const modal = document.getElementById('createUserModal');
        if (modal) {
            modal.style.display = 'flex';
            document.getElementById('createUsername').focus();
        }
    }

    closeCreateUserModal() {
        const modal = document.getElementById('createUserModal');
        if (modal) {
            modal.style.display = 'none';
            document.getElementById('createUserForm').reset();
        }
    }

    openEditUserModal() {
        if (!this.editingUser) return;

        const modal = document.getElementById('editUserModal');
        if (modal) {
            // Populate form with user data
            document.getElementById('editFirstName').value = this.editingUser.firstName;
            document.getElementById('editLastName').value = this.editingUser.lastName;
            document.getElementById('editEmail').value = this.editingUser.email;
            document.getElementById('editRole').value = this.editingUser.role;
            document.getElementById('editActive').value = this.editingUser.active.toString();

            modal.style.display = 'flex';
        }
    }

    closeEditUserModal() {
        const modal = document.getElementById('editUserModal');
        if (modal) {
            modal.style.display = 'none';
            this.editingUser = null;
        }
    }

    showSessionsModal(userId, sessions) {
        const modal = document.getElementById('sessionsModal');
        const tbody = document.getElementById('sessionsTableBody');
        
        if (!modal || !tbody) return;

        if (sessions.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center">No active sessions</td>
                </tr>
            `;
        } else {
            tbody.innerHTML = sessions.map(session => `
                <tr>
                    <td>${session.ipAddress}</td>
                    <td class="session-agent" title="${session.userAgent}">
                        ${this.getDeviceInfo(session.userAgent)}
                    </td>
                    <td>${this.formatDate(session.createdAt)}</td>
                    <td>
                        <button 
                            class="action-btn revoke-btn" 
                            onclick="userManager.revokeSession(${userId}, ${session.id})"
                            title="Revoke Session">
                            <i class="fas fa-times"></i>
                            Revoke
                        </button>
                    </td>
                </tr>
            `).join('');
        }

        modal.style.display = 'flex';
    }

    closeSessionsModal() {
        const modal = document.getElementById('sessionsModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    async revokeSession(userId, sessionId) {
        if (!confirm('Are you sure you want to revoke this session?')) return;

        try {
            const response = await authManager.makeAuthenticatedRequest(
                `/api/users/${userId}/sessions/${sessionId}`, 
                { method: 'DELETE' }
            );

            const data = await response.json();

            if (response.ok) {
                this.showSuccess('Session revoked successfully');
                this.viewSessions(userId); // Refresh sessions list
            } else {
                throw new Error(data.error || 'Failed to revoke session');
            }
        } catch (error) {
            console.error('Error revoking session:', error);
            this.showError('Failed to revoke session: ' + error.message);
        }
    }

    // Search and filter methods
    handleSearch() {
        const searchInput = document.getElementById('userSearch');
        this.searchTerm = searchInput ? searchInput.value.trim() : '';
        this.currentPage = 1;
        this.loadUsers();
    }

    handleRoleFilter() {
        const roleSelect = document.getElementById('roleFilter');
        this.roleFilter = roleSelect ? roleSelect.value : '';
        this.currentPage = 1;
        this.loadUsers();
    }

    handleStatusFilter() {
        const statusSelect = document.getElementById('statusFilter');
        this.statusFilter = statusSelect ? statusSelect.value : '';
        this.currentPage = 1;
        this.loadUsers();
    }

    clearFilters() {
        document.getElementById('userSearch').value = '';
        document.getElementById('roleFilter').value = '';
        document.getElementById('statusFilter').value = '';
        
        this.searchTerm = '';
        this.roleFilter = '';
        this.statusFilter = '';
        this.currentPage = 1;
        
        this.loadUsers();
    }

    // Helper methods
    getRoleIcon(role) {
        const icons = {
            admin: 'fa-crown',
            manager: 'fa-user-tie',
            user: 'fa-user'
        };
        return icons[role] || 'fa-user';
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleString();
    }

    getDeviceInfo(userAgent) {
        if (userAgent.includes('Mobile')) return 'Mobile';
        if (userAgent.includes('Tablet')) return 'Tablet';
        if (userAgent.includes('Chrome')) return 'Chrome';
        if (userAgent.includes('Firefox')) return 'Firefox';
        if (userAgent.includes('Safari')) return 'Safari';
        return 'Desktop';
    }

    showSuccess(message) {
        authManager.showAlert(message, 'success');
    }

    showError(message) {
        authManager.showAlert(message, 'error');
    }
}

// Global instance
const userManager = new UserManager();

// Export functions for HTML onclick handlers
window.userManager = userManager;
window.openCreateUserModal = () => userManager.openCreateUserModal();
window.closeCreateUserModal = () => userManager.closeCreateUserModal();
window.createUser = () => userManager.createUser();
window.closeEditUserModal = () => userManager.closeEditUserModal();
window.saveUserChanges = () => userManager.saveUserChanges();
window.closeSessionsModal = () => userManager.closeSessionsModal();