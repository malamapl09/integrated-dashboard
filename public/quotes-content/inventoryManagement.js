class InventoryManager {
    constructor() {
        this.stockCheckCache = new Map();
        this.cacheDuration = 60000; // 1 minute cache
        this.init();
    }

    async init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Event listeners for inventory management
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('check-stock-btn')) {
                const productId = e.target.dataset.productId;
                this.checkSingleProductStock(productId);
            }

            if (e.target.classList.contains('reserve-stock-btn')) {
                const quoteId = e.target.dataset.quoteId;
                this.showStockReservationModal(quoteId);
            }

            if (e.target.classList.contains('release-reservation-btn')) {
                const quoteId = e.target.dataset.quoteId;
                this.releaseStockReservation(quoteId);
            }

            if (e.target.classList.contains('view-low-stock-btn')) {
                this.showLowStockModal();
            }

            if (e.target.classList.contains('refresh-inventory-btn')) {
                this.refreshInventoryData();
            }
        });

        // Form submissions
        document.addEventListener('submit', (e) => {
            if (e.target.id === 'stockReservationForm') {
                e.preventDefault();
                this.handleStockReservation();
            }
        });
    }

    // Check stock for a single product
    async checkSingleProductStock(productId) {
        try {
            const response = await authManager.makeAuthenticatedRequest(`/api/inventory/stock/${productId}`);
            const data = await response.json();

            if (response.ok && data.success) {
                this.displayProductStock(productId, data.stock);
            } else {
                this.showErrorMessage('Error al consultar stock del producto');
            }
        } catch (error) {
            console.error('Error checking product stock:', error);
            this.showErrorMessage('Error de conexión al consultar stock');
        }
    }

    // Check stock for multiple products (bulk)
    async checkBulkStock(productIds) {
        const cacheKey = productIds.sort().join(',');
        const cached = this.stockCheckCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < this.cacheDuration) {
            return cached.data;
        }

        try {
            const response = await authManager.makeAuthenticatedRequest('/api/inventory/stock/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skus: productIds })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Cache the result
                this.stockCheckCache.set(cacheKey, {
                    data: data.stock_data,
                    timestamp: Date.now()
                });

                return data.stock_data;
            } else {
                throw new Error(data.error || 'Failed to check bulk stock');
            }
        } catch (error) {
            console.error('Error checking bulk stock:', error);
            throw error;
        }
    }

    // Check stock availability for quote items
    async checkQuoteStockAvailability(quoteItems) {
        try {
            const response = await authManager.makeAuthenticatedRequest('/api/inventory/check-availability', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quote_items: quoteItems })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                return data.availability;
            } else {
                throw new Error(data.error || 'Failed to check stock availability');
            }
        } catch (error) {
            console.error('Error checking quote stock availability:', error);
            throw error;
        }
    }

    // Display product stock information
    displayProductStock(productId, stock) {
        const stockElement = document.querySelector(`[data-product-id="${productId}"] .stock-info`);
        if (stockElement) {
            const stockStatus = this.getStockStatusClass(stock.current_stock);
            stockElement.innerHTML = `
                <div class="stock-display ${stockStatus}">
                    <i class="fas fa-boxes"></i>
                    <span class="stock-quantity">${stock.current_stock}</span>
                    <span class="stock-label">en stock</span>
                    ${stock.locations > 1 ? `<small>(${stock.locations} ubicaciones)</small>` : ''}
                </div>
                <div class="stock-updated">
                    Actualizado: ${new Date(stock.last_updated).toLocaleTimeString('es-DO')}
                </div>
            `;
        }
    }

    // Enhance quote items with stock information
    async enhanceQuoteItemsWithStock(quoteItems) {
        if (!quoteItems || quoteItems.length === 0) return;

        try {
            const productIds = quoteItems.map(item => item.product_id);
            const stockData = await this.checkBulkStock(productIds);

            quoteItems.forEach(item => {
                const stock = stockData[item.product_id];
                if (stock) {
                    this.addStockIndicatorToQuoteItem(item, stock);
                }
            });
        } catch (error) {
            console.error('Failed to enhance quote items with stock:', error);
        }
    }

    // Add stock indicator to quote item
    addStockIndicatorToQuoteItem(item, stock) {
        const itemElement = document.querySelector(`[data-item-id="${item.id}"]`);
        if (itemElement) {
            const stockStatus = this.getStockStatusClass(stock.current_stock, item.quantity);
            const stockIndicator = document.createElement('div');
            stockIndicator.className = `stock-indicator ${stockStatus}`;
            stockIndicator.innerHTML = `
                <i class="fas fa-boxes"></i>
                <span>${stock.current_stock} disponible</span>
                ${stock.current_stock < item.quantity ? '<i class="fas fa-exclamation-triangle warning"></i>' : ''}
            `;
            
            itemElement.querySelector('.item-details').appendChild(stockIndicator);
        }
    }

    // Show stock reservation modal
    showStockReservationModal(quoteId) {
        const modal = document.createElement('div');
        modal.className = 'modern-modal';
        modal.id = 'stockReservationModal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Reservar Stock para Cotización</h3>
                    <button type="button" class="close-btn" onclick="this.closest('.modern-modal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="stockReservationForm">
                        <input type="hidden" name="quoteId" value="${quoteId}">
                        
                        <div class="form-section">
                            <label for="reservationMinutes">Tiempo de Reserva (minutos):</label>
                            <select name="reservationMinutes" id="reservationMinutes" class="form-control" required>
                                <option value="15">15 minutos</option>
                                <option value="30" selected>30 minutos</option>
                                <option value="60">1 hora</option>
                                <option value="120">2 horas</option>
                                <option value="240">4 horas</option>
                            </select>
                        </div>
                        
                        <div class="modal-actions">
                            <button type="button" class="btn btn-secondary" onclick="this.closest('.modern-modal').remove()">
                                Cancelar
                            </button>
                            <button type="submit" class="btn btn-primary">
                                <i class="fas fa-lock"></i>
                                Reservar Stock
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.style.display = 'flex';
    }

    // Handle stock reservation
    async handleStockReservation() {
        const form = document.getElementById('stockReservationForm');
        const formData = new FormData(form);
        const quoteId = formData.get('quoteId');
        const reservationMinutes = parseInt(formData.get('reservationMinutes'));

        try {
            // Get quote items first
            const quoteResponse = await authManager.makeAuthenticatedRequest(`/api/quotes/${quoteId}`);
            const quoteData = await quoteResponse.json();

            if (!quoteResponse.ok) {
                throw new Error('No se pudo obtener la información de la cotización');
            }

            const response = await authManager.makeAuthenticatedRequest(`/api/inventory/reserve/${quoteId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quote_items: quoteData.items,
                    reservation_minutes: reservationMinutes
                })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                this.showSuccessMessage(`Stock reservado exitosamente hasta ${new Date(result.reservation.expires_at).toLocaleString('es-DO')}`);
                document.getElementById('stockReservationModal').remove();
                this.refreshInventoryData();
            } else {
                this.showErrorMessage(result.error || 'Error al reservar el stock');
            }
        } catch (error) {
            console.error('Stock reservation error:', error);
            this.showErrorMessage('Error de conexión al reservar stock');
        }
    }

    // Release stock reservation
    async releaseStockReservation(quoteId, reason = 'manual_release') {
        if (!confirm('¿Está seguro de que desea liberar la reserva de stock para esta cotización?')) {
            return;
        }

        try {
            const response = await authManager.makeAuthenticatedRequest(`/api/inventory/reserve/${quoteId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                this.showSuccessMessage('Reserva de stock liberada exitosamente');
                this.refreshInventoryData();
            } else {
                this.showErrorMessage(result.error || 'Error al liberar la reserva de stock');
            }
        } catch (error) {
            console.error('Error releasing stock reservation:', error);
            this.showErrorMessage('Error de conexión al liberar reserva');
        }
    }

    // Show low stock modal
    async showLowStockModal(threshold = null) {
        try {
            const response = await authManager.makeAuthenticatedRequest(
                `/api/inventory/low-stock${threshold ? `?threshold=${threshold}` : ''}`
            );
            const data = await response.json();

            if (!response.ok || !data.success) {
                this.showErrorMessage('Error al cargar productos con stock bajo');
                return;
            }

            const modal = document.createElement('div');
            modal.className = 'modern-modal';
            modal.id = 'lowStockModal';
            modal.innerHTML = `
                <div class="modal-content large-modal">
                    <div class="modal-header">
                        <h3>Productos con Stock Bajo (${data.products.length})</h3>
                        <button type="button" class="close-btn" onclick="this.closest('.modern-modal').remove()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="low-stock-summary">
                            <div class="summary-stats">
                                <div class="stat-item critical">
                                    <span class="stat-number">${data.products.filter(p => p.urgency === 'critical').length}</span>
                                    <span class="stat-label">Críticos (0 stock)</span>
                                </div>
                                <div class="stat-item high">
                                    <span class="stat-number">${data.products.filter(p => p.urgency === 'high').length}</span>
                                    <span class="stat-label">Alta prioridad (≤5)</span>
                                </div>
                                <div class="stat-item medium">
                                    <span class="stat-number">${data.products.filter(p => p.urgency === 'medium').length}</span>
                                    <span class="stat-label">Prioridad media</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="low-stock-products">
                            ${this.renderLowStockProducts(data.products)}
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            modal.style.display = 'flex';
        } catch (error) {
            console.error('Error loading low stock products:', error);
            this.showErrorMessage('Error al cargar productos con stock bajo');
        }
    }

    // Render low stock products
    renderLowStockProducts(products) {
        if (!products || products.length === 0) {
            return '<p class="text-muted">No hay productos con stock bajo.</p>';
        }

        return `
            <div class="products-table">
                <div class="table-header">
                    <div class="col-product">Producto</div>
                    <div class="col-category">Categoría</div>
                    <div class="col-stock">Stock</div>
                    <div class="col-price">Precio</div>
                    <div class="col-urgency">Urgencia</div>
                </div>
                ${products.map(product => `
                    <div class="table-row ${product.urgency}">
                        <div class="col-product">
                            <div class="product-info">
                                <div class="product-name">${product.name}</div>
                                <div class="product-sku">${product.sku}</div>
                            </div>
                        </div>
                        <div class="col-category">${product.category || 'N/A'}</div>
                        <div class="col-stock">
                            <div class="stock-display ${this.getStockStatusClass(product.current_stock)}">
                                <span class="stock-number">${product.current_stock}</span>
                                ${product.current_stock === 0 ? '<i class="fas fa-exclamation-triangle"></i>' : ''}
                            </div>
                        </div>
                        <div class="col-price">
                            ${new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(product.price)}
                        </div>
                        <div class="col-urgency">
                            <span class="urgency-badge ${product.urgency}">
                                ${product.urgency === 'critical' ? 'Crítico' : 
                                  product.urgency === 'high' ? 'Alto' : 'Medio'}
                            </span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Load inventory dashboard
    async loadInventoryDashboard() {
        const container = document.getElementById('inventoryDashboardContainer');
        if (!container) return;

        try {
            const response = await authManager.makeAuthenticatedRequest('/api/inventory/dashboard');
            const data = await response.json();

            if (response.ok && data.success) {
                this.renderInventoryDashboard(container, data.dashboard);
            }
        } catch (error) {
            console.error('Error loading inventory dashboard:', error);
            container.innerHTML = '<p class="error-message">Error al cargar el dashboard de inventario</p>';
        }
    }

    // Render inventory dashboard
    renderInventoryDashboard(container, dashboard) {
        container.innerHTML = `
            <div class="inventory-dashboard">
                <div class="dashboard-stats">
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-boxes"></i>
                        </div>
                        <div class="stat-content">
                            <div class="stat-number">${dashboard.statistics.total_products}</div>
                            <div class="stat-label">Total Productos</div>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon in-stock">
                            <i class="fas fa-check-circle"></i>
                        </div>
                        <div class="stat-content">
                            <div class="stat-number">${dashboard.statistics.in_stock}</div>
                            <div class="stat-label">En Stock</div>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon low-stock">
                            <i class="fas fa-exclamation-triangle"></i>
                        </div>
                        <div class="stat-content">
                            <div class="stat-number">${dashboard.low_stock.total_count}</div>
                            <div class="stat-label">Stock Bajo</div>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon out-of-stock">
                            <i class="fas fa-times-circle"></i>
                        </div>
                        <div class="stat-content">
                            <div class="stat-number">${dashboard.statistics.out_of_stock}</div>
                            <div class="stat-label">Sin Stock</div>
                        </div>
                    </div>
                </div>
                
                <div class="dashboard-actions">
                    <button class="btn btn-primary view-low-stock-btn">
                        <i class="fas fa-exclamation-triangle"></i>
                        Ver Stock Bajo (${dashboard.low_stock.critical_count} críticos)
                    </button>
                    <button class="btn btn-outline refresh-inventory-btn">
                        <i class="fas fa-sync-alt"></i>
                        Actualizar Datos
                    </button>
                </div>
                
                <div class="dashboard-details">
                    <div class="detail-card">
                        <h4>Reservas Activas</h4>
                        <div class="reservation-info">
                            <span class="reservation-count">${dashboard.reservations.active_count}</span> reservas activas
                            <br>
                            <span class="reservation-units">${dashboard.reservations.total_reserved_units}</span> unidades reservadas
                        </div>
                    </div>
                    
                    <div class="detail-card">
                        <h4>Salud del Inventario</h4>
                        <div class="health-meter">
                            <div class="health-bar">
                                <div class="health-fill" style="width: ${dashboard.statistics.stock_health_percentage}%"></div>
                            </div>
                            <span class="health-percentage">${dashboard.statistics.stock_health_percentage}%</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Refresh inventory data
    async refreshInventoryData() {
        // Clear cache
        this.stockCheckCache.clear();
        
        // Reload dashboard if present
        await this.loadInventoryDashboard();
        
        this.showSuccessMessage('Datos de inventario actualizados');
    }

    // Helper methods
    getStockStatusClass(currentStock, requestedQty = 0) {
        if (currentStock === 0) return 'out-of-stock';
        if (currentStock <= 10) return 'low-stock';
        if (requestedQty > 0 && currentStock < requestedQty) return 'insufficient-stock';
        return 'in-stock';
    }

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

// Initialize inventory manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.inventoryManager = new InventoryManager();
});

// Export for global access
window.InventoryManager = InventoryManager;