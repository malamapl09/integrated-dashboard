class AdminPanel {
    constructor() {
        this.dashboardData = null;
        this.performanceData = null;
        this.configData = null;
        this.refreshInterval = null;
        this.autoRefresh = true;
        this.refreshRate = 30000; // 30 seconds
    }

    async loadDashboard() {
        try {
            const response = await authManager.makeAuthenticatedRequest('/api/admin/dashboard');
            const data = await response.json();

            if (response.ok && data.success) {
                this.dashboardData = data.dashboard;
                this.renderDashboard();
                this.startAutoRefresh();
            } else {
                throw new Error(data.error || 'Failed to load dashboard');
            }
        } catch (error) {
            console.error('Error loading admin dashboard:', error);
            this.showError('Failed to load dashboard: ' + error.message);
        }
    }

    renderDashboard() {
        if (!this.dashboardData) return;

        this.renderSystemStats();
        this.renderRecentActivity();
        this.renderSystemHealth();
        this.renderQuickActions();
    }

    renderSystemStats() {
        const container = document.getElementById('systemStatsContainer');
        if (!container) return;

        const { users, quotes, clients, sessions, database } = this.dashboardData;

        container.innerHTML = `
            <div class="stats-grid">
                <!-- User Statistics -->
                <div class="stat-card users-card">
                    <div class="stat-header">
                        <h3><i class="fas fa-users"></i> Users</h3>
                        <span class="stat-badge">${users.totalUsers}</span>
                    </div>
                    <div class="stat-details">
                        <div class="stat-item">
                            <span class="stat-label">Active Users</span>
                            <span class="stat-value">${users.activeUsers}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Weekly Active</span>
                            <span class="stat-value">${users.weeklyActiveUsers}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Monthly Active</span>
                            <span class="stat-value">${users.monthlyActiveUsers}</span>
                        </div>
                        <div class="stat-breakdown">
                            <div class="role-stat">
                                <i class="fas fa-crown admin-icon"></i>
                                <span>${users.adminUsers} Admins</span>
                            </div>
                            <div class="role-stat">
                                <i class="fas fa-user-tie manager-icon"></i>
                                <span>${users.managerUsers} Managers</span>
                            </div>
                            <div class="role-stat">
                                <i class="fas fa-user user-icon"></i>
                                <span>${users.regularUsers} Users</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Quote Statistics -->
                <div class="stat-card quotes-card">
                    <div class="stat-header">
                        <h3><i class="fas fa-file-invoice"></i> Quotes</h3>
                        <span class="stat-badge">${quotes.totalQuotes || 0}</span>
                    </div>
                    <div class="stat-details">
                        <div class="stat-item">
                            <span class="stat-label">This Week</span>
                            <span class="stat-value">${quotes.weeklyQuotes || 0}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Average Value</span>
                            <span class="stat-value">$${(quotes.avgQuoteValue || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Total Value</span>
                            <span class="stat-value">$${(quotes.totalQuoteValue || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                        </div>
                        <div class="status-breakdown">
                            <div class="status-item draft">
                                <span class="status-dot"></span>
                                <span>${quotes.draftQuotes || 0} Draft</span>
                            </div>
                            <div class="status-item sent">
                                <span class="status-dot"></span>
                                <span>${quotes.sentQuotes || 0} Sent</span>
                            </div>
                            <div class="status-item approved">
                                <span class="status-dot"></span>
                                <span>${quotes.approvedQuotes || 0} Approved</span>
                            </div>
                            <div class="status-item rejected">
                                <span class="status-dot"></span>
                                <span>${quotes.rejectedQuotes || 0} Rejected</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- System Performance -->
                <div class="stat-card performance-card">
                    <div class="stat-header">
                        <h3><i class="fas fa-tachometer-alt"></i> Performance</h3>
                        <span class="stat-badge ${this.getPerformanceStatus(database)}">
                            ${this.getPerformanceStatus(database)}
                        </span>
                    </div>
                    <div class="stat-details">
                        <div class="stat-item">
                            <span class="stat-label">Active Sessions</span>
                            <span class="stat-value">${sessions.activeSessions}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Database Queries</span>
                            <span class="stat-value">${database.totalQueries || 0}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Avg Query Time</span>
                            <span class="stat-value">${database.averageQueryTime || 0}ms</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Slow Queries</span>
                            <span class="stat-value ${database.slowQueries > 0 ? 'warning' : ''}">${database.slowQueries || 0}</span>
                        </div>
                    </div>
                </div>

                <!-- Client Statistics -->
                <div class="stat-card clients-card">
                    <div class="stat-header">
                        <h3><i class="fas fa-building"></i> Clients</h3>
                        <span class="stat-badge">${clients.totalClients || 0}</span>
                    </div>
                    <div class="stat-details">
                        <div class="stat-item">
                            <span class="stat-label">New This Month</span>
                            <span class="stat-value">${clients.newClientsThisMonth || 0}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Growth Rate</span>
                            <span class="stat-value">
                                ${clients.totalClients > 0 ? Math.round((clients.newClientsThisMonth / clients.totalClients) * 100) : 0}%
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderRecentActivity() {
        const container = document.getElementById('recentActivityContainer');
        if (!container || !this.dashboardData.recentActivity) return;

        const { quotes, users } = this.dashboardData.recentActivity;

        container.innerHTML = `
            <div class="activity-grid">
                <div class="activity-section">
                    <h3><i class="fas fa-file-invoice"></i> Recent Quotes</h3>
                    <div class="activity-list">
                        ${quotes.length === 0 ? 
                            '<div class="empty-activity">No recent quotes</div>' :
                            quotes.map(quote => `
                                <div class="activity-item">
                                    <div class="activity-icon">
                                        <i class="fas fa-file-invoice"></i>
                                    </div>
                                    <div class="activity-content">
                                        <div class="activity-title">Quote #${quote.id} - ${quote.clientName}</div>
                                        <div class="activity-details">
                                            <span class="activity-value">$${quote.total.toLocaleString()}</span>
                                            <span class="activity-status status-${quote.status}">${quote.status}</span>
                                        </div>
                                        <div class="activity-meta">
                                            <span>by ${quote.createdBy}</span>
                                            <span>${this.formatDate(quote.createdAt)}</span>
                                        </div>
                                    </div>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>

                <div class="activity-section">
                    <h3><i class="fas fa-user-plus"></i> Recent Users</h3>
                    <div class="activity-list">
                        ${users.length === 0 ? 
                            '<div class="empty-activity">No recent users</div>' :
                            users.map(user => `
                                <div class="activity-item">
                                    <div class="activity-icon">
                                        <div class="user-avatar ${user.role}">
                                            ${user.name.split(' ').map(n => n[0]).join('')}
                                        </div>
                                    </div>
                                    <div class="activity-content">
                                        <div class="activity-title">${user.name}</div>
                                        <div class="activity-details">
                                            <span class="activity-username">@${user.username}</span>
                                            <span class="role-badge role-${user.role}">${user.role}</span>
                                        </div>
                                        <div class="activity-meta">
                                            <span>Joined ${this.formatDate(user.createdAt)}</span>
                                            <span>Last login: ${user.lastLogin ? this.formatDate(user.lastLogin) : 'Never'}</span>
                                        </div>
                                    </div>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>
            </div>
        `;
    }

    renderSystemHealth() {
        const container = document.getElementById('systemHealthContainer');
        if (!container || !this.dashboardData.systemHealth) return;

        const health = this.dashboardData.systemHealth;
        const memoryUsage = health.memoryUsage;
        const memoryPercent = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);

        container.innerHTML = `
            <div class="health-grid">
                <div class="health-card">
                    <h4><i class="fas fa-database"></i> Database</h4>
                    <div class="health-status ${health.database}">
                        <i class="fas ${health.database === 'healthy' ? 'fa-check-circle' : 'fa-exclamation-triangle'}"></i>
                        <span>${this.capitalizeFirst(health.database)}</span>
                    </div>
                </div>

                <div class="health-card">
                    <h4><i class="fas fa-link"></i> PIM Database</h4>
                    <div class="health-status ${health.pimDatabase}">
                        <i class="fas ${health.pimDatabase === 'connected' ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                        <span>${this.capitalizeFirst(health.pimDatabase)}</span>
                    </div>
                </div>

                <div class="health-card">
                    <h4><i class="fas fa-memory"></i> Memory Usage</h4>
                    <div class="memory-info">
                        <div class="memory-bar">
                            <div class="memory-used" style="width: ${memoryPercent}%"></div>
                        </div>
                        <div class="memory-text">
                            ${this.formatBytes(memoryUsage.heapUsed)} / ${this.formatBytes(memoryUsage.heapTotal)} (${memoryPercent}%)
                        </div>
                    </div>
                </div>

                <div class="health-card">
                    <h4><i class="fas fa-clock"></i> System Uptime</h4>
                    <div class="uptime-info">
                        <span class="uptime-value">${this.formatUptime(health.uptime)}</span>
                        <div class="system-info">
                            <small>Node.js ${health.nodeVersion} on ${health.platform}</small>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderQuickActions() {
        const container = document.getElementById('quickActionsContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="quick-actions-grid">
                <button class="quick-action-btn" onclick="adminPanel.performCleanup()">
                    <i class="fas fa-broom"></i>
                    <span>System Cleanup</span>
                </button>
                <button class="quick-action-btn" onclick="adminPanel.refreshDashboard()">
                    <i class="fas fa-sync-alt"></i>
                    <span>Refresh Data</span>
                </button>
                <button class="quick-action-btn" onclick="adminPanel.viewPerformanceMetrics()">
                    <i class="fas fa-chart-line"></i>
                    <span>Performance</span>
                </button>
                <button class="quick-action-btn" onclick="adminPanel.loadSystemConfig()">
                    <i class="fas fa-cogs"></i>
                    <span>Configuration</span>
                </button>
            </div>
        `;
    }

    async performCleanup() {
        if (!confirm('This will clean up expired sessions and tokens. Continue?')) return;

        try {
            const response = await authManager.makeAuthenticatedRequest('/api/admin/maintenance/cleanup', {
                method: 'POST'
            });
            const data = await response.json();

            if (response.ok && data.success) {
                this.showSuccess(`Cleanup completed: ${data.results.expiredSessions} sessions, ${data.results.expiredTokens} tokens removed`);
                this.loadDashboard(); // Refresh dashboard
            } else {
                throw new Error(data.error || 'Cleanup failed');
            }
        } catch (error) {
            console.error('Error performing cleanup:', error);
            this.showError('Failed to perform cleanup: ' + error.message);
        }
    }

    async viewPerformanceMetrics() {
        try {
            const response = await authManager.makeAuthenticatedRequest('/api/admin/performance');
            const data = await response.json();

            if (response.ok && data.success) {
                this.performanceData = data.metrics;
                this.showPerformanceModal();
            } else {
                throw new Error(data.error || 'Failed to load performance metrics');
            }
        } catch (error) {
            console.error('Error loading performance metrics:', error);
            this.showError('Failed to load performance metrics: ' + error.message);
        }
    }

    showPerformanceModal() {
        if (!this.performanceData) return;

        const modal = document.getElementById('performanceModal');
        const container = document.getElementById('performanceContent');
        
        if (!modal || !container) return;

        const { system, memory, cpu, database } = this.performanceData;
        const memoryPercent = Math.round((memory.used / memory.total) * 100);

        container.innerHTML = `
            <div class="performance-sections">
                <div class="performance-section">
                    <h4><i class="fas fa-server"></i> System Information</h4>
                    <div class="performance-details">
                        <div class="performance-item">
                            <span class="performance-label">Uptime</span>
                            <span class="performance-value">${this.formatUptime(system.uptime)}</span>
                        </div>
                        <div class="performance-item">
                            <span class="performance-label">Node.js Version</span>
                            <span class="performance-value">${system.nodeVersion}</span>
                        </div>
                        <div class="performance-item">
                            <span class="performance-label">Platform</span>
                            <span class="performance-value">${system.platform}</span>
                        </div>
                        <div class="performance-item">
                            <span class="performance-label">Process ID</span>
                            <span class="performance-value">${system.pid}</span>
                        </div>
                    </div>
                </div>

                <div class="performance-section">
                    <h4><i class="fas fa-memory"></i> Memory Usage</h4>
                    <div class="performance-details">
                        <div class="memory-visual">
                            <div class="memory-bar large">
                                <div class="memory-used" style="width: ${memoryPercent}%"></div>
                            </div>
                            <div class="memory-label">${memoryPercent}% Used</div>
                        </div>
                        <div class="performance-item">
                            <span class="performance-label">Heap Used</span>
                            <span class="performance-value">${this.formatBytes(memory.used)}</span>
                        </div>
                        <div class="performance-item">
                            <span class="performance-label">Heap Total</span>
                            <span class="performance-value">${this.formatBytes(memory.total)}</span>
                        </div>
                        <div class="performance-item">
                            <span class="performance-label">RSS</span>
                            <span class="performance-value">${this.formatBytes(memory.rss)}</span>
                        </div>
                        <div class="performance-item">
                            <span class="performance-label">External</span>
                            <span class="performance-value">${this.formatBytes(memory.external)}</span>
                        </div>
                    </div>
                </div>

                <div class="performance-section">
                    <h4><i class="fas fa-database"></i> Database Performance</h4>
                    <div class="performance-details">
                        <div class="performance-item">
                            <span class="performance-label">Total Queries</span>
                            <span class="performance-value">${database.totalQueries || 0}</span>
                        </div>
                        <div class="performance-item">
                            <span class="performance-label">Average Query Time</span>
                            <span class="performance-value">${database.averageQueryTime || 0}ms</span>
                        </div>
                        <div class="performance-item">
                            <span class="performance-label">Slow Queries</span>
                            <span class="performance-value ${database.slowQueries > 0 ? 'warning' : ''}">${database.slowQueries || 0}</span>
                        </div>
                        <div class="performance-item">
                            <span class="performance-label">Active Connections</span>
                            <span class="performance-value">${database.activeConnections || 0}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        modal.style.display = 'flex';
    }

    async loadSystemConfig() {
        try {
            const response = await authManager.makeAuthenticatedRequest('/api/admin/config');
            const data = await response.json();

            if (response.ok && data.success) {
                this.configData = data.configuration;
                this.showConfigModal();
            } else {
                throw new Error(data.error || 'Failed to load system configuration');
            }
        } catch (error) {
            console.error('Error loading system configuration:', error);
            this.showError('Failed to load system configuration: ' + error.message);
        }
    }

    showConfigModal() {
        if (!this.configData) return;

        const modal = document.getElementById('configModal');
        const container = document.getElementById('configContent');
        
        if (!modal || !container) return;

        container.innerHTML = `
            <div class="config-sections">
                <div class="config-section">
                    <h4><i class="fas fa-database"></i> Database Configuration</h4>
                    <div class="config-details">
                        <div class="config-item">
                            <span class="config-label">Type</span>
                            <span class="config-value">${this.configData.database.type}</span>
                        </div>
                        <div class="config-item">
                            <span class="config-label">Location</span>
                            <span class="config-value">${this.configData.database.location}</span>
                        </div>
                        <div class="config-item">
                            <span class="config-label">Status</span>
                            <span class="config-value status-${this.configData.database.status}">
                                <i class="fas fa-circle"></i>
                                ${this.capitalizeFirst(this.configData.database.status)}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="config-section">
                    <h4><i class="fas fa-link"></i> PIM Database</h4>
                    <div class="config-details">
                        <div class="config-item">
                            <span class="config-label">Type</span>
                            <span class="config-value">${this.configData.pimDatabase.type}</span>
                        </div>
                        <div class="config-item">
                            <span class="config-label">Host</span>
                            <span class="config-value">${this.configData.pimDatabase.host}</span>
                        </div>
                        <div class="config-item">
                            <span class="config-label">Status</span>
                            <span class="config-value status-${this.configData.pimDatabase.status}">
                                <i class="fas fa-circle"></i>
                                ${this.capitalizeFirst(this.configData.pimDatabase.status)}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="config-section">
                    <h4><i class="fas fa-envelope"></i> Email Configuration</h4>
                    <div class="config-details">
                        <div class="config-item">
                            <span class="config-label">Service</span>
                            <span class="config-value">${this.configData.email.service}</span>
                        </div>
                        <div class="config-item">
                            <span class="config-label">Host</span>
                            <span class="config-value">${this.configData.email.host}</span>
                        </div>
                        <div class="config-item">
                            <span class="config-label">Port</span>
                            <span class="config-value">${this.configData.email.port}</span>
                        </div>
                        <div class="config-item">
                            <span class="config-label">Secure</span>
                            <span class="config-value">${this.configData.email.secure ? 'Yes' : 'No'}</span>
                        </div>
                    </div>
                </div>

                <div class="config-section">
                    <h4><i class="fas fa-cog"></i> Application Settings</h4>
                    <div class="config-details">
                        <div class="config-item">
                            <span class="config-label">Environment</span>
                            <span class="config-value">${this.configData.application.environment}</span>
                        </div>
                        <div class="config-item">
                            <span class="config-label">Port</span>
                            <span class="config-value">${this.configData.application.port}</span>
                        </div>
                        <div class="config-item">
                            <span class="config-label">Timezone</span>
                            <span class="config-value">${this.configData.application.timezone}</span>
                        </div>
                        <div class="config-item">
                            <span class="config-label">Node Version</span>
                            <span class="config-value">${this.configData.application.nodeVersion}</span>
                        </div>
                    </div>
                </div>

                <div class="config-section">
                    <h4><i class="fas fa-puzzle-piece"></i> Features</h4>
                    <div class="config-details features-grid">
                        ${Object.entries(this.configData.features).map(([feature, enabled]) => `
                            <div class="feature-item">
                                <span class="feature-name">${this.formatFeatureName(feature)}</span>
                                <span class="feature-status ${enabled ? 'enabled' : 'disabled'}">
                                    <i class="fas ${enabled ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                                    ${enabled ? 'Enabled' : 'Disabled'}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        modal.style.display = 'flex';
    }

    // Auto-refresh functionality
    startAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }

        if (this.autoRefresh) {
            this.refreshInterval = setInterval(() => {
                this.loadDashboard();
            }, this.refreshRate);
        }
    }

    toggleAutoRefresh() {
        this.autoRefresh = !this.autoRefresh;
        
        if (this.autoRefresh) {
            this.startAutoRefresh();
            this.showSuccess('Auto-refresh enabled');
        } else {
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
                this.refreshInterval = null;
            }
            this.showSuccess('Auto-refresh disabled');
        }

        this.updateAutoRefreshButton();
    }

    updateAutoRefreshButton() {
        const button = document.getElementById('autoRefreshBtn');
        if (button) {
            button.innerHTML = `
                <i class="fas ${this.autoRefresh ? 'fa-pause' : 'fa-play'}"></i>
                ${this.autoRefresh ? 'Pause' : 'Resume'} Auto-refresh
            `;
            button.className = `action-btn ${this.autoRefresh ? 'pause-btn' : 'play-btn'}`;
        }
    }

    refreshDashboard() {
        this.loadDashboard();
        this.showSuccess('Dashboard refreshed');
    }

    // Modal management
    closePerformanceModal() {
        const modal = document.getElementById('performanceModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    closeConfigModal() {
        const modal = document.getElementById('configModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // Helper methods
    getPerformanceStatus(database) {
        if (!database) return 'unknown';
        
        const avgQueryTime = database.averageQueryTime || 0;
        const slowQueries = database.slowQueries || 0;
        
        if (slowQueries > 5 || avgQueryTime > 100) return 'warning';
        if (slowQueries > 0 || avgQueryTime > 50) return 'caution';
        return 'good';
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) return `${days}d ${hours}h ${minutes}m`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleString();
    }

    formatFeatureName(featureName) {
        return featureName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    showSuccess(message) {
        authManager.showAlert(message, 'success');
    }

    showError(message) {
        authManager.showAlert(message, 'error');
    }

    cleanup() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }
}

// Global instance
const adminPanel = new AdminPanel();

// Export functions for HTML onclick handlers
window.adminPanel = adminPanel;
window.closePerformanceModal = () => adminPanel.closePerformanceModal();
window.closeConfigModal = () => adminPanel.closeConfigModal();