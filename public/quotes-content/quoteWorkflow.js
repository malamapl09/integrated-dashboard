class QuoteWorkflowManager {
    constructor() {
        this.currentQuoteId = null;
        this.workflowSettings = {};
        this.statusColors = {
            'draft': '#6b7280',
            'pending_approval': '#f59e0b',
            'approved': '#10b981',
            'sent': '#3b82f6',
            'viewed': '#06b6d4',
            'accepted': '#059669',
            'rejected': '#ef4444',
            'expired': '#9ca3af',
            'converted': '#7c3aed',
            'cancelled': '#6b7280'
        };

        this.statusLabels = {
            'draft': 'Borrador',
            'pending_approval': 'Pendiente Aprobación',
            'approved': 'Aprobado',
            'sent': 'Enviado',
            'viewed': 'Visto',
            'accepted': 'Aceptado',
            'rejected': 'Rechazado',
            'expired': 'Expirado',
            'converted': 'Convertido',
            'cancelled': 'Cancelado'
        };

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadWorkflowSettings();
    }

    setupEventListeners() {
        // Status update buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('status-update-btn')) {
                const newStatus = e.target.dataset.status;
                const quoteId = e.target.dataset.quoteId;
                this.showStatusUpdateModal(quoteId, newStatus);
            }

            if (e.target.classList.contains('view-history-btn')) {
                const quoteId = e.target.dataset.quoteId;
                this.showStatusHistoryModal(quoteId);
            }

            if (e.target.classList.contains('approve-btn')) {
                const approvalId = e.target.dataset.approvalId;
                this.processApproval(approvalId, 'approved');
            }

            if (e.target.classList.contains('reject-btn')) {
                const approvalId = e.target.dataset.approvalId;
                this.processApproval(approvalId, 'rejected');
            }
        });

        // Form submissions
        document.addEventListener('submit', (e) => {
            if (e.target.id === 'statusUpdateForm') {
                e.preventDefault();
                this.handleStatusUpdate();
            }

            if (e.target.id === 'workflowSettingsForm') {
                e.preventDefault();
                this.handleWorkflowSettingsUpdate();
            }
        });
    }

    async loadWorkflowSettings() {
        try {
            const response = await authManager.makeAuthenticatedRequest('/api/workflow/settings');
            if (response.ok) {
                const data = await response.json();
                this.workflowSettings = data.settings;
            }
        } catch (error) {
            console.error('Failed to load workflow settings:', error);
        }
    }

    // Show status update modal
    showStatusUpdateModal(quoteId, newStatus) {
        this.currentQuoteId = quoteId;
        
        const modal = document.createElement('div');
        modal.className = 'modern-modal';
        modal.id = 'statusUpdateModal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Actualizar Estado de Cotización</h3>
                    <button type="button" class="close-btn" onclick="this.closest('.modern-modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="statusUpdateForm">
                        <div class="form-section">
                            <label>Nuevo Estado:</label>
                            <div class="status-badge" style="background-color: ${this.statusColors[newStatus]}">
                                ${this.statusLabels[newStatus]}
                            </div>
                            <input type="hidden" name="status" value="${newStatus}">
                        </div>
                        
                        <div class="form-section">
                            <label for="reason">Razón del Cambio:</label>
                            <select name="reason" id="reason" class="form-control" required>
                                <option value="">Seleccionar razón...</option>
                                <option value="manual_update">Actualización Manual</option>
                                <option value="client_request">Solicitud del Cliente</option>
                                <option value="internal_review">Revisión Interna</option>
                                <option value="system_update">Actualización del Sistema</option>
                                <option value="other">Otro</option>
                            </select>
                        </div>
                        
                        <div class="form-section">
                            <label for="notes">Notas (Opcional):</label>
                            <textarea name="notes" id="notes" class="form-control" rows="3" 
                                placeholder="Agregar comentarios sobre este cambio de estado..."></textarea>
                        </div>
                        
                        <div class="modal-actions">
                            <button type="button" class="btn btn-secondary" onclick="this.closest('.modern-modal').remove()">
                                Cancelar
                            </button>
                            <button type="submit" class="btn btn-primary">
                                <i class="fas fa-save"></i>
                                Actualizar Estado
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.style.display = 'flex';
    }

    // Handle status update form submission
    async handleStatusUpdate() {
        const form = document.getElementById('statusUpdateForm');
        const formData = new FormData(form);
        
        const updateData = {
            status: formData.get('status'),
            reason: formData.get('reason'),
            notes: formData.get('notes'),
            metadata: {
                updatedViaUI: true,
                timestamp: new Date().toISOString()
            }
        };

        try {
            const response = await authManager.makeAuthenticatedRequest(
                `/api/workflow/quotes/${this.currentQuoteId}/status`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updateData)
                }
            );

            const result = await response.json();

            if (response.ok && result.success) {
                this.showSuccessMessage(`Estado actualizado a: ${this.statusLabels[result.status]}`);
                document.getElementById('statusUpdateModal').remove();
                
                // Check if approval is required
                if (result.requiresApproval) {
                    this.showInfoMessage('La cotización requiere aprobación debido al monto. Se ha enviado para revisión.');
                }
                
                // Refresh the quotes list
                if (typeof window.quoteGenerator !== 'undefined') {
                    window.quoteGenerator.loadQuotes();
                }
            } else {
                this.showErrorMessage(result.error || 'Error al actualizar el estado');
            }
        } catch (error) {
            console.error('Status update error:', error);
            this.showErrorMessage('Error de conexión al actualizar el estado');
        }
    }

    // Show status history modal
    async showStatusHistoryModal(quoteId) {
        try {
            const response = await authManager.makeAuthenticatedRequest(`/api/workflow/quotes/${quoteId}/status-history`);
            const data = await response.json();

            if (!response.ok || !data.success) {
                this.showErrorMessage('Error al cargar el historial de estados');
                return;
            }

            const modal = document.createElement('div');
            modal.className = 'modern-modal';
            modal.id = 'statusHistoryModal';
            modal.innerHTML = `
                <div class="modal-content large-modal">
                    <div class="modal-header">
                        <h3>Historial de Estados - Cotización #${quoteId}</h3>
                        <button type="button" class="close-btn" onclick="this.closest('.modern-modal').remove()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="status-history-timeline">
                            ${this.renderStatusHistory(data.history)}
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            modal.style.display = 'flex';
        } catch (error) {
            console.error('Failed to load status history:', error);
            this.showErrorMessage('Error al cargar el historial');
        }
    }

    // Render status history timeline
    renderStatusHistory(history) {
        if (!history || history.length === 0) {
            return '<p class="text-muted">No hay historial de cambios disponible.</p>';
        }

        return history.map((record, index) => {
            const isFirst = index === 0;
            const previousStatus = record.previous_status;
            const newStatus = record.new_status;
            
            return `
                <div class="timeline-item ${isFirst ? 'current' : ''}">
                    <div class="timeline-marker" style="background-color: ${this.statusColors[newStatus]}"></div>
                    <div class="timeline-content">
                        <div class="timeline-header">
                            <div class="status-change">
                                ${previousStatus ? `
                                    <span class="status-badge small" style="background-color: ${this.statusColors[previousStatus]}">
                                        ${this.statusLabels[previousStatus]}
                                    </span>
                                    <i class="fas fa-arrow-right"></i>
                                ` : ''}
                                <span class="status-badge small" style="background-color: ${this.statusColors[newStatus]}">
                                    ${this.statusLabels[newStatus]}
                                </span>
                            </div>
                            <div class="timeline-date">
                                ${new Date(record.created_at).toLocaleString('es-DO')}
                            </div>
                        </div>
                        <div class="timeline-details">
                            <div class="changed-by">
                                <i class="fas fa-user"></i>
                                Por: ${record.changed_by_name || 'Sistema'}
                            </div>
                            ${record.change_reason ? `
                                <div class="change-reason">
                                    <i class="fas fa-info-circle"></i>
                                    Razón: ${record.change_reason}
                                </div>
                            ` : ''}
                            ${record.notes ? `
                                <div class="change-notes">
                                    <i class="fas fa-comment"></i>
                                    Notas: ${record.notes}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Load and display pending approvals
    async loadPendingApprovals() {
        try {
            const response = await authManager.makeAuthenticatedRequest('/api/workflow/approvals/pending');
            const data = await response.json();

            if (response.ok && data.success) {
                this.displayPendingApprovals(data.approvals);
            }
        } catch (error) {
            console.error('Failed to load pending approvals:', error);
        }
    }

    // Display pending approvals
    displayPendingApprovals(approvals) {
        const container = document.getElementById('pendingApprovalsContainer');
        if (!container) return;

        if (approvals.length === 0) {
            container.innerHTML = '<p class="text-muted">No hay aprobaciones pendientes.</p>';
            return;
        }

        container.innerHTML = `
            <div class="approvals-list">
                ${approvals.map(approval => `
                    <div class="approval-card">
                        <div class="approval-header">
                            <div class="quote-info">
                                <h4>Cotización ${approval.quote_number}</h4>
                                <p>Cliente: ${approval.client_name}</p>
                                <p>Monto: ${new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(approval.total)}</p>
                            </div>
                            <div class="approval-meta">
                                <span class="approval-level">Nivel ${approval.approval_level}</span>
                                <span class="approval-date">${new Date(approval.created_at).toLocaleDateString('es-DO')}</span>
                            </div>
                        </div>
                        <div class="approval-details">
                            <p><strong>Creado por:</strong> ${approval.creator_first_name} ${approval.creator_last_name}</p>
                            <p><strong>Fecha de cotización:</strong> ${new Date(approval.quote_created_at).toLocaleDateString('es-DO')}</p>
                        </div>
                        <div class="approval-actions">
                            <button class="btn btn-success approve-btn" data-approval-id="${approval.id}">
                                <i class="fas fa-check"></i>
                                Aprobar
                            </button>
                            <button class="btn btn-danger reject-btn" data-approval-id="${approval.id}">
                                <i class="fas fa-times"></i>
                                Rechazar
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Process approval decision
    async processApproval(approvalId, decision) {
        const comments = prompt(decision === 'approved' ? 
            '¿Comentarios sobre la aprobación? (Opcional)' : 
            'Por favor, proporcione la razón del rechazo:'
        );

        if (decision === 'rejected' && !comments) {
            this.showErrorMessage('Se requieren comentarios para rechazar una cotización');
            return;
        }

        try {
            const response = await authManager.makeAuthenticatedRequest(
                `/api/workflow/approvals/${approvalId}/decision`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ decision, comments })
                }
            );

            const result = await response.json();

            if (response.ok && result.success) {
                this.showSuccessMessage(`Cotización ${decision === 'approved' ? 'aprobada' : 'rechazada'} exitosamente`);
                this.loadPendingApprovals(); // Refresh the list
            } else {
                this.showErrorMessage(result.error || 'Error al procesar la aprobación');
            }
        } catch (error) {
            console.error('Approval processing error:', error);
            this.showErrorMessage('Error de conexión al procesar la aprobación');
        }
    }

    // Load workflow statistics
    async loadWorkflowStatistics(timeframe = 30) {
        try {
            const response = await authManager.makeAuthenticatedRequest(
                `/api/workflow/statistics?timeframe=${timeframe}`
            );
            const data = await response.json();

            if (response.ok && data.success) {
                this.displayWorkflowStatistics(data.statistics);
            }
        } catch (error) {
            console.error('Failed to load workflow statistics:', error);
        }
    }

    // Display workflow statistics
    displayWorkflowStatistics(statistics) {
        const container = document.getElementById('workflowStatsContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <h3>Por Estado</h3>
                    <div class="status-stats">
                        ${statistics.byStatus.map(stat => `
                            <div class="stat-item">
                                <span class="status-badge small" style="background-color: ${this.statusColors[stat.status]}">
                                    ${this.statusLabels[stat.status]}
                                </span>
                                <span class="stat-count">${stat.count}</span>
                                <span class="stat-value">${new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(stat.total_value)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="stat-card">
                    <h3>Embudo de Conversión</h3>
                    <div class="funnel-stats">
                        <div class="funnel-item">
                            <span>Total de Cotizaciones</span>
                            <span class="funnel-count">${statistics.funnel.total_quotes || 0}</span>
                            <span class="funnel-rate">100%</span>
                        </div>
                        <div class="funnel-item">
                            <span>Enviadas</span>
                            <span class="funnel-count">${statistics.funnel.sent_quotes || 0}</span>
                            <span class="funnel-rate">${statistics.funnel.sent_rate || 0}%</span>
                        </div>
                        <div class="funnel-item">
                            <span>Vistas</span>
                            <span class="funnel-count">${statistics.funnel.viewed_quotes || 0}</span>
                            <span class="funnel-rate">${statistics.funnel.view_rate || 0}%</span>
                        </div>
                        <div class="funnel-item">
                            <span>Aceptadas</span>
                            <span class="funnel-count">${statistics.funnel.accepted_quotes || 0}</span>
                            <span class="funnel-rate">${statistics.funnel.acceptance_rate || 0}%</span>
                        </div>
                        <div class="funnel-item">
                            <span>Convertidas</span>
                            <span class="funnel-count">${statistics.funnel.converted_quotes || 0}</span>
                            <span class="funnel-rate">${statistics.funnel.conversion_rate || 0}%</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Add status indicators to quote cards
    enhanceQuoteCards() {
        const quoteCards = document.querySelectorAll('.quote-card');
        quoteCards.forEach(card => {
            const status = card.dataset.status;
            if (status && this.statusColors[status]) {
                // Add status badge
                const statusBadge = document.createElement('div');
                statusBadge.className = 'status-badge';
                statusBadge.style.backgroundColor = this.statusColors[status];
                statusBadge.textContent = this.statusLabels[status];
                
                // Add workflow actions
                const actionsContainer = document.createElement('div');
                actionsContainer.className = 'workflow-actions';
                actionsContainer.innerHTML = `
                    <button class="btn btn-sm btn-outline view-history-btn" data-quote-id="${card.dataset.quoteId}" title="Ver Historial">
                        <i class="fas fa-history"></i>
                    </button>
                `;

                card.querySelector('.quote-header').appendChild(statusBadge);
                card.querySelector('.quote-actions').appendChild(actionsContainer);
            }
        });
    }

    // Utility methods
    showSuccessMessage(message) {
        this.showToast(message, 'success');
    }

    showErrorMessage(message) {
        this.showToast(message, 'error');
    }

    showInfoMessage(message) {
        this.showToast(message, 'info');
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                <span>${message}</span>
            </div>
        `;

        document.body.appendChild(toast);

        // Auto remove after 5 seconds
        setTimeout(() => {
            toast.remove();
        }, 5000);

        // Allow manual close
        toast.addEventListener('click', () => toast.remove());
    }
}

// Initialize workflow manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.quoteWorkflowManager = new QuoteWorkflowManager();
});

// Export for global access
window.QuoteWorkflowManager = QuoteWorkflowManager;