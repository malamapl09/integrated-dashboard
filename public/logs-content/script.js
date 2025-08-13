class LogAnalyzer {
    constructor() {
        this.currentPage = 0;
        this.itemsPerPage = 25;
        this.filters = {};
        this.init();
    }

    async init() {
        await this.loadStats();
        await this.loadLogs();
        await this.loadLogTypes();
    }

    async loadStats() {
        try {
            const token = localStorage.getItem('token') || sessionStorage.getItem('token');
            const response = await fetch('/api/logs/stats', {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const result = await response.json();
            const stats = result.success ? result.data : {};
            this.renderStats(stats);
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    renderStats(stats) {
        const statsContainer = document.getElementById('statsCards');
        const todayStats = stats.todayStats[0] || { total_actions: 0, products_modified: 0, active_users: 0 };
        const weekStats = stats.weekStats[0] || { count: 0 };
        const topUser = stats.topUsers[0] || { user: 'N/A', count: 0 };
        const topAction = stats.actionTypes.find(a => a.action_type !== 'Other Actions') || stats.actionTypes[0] || { action_type: 'N/A', count: 0 };
        
        statsContainer.innerHTML = `
            <div class="col-md-3">
                <div class="stats-card">
                    <div class="stats-number">${todayStats.total_actions}</div>
                    <div class="stats-label">Actions Today</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stats-card info">
                    <div class="stats-number">${todayStats.products_modified}</div>
                    <div class="stats-label">Products Modified Today</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stats-card success">
                    <div class="stats-number">${weekStats.count}</div>
                    <div class="stats-label">Actions This Week</div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stats-card warning">
                    <div class="stats-number">${topAction.count.toLocaleString()}</div>
                    <div class="stats-label">Most Common: ${topAction.action_type}</div>
                </div>
            </div>
        `;
    }

    async loadLogTypes() {
        try {
            const token = localStorage.getItem('token') || sessionStorage.getItem('token');
            const response = await fetch('/api/logs/stats', {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const result = await response.json();
            const stats = result.success ? result.data : {};
            const typeFilter = document.getElementById('typeFilter');
            
            if (stats.logsByType) {
                stats.logsByType.forEach(type => {
                    const option = document.createElement('option');
                    option.value = type.type_log;
                    option.textContent = `${type.type_log} (${type.count})`;
                    typeFilter.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading log types:', error);
        }
    }

    async loadLogs() {
        try {
            const params = new URLSearchParams({
                ...this.filters,
                limit: this.itemsPerPage,
                offset: this.currentPage * this.itemsPerPage
            });

            const token = localStorage.getItem('token') || sessionStorage.getItem('token');
            const response = await fetch(`/api/logs?${params}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const result = await response.json();
            const logs = result.success ? result.data : [];
            this.renderLogs(logs);
            this.renderPagination();
        } catch (error) {
            console.error('Error loading logs:', error);
            document.getElementById('logsTableBody').innerHTML = 
                '<tr><td colspan="7" class="text-center text-danger">Error loading logs</td></tr>';
        }
    }

    renderLogs(logs) {
        const tbody = document.getElementById('logsTableBody');
        
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No logs found</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(log => {
            const parsed = log.parsedLog || {};
            return `
            <tr>
                <td>${log.id}</td>
                <td>
                    <span class="badge bg-primary">${this.escapeHtml(log.user)}</span>
                </td>
                <td>
                    <code class="sku-code">${this.escapeHtml(log.field || '-')}</code>
                </td>
                <td>
                    <span class="badge ${this.getActionBadgeClass(parsed.action)}">${this.escapeHtml(parsed.action)}</span>
                </td>
                <td>
                    <div class="change-value before-value" title="${this.escapeHtml(parsed.before || '')}">
                        ${parsed.before ? this.escapeHtml(parsed.before) : '-'}
                    </div>
                </td>
                <td>
                    <div class="change-value after-value" title="${this.escapeHtml(parsed.after || '')}">
                        ${parsed.after ? this.escapeHtml(parsed.after) : '-'}
                    </div>
                </td>
                <td>
                    <small>${new Date(log.date_timer).toLocaleString()}</small>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-info" onclick="logAnalyzer.viewDetails(${log.id})">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `}).join('');
    }

    getActionBadgeClass(action) {
        if (typeof action !== 'string') return 'bg-secondary';
        
        if (action.includes('Title') && action.includes('Specs')) return 'bg-info';
        if (action.includes('Title')) return 'bg-info';
        if (action.includes('Activated')) return 'bg-success';
        if (action.includes('Deactivated')) return 'bg-danger';
        if (action.includes('Price')) return 'bg-warning text-dark';
        if (action.includes('Specifications')) return 'bg-primary';
        return 'bg-secondary';
    }

    renderPagination() {
        const pagination = document.getElementById('pagination');
        const totalPages = Math.max(1, Math.ceil(100 / this.itemsPerPage)); // Rough estimate
        
        let paginationHtml = '';
        
        if (this.currentPage > 0) {
            paginationHtml += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="logAnalyzer.changePage(${this.currentPage - 1})">Previous</a>
                </li>
            `;
        }

        const startPage = Math.max(0, this.currentPage - 2);
        const endPage = Math.min(totalPages - 1, this.currentPage + 2);

        for (let i = startPage; i <= endPage; i++) {
            paginationHtml += `
                <li class="page-item ${i === this.currentPage ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="logAnalyzer.changePage(${i})">${i + 1}</a>
                </li>
            `;
        }

        if (this.currentPage < totalPages - 1) {
            paginationHtml += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="logAnalyzer.changePage(${this.currentPage + 1})">Next</a>
                </li>
            `;
        }

        pagination.innerHTML = paginationHtml;
    }

    async viewDetails(logId) {
        try {
            const response = await fetch(`/api/logs/${logId}`);
            const log = await response.json();
            
            const modalBody = document.getElementById('logDetailsBody');
            modalBody.innerHTML = `
                <div class="row">
                    <div class="col-sm-3"><strong>ID:</strong></div>
                    <div class="col-sm-9">${log.id}</div>
                </div>
                <div class="row">
                    <div class="col-sm-3"><strong>User:</strong></div>
                    <div class="col-sm-9"><span class="badge bg-primary">${this.escapeHtml(log.user)}</span></div>
                </div>
                <div class="row">
                    <div class="col-sm-3"><strong>Type:</strong></div>
                    <div class="col-sm-9"><span class="badge bg-secondary">${this.escapeHtml(log.type_log)}</span></div>
                </div>
                <div class="row">
                    <div class="col-sm-3"><strong>Field:</strong></div>
                    <div class="col-sm-9">${this.escapeHtml(log.field || '-')}</div>
                </div>
                <div class="row">
                    <div class="col-sm-3"><strong>Date:</strong></div>
                    <div class="col-sm-9">${new Date(log.date_timer).toLocaleString()}</div>
                </div>
                <div class="row">
                    <div class="col-sm-3"><strong>Log:</strong></div>
                    <div class="col-sm-9">
                        <div class="details-content">${this.escapeHtml(log.log || 'No log content')}</div>
                    </div>
                </div>
                <div class="row">
                    <div class="col-sm-3"><strong>Details:</strong></div>
                    <div class="col-sm-9">
                        <div class="details-content">${this.escapeHtml(log.details || 'No additional details')}</div>
                    </div>
                </div>
            `;
            
            const modal = new bootstrap.Modal(document.getElementById('logDetailsModal'));
            modal.show();
        } catch (error) {
            console.error('Error loading log details:', error);
            alert('Error loading log details');
        }
    }

    changePage(page) {
        this.currentPage = page;
        this.loadLogs();
    }

    escapeHtml(text) {
        if (typeof text !== 'string') return text;
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

let logAnalyzer;

function applyFilters() {
    const filters = {
        user: document.getElementById('userFilter').value.trim(),
        field: document.getElementById('skuFilter').value.trim(),
        action: document.getElementById('actionFilter').value,
        type_log: document.getElementById('typeFilter').value,
        startDate: document.getElementById('startDate').value,
        endDate: document.getElementById('endDate').value
    };

    // Remove empty filters
    Object.keys(filters).forEach(key => {
        if (!filters[key]) delete filters[key];
    });

    logAnalyzer.filters = filters;
    logAnalyzer.currentPage = 0;
    logAnalyzer.loadLogs();
}

function clearFilters() {
    document.getElementById('userFilter').value = '';
    document.getElementById('skuFilter').value = '';
    document.getElementById('actionFilter').value = '';
    document.getElementById('typeFilter').value = '';
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    
    logAnalyzer.filters = {};
    logAnalyzer.currentPage = 0;
    logAnalyzer.loadLogs();
}

function refreshLogs() {
    logAnalyzer.loadStats();
    logAnalyzer.loadLogs();
}

async function exportUserLogs(format) {
    try {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        
        // Build query parameters based on current filters
        const params = new URLSearchParams({
            ...logAnalyzer.filters,
            limit: 10000 // Export all filtered records
        });

        const response = await fetch(`/api/logs/export/${format}?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `user_logs_${new Date().toISOString().split('T')[0]}.${format === 'excel' ? 'xlsx' : format}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } else {
            alert('Export failed. Please try again.');
        }
    } catch (error) {
        console.error('Export error:', error);
        alert('Export failed. Please try again.');
    }
}

async function exportActivitySummary(format) {
    try {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        const response = await fetch(`/api/logs/export/summary/${format}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `activity_summary_${new Date().toISOString().split('T')[0]}.${format}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } else {
            alert('Export failed. Please try again.');
        }
    } catch (error) {
        console.error('Export error:', error);
        alert('Export failed. Please try again.');
    }
}

async function exportUserPerformance(format) {
    try {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        const response = await fetch(`/api/logs/export/performance/${format}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `user_performance_${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } else {
            alert('Export failed. Please try again.');
        }
    } catch (error) {
        console.error('Export error:', error);
        alert('Export failed. Please try again.');
    }
}

async function exportProductHistory(format) {
    try {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        const response = await fetch(`/api/logs/export/product-history/${format}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `product_history_${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } else {
            alert('Export failed. Please try again.');
        }
    } catch (error) {
        console.error('Export error:', error);
        alert('Export failed. Please try again.');
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    logAnalyzer = new LogAnalyzer();

    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 'r':
                    e.preventDefault();
                    refreshLogs();
                    break;
                case 'f':
                    e.preventDefault();
                    document.getElementById('userFilter').focus();
                    break;
            }
        }
    });
});