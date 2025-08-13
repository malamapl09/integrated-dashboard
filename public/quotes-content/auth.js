class AuthManager {
    constructor() {
        this.currentUser = null;
        this.token = null;
        this.refreshToken = null;
        this.refreshTimer = null;
        
        this.init();
    }

    async init() {
        // Check if user is already logged in (try both token names for compatibility)
        this.token = localStorage.getItem('token') || sessionStorage.getItem('token') || localStorage.getItem('accessToken');
        this.refreshToken = localStorage.getItem('refreshToken') || sessionStorage.getItem('refreshToken');
        
        if (this.token) {
            try {
                await this.verifyToken();
            } catch (error) {
                console.log('Token verification failed, attempting refresh...');
                await this.attemptTokenRefresh();
            }
        }
        
        this.updateUI();
        this.setupAutoRefresh();
    }

    async verifyToken() {
        if (!this.token) {
            throw new Error('No token available');
        }

        const response = await fetch('/api/auth/profile', {
            headers: {
                'Authorization': `Bearer ${this.token}`
            }
        });

        if (!response.ok) {
            throw new Error('Token verification failed');
        }

        const data = await response.json();
        if (data.success) {
            this.currentUser = {
                id: data.data.id,
                username: data.data.username,
                email: data.data.email,
                firstName: data.data.first_name,
                lastName: data.data.last_name,
                role: data.data.role
            };
        } else {
            throw new Error('Profile data not available');
        }
        return data;
    }

    async attemptTokenRefresh() {
        if (!this.refreshToken) {
            this.logout();
            return;
        }

        try {
            const response = await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    refreshToken: this.refreshToken
                })
            });

            if (!response.ok) {
                throw new Error('Token refresh failed');
            }

            const data = await response.json();
            this.setTokens(data.accessToken, data.refreshToken);
            
            // Verify the new token
            await this.verifyToken();
            
        } catch (error) {
            console.error('Token refresh failed:', error);
            this.logout();
        }
    }

    setTokens(accessToken, refreshToken) {
        this.token = accessToken;
        this.refreshToken = refreshToken;
        
        localStorage.setItem('token', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
    }

    clearTokens() {
        this.token = null;
        this.refreshToken = null;
        this.currentUser = null;
        
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('refreshToken');
    }

    setupAutoRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }

        // Refresh token every 45 minutes (tokens expire in 1 hour)
        this.refreshTimer = setInterval(async () => {
            if (this.token && this.refreshToken) {
                try {
                    await this.attemptTokenRefresh();
                } catch (error) {
                    console.error('Auto refresh failed:', error);
                }
            }
        }, 45 * 60 * 1000);
    }

    async login(username, password) {
        showLoading(true);
        
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }

            this.currentUser = data.user;
            this.setTokens(data.accessToken, data.refreshToken);
            this.setupAutoRefresh();
            this.updateUI();
            
            closeLoginModal();
            this.showAlert('Inicio de sesión exitoso', 'success');
            
            // Reload data for authenticated user
            if (window.quoteGen) {
                await window.quoteGen.loadClients();
                await window.quoteGen.loadQuotes();
            }

            return data;
        } catch (error) {
            this.showAlert(error.message, 'error');
            throw error;
        } finally {
            showLoading(false);
        }
    }

    async logout() {
        showLoading(true);
        
        try {
            if (this.token) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`
                    }
                });
            }
        } catch (error) {
            console.error('Logout API call failed:', error);
        } finally {
            this.clearTokens();
            
            if (this.refreshTimer) {
                clearInterval(this.refreshTimer);
            }
            
            this.updateUI();
            this.showAlert('Sesión cerrada correctamente', 'success');
            showLoading(false);
        }
    }

    async getProfile() {
        if (!this.token) {
            throw new Error('Not authenticated');
        }

        const response = await fetch('/api/auth/profile', {
            headers: {
                'Authorization': `Bearer ${this.token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch profile');
        }

        const data = await response.json();
        this.currentUser = data.user;
        return data.user;
    }

    async updateProfile(profileData) {
        if (!this.token) {
            throw new Error('Not authenticated');
        }

        const response = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`
            },
            body: JSON.stringify(profileData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to update profile');
        }

        this.currentUser = data.user;
        this.updateUI();
        return data.user;
    }

    async changePassword(currentPassword, newPassword) {
        if (!this.token) {
            throw new Error('Not authenticated');
        }

        const response = await fetch('/api/auth/change-password', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`
            },
            body: JSON.stringify({
                currentPassword,
                newPassword
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to change password');
        }

        // Password change invalidates all sessions, so logout
        this.showAlert('Contraseña cambiada exitosamente. Por favor, inicia sesión nuevamente.', 'success');
        setTimeout(() => this.logout(), 2000);
        
        return data;
    }

    async makeAuthenticatedRequest(url, options = {}) {
        if (!this.token) {
            throw new Error('Not authenticated');
        }

        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${this.token}`
        };

        const response = await fetch(url, {
            ...options,
            headers
        });

        // If token is expired, try to refresh
        if (response.status === 401) {
            await this.attemptTokenRefresh();
            
            if (this.token) {
                // Retry with new token
                headers['Authorization'] = `Bearer ${this.token}`;
                return fetch(url, { ...options, headers });
            }
        }

        return response;
    }

    updateUI() {
        const navUser = document.getElementById('navUser');
        const navAuth = document.getElementById('navAuth');
        const authRequired = document.getElementById('authRequired');
        const mainContainer = document.querySelector('.main-container');

        if (this.currentUser) {
            // User is logged in
            navUser.style.display = 'flex';
            navAuth.style.display = 'none';
            authRequired.style.display = 'none';
            mainContainer.style.display = 'block';

            // Update user info
            document.getElementById('userName').textContent = 
                `${this.currentUser.firstName} ${this.currentUser.lastName}`;
            document.getElementById('userRole').textContent = this.currentUser.role;

            // Show/hide role-specific elements
            this.updateRoleBasedVisibility();
        } else {
            // User is not logged in
            navUser.style.display = 'none';
            navAuth.style.display = 'flex';
            authRequired.style.display = 'block';
            mainContainer.style.display = 'none';
        }
    }

    updateRoleBasedVisibility() {
        const adminElements = document.querySelectorAll('.admin-only');
        const managerElements = document.querySelectorAll('.manager-only');
        const userElements = document.querySelectorAll('.user-only');

        // Hide all role-specific elements first
        adminElements.forEach(el => el.style.display = 'none');
        managerElements.forEach(el => el.style.display = 'none');
        userElements.forEach(el => el.style.display = 'none');

        // Show elements based on user role
        if (this.currentUser) {
            if (this.currentUser.role === 'admin') {
                adminElements.forEach(el => el.style.display = 'block');
                managerElements.forEach(el => el.style.display = 'block');
                userElements.forEach(el => el.style.display = 'block');
            } else if (this.currentUser.role === 'manager') {
                managerElements.forEach(el => el.style.display = 'block');
                userElements.forEach(el => el.style.display = 'block');
            } else {
                userElements.forEach(el => el.style.display = 'block');
            }
        }
    }

    isAuthenticated() {
        return !!this.token && !!this.currentUser;
    }

    hasRole(role) {
        return this.currentUser && this.currentUser.role === role;
    }

    hasAnyRole(roles) {
        return this.currentUser && roles.includes(this.currentUser.role);
    }

    showAlert(message, type = 'info') {
        // Create a modern notification
        const alert = document.createElement('div');
        alert.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--card-background);
            color: var(--text-primary);
            padding: 1rem 1.5rem;
            border-radius: var(--radius-lg);
            border: 1px solid var(--border-color);
            box-shadow: var(--shadow-lg);
            z-index: 9999;
            min-width: 300px;
            animation: slideIn 0.3s ease-out;
        `;
        
        const iconMap = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-triangle',
            warning: 'fas fa-exclamation-circle',
            info: 'fas fa-info-circle'
        };
        
        const colorMap = {
            success: 'var(--success)',
            error: 'var(--error)',
            warning: 'var(--warning)',
            info: 'var(--plaza-blue)'
        };
        
        alert.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <i class="${iconMap[type] || iconMap.info}" style="color: ${colorMap[type] || colorMap.info}; font-size: 1.25rem;"></i>
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: var(--text-muted); font-size: 1.25rem; cursor: pointer; margin-left: auto;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        document.body.appendChild(alert);
        
        setTimeout(() => {
            if (alert.parentNode) {
                alert.style.animation = 'slideOut 0.3s ease-in';
                setTimeout(() => alert.remove(), 300);
            }
        }, 5000);
    }
}

// Global auth manager instance
const authManager = new AuthManager();

// Authentication-related UI functions
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    overlay.style.display = show ? 'flex' : 'none';
}

function openLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        // Ensure modal is fully visible with explicit styles
        modal.style.display = 'flex';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.zIndex = '9999';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        
        const usernameField = document.getElementById('loginUsername');
        if (usernameField) {
            setTimeout(() => usernameField.focus(), 100);
        }
    } else {
        console.error('Login modal not found!');
    }
}

function closeLoginModal() {
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('loginForm').reset();
    document.getElementById('loginError').style.display = 'none';
}

function toggleUserMenu() {
    const dropdown = document.getElementById('userDropdown');
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
}

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const button = input.nextElementSibling;
    const icon = button.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

async function login() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    const loginBtn = document.getElementById('loginBtn');

    // Clear previous errors
    errorDiv.style.display = 'none';

    if (!username || !password) {
        errorDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Por favor, completa todos los campos';
        errorDiv.style.display = 'block';
        return;
    }

    loginBtn.classList.add('button-loading');
    loginBtn.disabled = true;

    try {
        await authManager.login(username, password);
    } catch (error) {
        errorDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${error.message}`;
        errorDiv.style.display = 'block';
    } finally {
        loginBtn.classList.remove('button-loading');
        loginBtn.disabled = false;
    }
}

async function logout() {
    await authManager.logout();
    document.getElementById('userDropdown').style.display = 'none';
}

function openProfileModal() {
    document.getElementById('userDropdown').style.display = 'none';
    document.getElementById('profileModal').style.display = 'flex';
    loadProfileData();
}

function closeProfileModal() {
    document.getElementById('profileModal').style.display = 'none';
    document.getElementById('profileError').style.display = 'none';
}

async function loadProfileData() {
    try {
        const user = await authManager.getProfile();
        
        document.getElementById('profileFirstName').value = user.firstName || '';
        document.getElementById('profileLastName').value = user.lastName || '';
        document.getElementById('profileEmail').value = user.email || '';
        document.getElementById('profileUsername').value = user.username || '';
        document.getElementById('profileRole').value = user.role || '';
        document.getElementById('profileLastLogin').value = user.lastLogin ? 
            new Date(user.lastLogin).toLocaleString() : 'Nunca';
    } catch (error) {
        authManager.showAlert('Error al cargar el perfil', 'error');
        closeProfileModal();
    }
}

async function saveProfile() {
    const firstName = document.getElementById('profileFirstName').value.trim();
    const lastName = document.getElementById('profileLastName').value.trim();
    const email = document.getElementById('profileEmail').value.trim();
    const errorDiv = document.getElementById('profileError');
    const saveBtn = document.getElementById('saveProfileBtn');

    errorDiv.style.display = 'none';

    if (!firstName || !lastName || !email) {
        errorDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Por favor, completa todos los campos requeridos';
        errorDiv.style.display = 'block';
        return;
    }

    saveBtn.classList.add('button-loading');
    saveBtn.disabled = true;

    try {
        await authManager.updateProfile({
            firstName,
            lastName,
            email
        });
        
        closeProfileModal();
        authManager.showAlert('Perfil actualizado exitosamente', 'success');
    } catch (error) {
        errorDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${error.message}`;
        errorDiv.style.display = 'block';
    } finally {
        saveBtn.classList.remove('button-loading');
        saveBtn.disabled = false;
    }
}

function openChangePasswordModal() {
    document.getElementById('userDropdown').style.display = 'none';
    document.getElementById('changePasswordModal').style.display = 'flex';
    document.getElementById('currentPassword').focus();
}

function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'none';
    document.getElementById('changePasswordForm').reset();
    document.getElementById('passwordError').style.display = 'none';
}

async function changePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const errorDiv = document.getElementById('passwordError');
    const changeBtn = document.getElementById('changePasswordBtn');

    errorDiv.style.display = 'none';

    if (!currentPassword || !newPassword || !confirmPassword) {
        errorDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Por favor, completa todos los campos';
        errorDiv.style.display = 'block';
        return;
    }

    if (newPassword !== confirmPassword) {
        errorDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Las contraseñas no coinciden';
        errorDiv.style.display = 'block';
        return;
    }

    // Password validation
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
        errorDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> La contraseña debe tener al menos 8 caracteres con mayúscula, minúscula, número y símbolo';
        errorDiv.style.display = 'block';
        return;
    }

    changeBtn.classList.add('button-loading');
    changeBtn.disabled = true;

    try {
        await authManager.changePassword(currentPassword, newPassword);
        closeChangePasswordModal();
    } catch (error) {
        errorDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${error.message}`;
        errorDiv.style.display = 'block';
    } finally {
        changeBtn.classList.remove('button-loading');
        changeBtn.disabled = false;
    }
}

// Admin features
function openUserManagementModal() {
    const modal = document.getElementById('userManagementModal');
    if (modal) {
        modal.style.display = 'flex';
        if (window.userManager) {
            window.userManager.loadUsers();
        }
    }
    document.getElementById('userDropdown').style.display = 'none';
}

function closeUserManagementModal() {
    const modal = document.getElementById('userManagementModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function openAdminPanel() {
    const modal = document.getElementById('adminPanelModal');
    if (modal) {
        modal.style.display = 'flex';
        if (window.adminPanel) {
            window.adminPanel.loadDashboard();
        }
    }
    document.getElementById('userDropdown').style.display = 'none';
}

function closeAdminPanelModal() {
    const modal = document.getElementById('adminPanelModal');
    if (modal) {
        modal.style.display = 'none';
        // Clean up any intervals
        if (window.adminPanel) {
            window.adminPanel.cleanup();
        }
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Close dropdowns when clicking outside
    document.addEventListener('click', function(event) {
        const userDropdown = document.getElementById('userDropdown');
        const userAvatar = document.querySelector('.user-avatar');
        
        if (userDropdown && !userAvatar.contains(event.target)) {
            userDropdown.style.display = 'none';
        }
    });

    // Handle Enter key in login form
    document.getElementById('loginForm').addEventListener('submit', function(e) {
        e.preventDefault();
        login();
    });

    // Handle Enter key in forms
    document.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const activeModal = document.querySelector('.modern-modal[style*="flex"]');
            if (activeModal) {
                const modalId = activeModal.id;
                switch (modalId) {
                    case 'loginModal':
                        login();
                        break;
                    case 'profileModal':
                        saveProfile();
                        break;
                    case 'changePasswordModal':
                        changePassword();
                        break;
                }
            }
        }
    });
});

// Inventory Management Modal Functions
function openInventoryManagementModal() {
    const modal = document.getElementById('inventoryManagementModal');
    if (modal) {
        modal.style.display = 'flex';
        
        // Load inventory dashboard when modal opens
        if (window.inventoryManager) {
            window.inventoryManager.loadInventoryDashboard();
        }
    }
}

function closeInventoryManagementModal() {
    const modal = document.getElementById('inventoryManagementModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Export for use in other files
window.authManager = authManager;

// Export global functions for HTML onclick handlers
window.openLoginModal = openLoginModal;
window.closeLoginModal = closeLoginModal;
window.login = login;
window.logout = logout;
window.toggleUserMenu = toggleUserMenu;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.openInventoryManagementModal = openInventoryManagementModal;
window.closeInventoryManagementModal = closeInventoryManagementModal;
window.saveProfile = saveProfile;
window.openChangePasswordModal = openChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;
window.changePassword = changePassword;
window.togglePasswordVisibility = togglePasswordVisibility;
window.openUserManagementModal = openUserManagementModal;
window.closeUserManagementModal = closeUserManagementModal;
window.openAdminPanel = openAdminPanel;
window.closeAdminPanelModal = closeAdminPanelModal;