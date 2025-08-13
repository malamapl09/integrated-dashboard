class EmailManagement {
    constructor() {
        this.currentTab = 'stats';
        this.refreshInterval = null;
    }

    async openEmailManagementModal() {
        if (!authManager.isAuthenticated() || !['admin', 'manager'].includes(authManager.currentUser?.role)) {
            quoteGen.showAlert('Access denied. Admin privileges required.', 'danger');
            return;
        }

        document.getElementById('emailManagementModal').style.display = 'flex';
        await this.loadEmailStats();
        
        // Start auto-refresh for stats
        this.startAutoRefresh();
    }

    closeEmailManagementModal() {
        document.getElementById('emailManagementModal').style.display = 'none';
        this.stopAutoRefresh();
    }

    switchEmailTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[onclick="switchEmailTab('${tabName}')"]`).classList.add('active');

        // Hide all tab contents
        document.querySelectorAll('.email-tab-content').forEach(content => {
            content.style.display = 'none';
        });

        // Show selected tab
        document.getElementById(`email${tabName.charAt(0).toUpperCase() + tabName.slice(1)}Tab`).style.display = 'block';
        this.currentTab = tabName;

        // Load tab-specific data
        switch (tabName) {
            case 'stats':
                this.loadEmailStats();
                break;
            case 'queue':
                this.refreshEmailQueue();
                break;
            case 'logs':
                this.refreshEmailLogs();
                break;
            case 'config':
                this.loadEmailConfig();
                break;
        }
    }

    async loadEmailStats() {
        try {
            const response = await authManager.makeAuthenticatedRequest('/api/email/queue/stats');
            if (!response.ok) {
                throw new Error('Failed to load email statistics');
            }

            const stats = await response.json();
            
            // Update stat cards
            document.getElementById('totalEmailsSent').textContent = stats.queue.completed || 0;
            document.getElementById('pendingEmails').textContent = stats.queue.pending || 0;
            document.getElementById('failedEmails').textContent = stats.queue.failed || 0;
            
            // Load analytics
            await this.loadEmailAnalytics();

        } catch (error) {
            console.error('Error loading email stats:', error);
            quoteGen.showAlert('Failed to load email statistics', 'danger');
        }
    }

    async loadEmailAnalytics() {
        try {
            const response = await authManager.makeAuthenticatedRequest('/api/email/analytics?days=7');
            if (!response.ok) {
                throw new Error('Failed to load email analytics');
            }

            const analytics = await response.json();
            
            // Update opened emails stat
            document.getElementById('openedEmails').textContent = analytics.overall.opened || 0;
            
            // Render simple analytics chart
            this.renderAnalyticsChart(analytics.daily);

        } catch (error) {
            console.error('Error loading email analytics:', error);
            document.getElementById('emailAnalyticsChart').innerHTML = 
                '<div class="error-message">Failed to load analytics</div>';
        }
    }

    renderAnalyticsChart(dailyData) {
        const chartContainer = document.getElementById('emailAnalyticsChart');
        
        if (!dailyData || dailyData.length === 0) {
            chartContainer.innerHTML = '<div class="no-data">No data available for the selected period</div>';
            return;
        }

        // Create simple bar chart
        let chartHTML = '<div class="simple-chart">';
        
        dailyData.reverse().forEach(day => {
            const maxHeight = 100;
            const maxEmails = Math.max(...dailyData.map(d => d.total_emails));
            const height = maxEmails > 0 ? (day.total_emails / maxEmails) * maxHeight : 0;
            
            chartHTML += `
                <div class="chart-bar" style="height: ${maxHeight}px;">
                    <div class="bar-fill" style="height: ${height}px;" title="${day.date}: ${day.total_emails} emails">
                    </div>
                    <div class="bar-label">${new Date(day.date).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}</div>
                </div>
            `;
        });
        
        chartHTML += '</div>';
        chartContainer.innerHTML = chartHTML;
    }

    async refreshEmailQueue() {
        try {
            const statusFilter = document.getElementById('queueStatusFilter')?.value || 'all';
            const endpoint = `/api/email/queue?limit=50${statusFilter !== 'all' ? `&status=${statusFilter}` : ''}`;
            
            const response = await authManager.makeAuthenticatedRequest(endpoint);
            if (!response.ok) {
                throw new Error('Failed to load email queue');
            }

            const queueItems = await response.json();
            this.renderEmailQueue(queueItems);

        } catch (error) {
            console.error('Error loading email queue:', error);
            document.getElementById('emailQueueList').innerHTML = 
                '<div class="error-message">Failed to load email queue</div>';
        }
    }

    renderEmailQueue(queueItems) {
        const container = document.getElementById('emailQueueList');
        
        if (queueItems.length === 0) {
            container.innerHTML = '<div class="empty-state">No items in email queue</div>';
            return;
        }

        let html = '';
        queueItems.forEach(item => {
            const scheduledAt = new Date(item.scheduled_at).toLocaleString();
            const statusClass = this.getStatusClass(item.status);
            
            html += `
                <div class="table-row">
                    <div class="table-cell">${item.id}</div>
                    <div class="table-cell">${item.recipient_email}</div>
                    <div class="table-cell">
                        <span class="status-badge ${statusClass}">${item.status}</span>
                    </div>
                    <div class="table-cell">${item.attempts}/${item.max_attempts}</div>
                    <div class="table-cell">${scheduledAt}</div>
                    <div class="table-cell">
                        ${item.status === 'failed' ? 
                            `<button class="action-button retry" onclick="emailManager.retryEmail(${item.id})" title="Retry">
                                <i class="fas fa-redo"></i>
                            </button>` : ''
                        }
                        <button class="action-button delete" onclick="emailManager.deleteQueueItem(${item.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }

    async refreshEmailLogs() {
        try {
            const statusFilter = document.getElementById('logStatusFilter')?.value || '';
            const recipientFilter = document.getElementById('logRecipientFilter')?.value || '';
            
            let endpoint = '/api/email/logs?limit=50';
            if (statusFilter) endpoint += `&status=${statusFilter}`;
            if (recipientFilter) endpoint += `&recipient=${recipientFilter}`;
            
            const response = await authManager.makeAuthenticatedRequest(endpoint);
            if (!response.ok) {
                throw new Error('Failed to load email logs');
            }

            const logs = await response.json();
            this.renderEmailLogs(logs);

        } catch (error) {
            console.error('Error loading email logs:', error);
            document.getElementById('emailLogsList').innerHTML = 
                '<div class="error-message">Failed to load email logs</div>';
        }
    }

    renderEmailLogs(logs) {
        const container = document.getElementById('emailLogsList');
        
        if (logs.length === 0) {
            container.innerHTML = '<div class="empty-state">No email logs found</div>';
            return;
        }

        let html = '';
        logs.forEach(log => {
            const sentAt = log.sent_at ? new Date(log.sent_at).toLocaleString() : '-';
            const openedAt = log.opened_at ? new Date(log.opened_at).toLocaleString() : '-';
            const statusClass = this.getStatusClass(log.status);
            
            html += `
                <div class="table-row">
                    <div class="table-cell">${log.quote_number || '-'}</div>
                    <div class="table-cell">${log.recipient_email}</div>
                    <div class="table-cell">
                        <span class="status-badge ${statusClass}">${log.status}</span>
                        ${log.delivery_status ? `<br><small>${log.delivery_status}</small>` : ''}
                    </div>
                    <div class="table-cell">${sentAt}</div>
                    <div class="table-cell">${openedAt}</div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }

    async loadEmailConfig() {
        try {
            const response = await authManager.makeAuthenticatedRequest('/api/email/config');
            if (!response.ok) {
                throw new Error('Failed to load email configuration');
            }

            const config = await response.json();
            this.renderEmailConfig(config);

        } catch (error) {
            console.error('Error loading email config:', error);
            document.getElementById('emailConfigStatus').innerHTML = 
                '<div class="error-message">Failed to load email configuration</div>';
        }
    }

    renderEmailConfig(config) {
        const container = document.getElementById('emailConfigStatus');
        
        const statusIcon = config.isConfigured ? 
            '<i class="fas fa-check-circle" style="color: var(--success);"></i>' :
            '<i class="fas fa-exclamation-circle" style="color: var(--error);"></i>';
        
        const statusText = config.isConfigured ? 'Configured' : 'Not Configured';
        
        let html = `
            <div class="config-item">
                <span class="config-label">SMTP Status:</span>
                <span class="config-value">${statusIcon} ${statusText}</span>
            </div>
        `;
        
        if (config.isConfigured) {
            html += `
                <div class="config-item">
                    <span class="config-label">SMTP Host:</span>
                    <span class="config-value">${config.smtpHost || 'Not set'}</span>
                </div>
                <div class="config-item">
                    <span class="config-label">SMTP Port:</span>
                    <span class="config-value">${config.smtpPort || 'Not set'}</span>
                </div>
                <div class="config-item">
                    <span class="config-label">SMTP User:</span>
                    <span class="config-value">${config.smtpUser || 'Not set'}</span>
                </div>
                <div class="config-item">
                    <span class="config-label">From Address:</span>
                    <span class="config-value">${config.smtpFrom || 'Not set'}</span>
                </div>
                <div class="config-item">
                    <span class="config-label">Company Name:</span>
                    <span class="config-value">${config.companyName || 'Not set'}</span>
                </div>
                <div class="config-item">
                    <span class="config-label">Company Phone:</span>
                    <span class="config-value">${config.companyPhone || 'Not set'}</span>
                </div>
            `;
        }
        
        container.innerHTML = html;
    }

    async retryEmail(queueId) {
        try {
            const response = await authManager.makeAuthenticatedRequest(`/api/email/queue/${queueId}/retry`, {
                method: 'POST'
            });

            if (!response.ok) {
                throw new Error('Failed to retry email');
            }

            quoteGen.showAlert('Email scheduled for retry', 'success');
            await this.refreshEmailQueue();

        } catch (error) {
            console.error('Error retrying email:', error);
            quoteGen.showAlert('Failed to retry email', 'danger');
        }
    }

    async deleteQueueItem(queueId) {
        if (!confirm('Are you sure you want to delete this queue item?')) {
            return;
        }

        try {
            const response = await authManager.makeAuthenticatedRequest(`/api/email/queue/${queueId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete queue item');
            }

            quoteGen.showAlert('Queue item deleted', 'success');
            await this.refreshEmailQueue();

        } catch (error) {
            console.error('Error deleting queue item:', error);
            quoteGen.showAlert('Failed to delete queue item', 'danger');
        }
    }

    async sendTestEmail() {
        const testEmailAddress = document.getElementById('testEmailAddress').value.trim();
        const useQueue = document.getElementById('useQueueForTest').checked;

        if (!testEmailAddress) {
            quoteGen.showAlert('Please enter a test email address', 'warning');
            return;
        }

        try {
            const response = await authManager.makeAuthenticatedRequest('/api/email/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    testEmail: testEmailAddress,
                    useQueue: useQueue
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to send test email');
            }

            const result = await response.json();
            quoteGen.showAlert(result.message, 'success');

            // Refresh relevant tabs
            if (useQueue) {
                await this.refreshEmailQueue();
            }

        } catch (error) {
            console.error('Error sending test email:', error);
            quoteGen.showAlert(error.message || 'Failed to send test email', 'danger');
        }
    }

    getStatusClass(status) {
        switch (status) {
            case 'sent':
            case 'completed':
            case 'delivered':
                return 'status-success';
            case 'failed':
            case 'bounced':
                return 'status-error';
            case 'pending':
            case 'processing':
                return 'status-warning';
            default:
                return 'status-default';
        }
    }

    startAutoRefresh() {
        this.stopAutoRefresh();
        // Refresh stats every 30 seconds
        this.refreshInterval = setInterval(() => {
            if (this.currentTab === 'stats') {
                this.loadEmailStats();
            }
        }, 30000);
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }
}

// Global functions for HTML onclick handlers
function openEmailManagementModal() {
    emailManager.openEmailManagementModal();
}

function closeEmailManagementModal() {
    emailManager.closeEmailManagementModal();
}

function switchEmailTab(tabName) {
    emailManager.switchEmailTab(tabName);
}

function refreshEmailQueue() {
    emailManager.refreshEmailQueue();
}

function refreshEmailLogs() {
    emailManager.refreshEmailLogs();
}

function sendTestEmail() {
    emailManager.sendTestEmail();
}

// Initialize email manager
const emailManager = new EmailManagement();