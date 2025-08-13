class QuoteGenerator {
    constructor() {
        console.log('QuoteGenerator constructor called');
        this.selectedProducts = [];
        this.clients = [];
        this.quotes = [];
        this.searchTimeout = null;
        this.clientSearchTimeout = null;
        this.selectedClient = null;
        
        console.log('Starting QuoteGenerator initialization...');
        this.init();
    }

    async init() {
        console.log('QuoteGenerator init() called');
        try {
            console.log('Setting up event listeners...');
            this.setupEventListeners();
            
            // Wait for authentication to be initialized before loading data
            console.log('Checking authentication...');
            if (authManager.isAuthenticated()) {
                console.log('User is authenticated, loading initial data...');
                await this.loadInitialData();
            } else {
                console.log('User not authenticated');
            }
            
            // Listen for authentication changes
            console.log('Setting up auth listeners...');
            this.setupAuthListeners();
            console.log('QuoteGenerator initialization complete');
        } catch (error) {
            console.error('Error during QuoteGenerator init:', error);
            throw error;
        }
    }

    async loadInitialData() {
        await this.loadClients();
        await this.loadQuotes();
    }

    setupAuthListeners() {
        // This method can be used to listen for auth state changes if needed
        // For now, data loading is handled by the login process
    }

    setupEventListeners() {
        // Product search with debouncing
        document.getElementById('searchBtn').addEventListener('click', () => this.searchProducts());
        document.getElementById('productSearch').addEventListener('input', (e) => {
            this.debouncedSearch(e.target.value);
        });
        document.getElementById('productSearch').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.searchProducts();
            }
        });

        // Quote form
        document.getElementById('quoteForm').addEventListener('submit', (e) => this.handleQuoteSubmit(e));

        // Client form
        document.getElementById('saveClientBtn').addEventListener('click', () => this.saveClient());
        
        // Client search
        document.getElementById('clientSearch').addEventListener('input', (e) => {
            this.debouncedClientSearch(e.target.value);
        });
        document.getElementById('clientSearch').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.searchClients();
            }
        });

        // Set default valid until date (3 days from now)
        const validUntilDate = new Date();
        validUntilDate.setDate(validUntilDate.getDate() + 3);
        document.getElementById('validUntil').value = validUntilDate.toISOString().split('T')[0];

        // Email form event listeners (defer until DOM is ready)
        setTimeout(() => {
            const recipientEmailInput = document.getElementById('recipientEmail');
            const emailSubjectInput = document.getElementById('emailSubject');
            const customMessageInput = document.getElementById('customMessage');

            if (recipientEmailInput) {
                recipientEmailInput.addEventListener('input', () => this.updateEmailPreview());
            }
            if (emailSubjectInput) {
                emailSubjectInput.addEventListener('input', () => this.updateEmailPreview());
            }
            if (customMessageInput) {
                customMessageInput.addEventListener('input', () => this.updateEmailPreview());
            }
        }, 100);
    }

    debouncedSearch(searchTerm) {
        // Clear existing timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        // Set new timeout
        this.searchTimeout = setTimeout(() => {
            if (searchTerm.trim().length >= 2) {
                this.performSearch(searchTerm.trim());
            } else if (searchTerm.trim().length === 0) {
                // Clear results when search is empty
                document.getElementById('searchResults').style.display = 'none';
            }
        }, 300); // 300ms delay
    }

    async performSearch(searchTerm) {
        try {
            const response = await authManager.makeAuthenticatedRequest(`/api/quotes/products?search=${encodeURIComponent(searchTerm)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            const products = result.success ? result.data : [];
            
            // Deduplicate products by ID
            const uniqueProducts = products.filter((product, index, self) => 
                index === self.findIndex(p => p.id === product.id)
            );
            
            this.displaySearchResults(uniqueProducts);
        } catch (error) {
            console.error('Error searching products:', error);
            this.showAlert(`Error al buscar productos: ${error.message}`, 'danger');
        }
    }

    async loadClients() {
        try {
            const response = await authManager.makeAuthenticatedRequest('/api/quotes/clients');
            
            if (!response.ok) {
                throw new Error('Failed to load clients');
            }
            
            const result = await response.json();
            this.clients = result.success ? result.data : [];
        } catch (error) {
            console.error('Error loading clients:', error);
            this.showAlert('Error al cargar clientes', 'danger');
        }
    }

    async loadQuotes() {
        try {
            const response = await authManager.makeAuthenticatedRequest('/api/quotes');
            
            if (!response.ok) {
                throw new Error('Failed to load quotes');
            }
            
            const result = await response.json();
            this.quotes = result.success ? result.data.quotes : [];
            this.populateQuotesTable();
        } catch (error) {
            console.error('Error loading quotes:', error);
            this.showAlert('Error al cargar cotizaciones', 'danger');
        }
    }

    debouncedClientSearch(searchTerm) {
        // Clear existing timeout
        if (this.clientSearchTimeout) {
            clearTimeout(this.clientSearchTimeout);
        }
        
        // Set new timeout
        this.clientSearchTimeout = setTimeout(() => {
            if (searchTerm.trim().length >= 2) {
                this.performClientSearch(searchTerm.trim());
            } else if (searchTerm.trim().length === 0) {
                // Clear results when search is empty
                document.getElementById('clientSearchResults').style.display = 'none';
            }
        }, 300); // 300ms delay
    }

    async performClientSearch(searchTerm) {
        try {
            // Search in loaded clients first
            const filteredClients = this.clients.filter(client => 
                client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (client.email && client.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (client.company && client.company.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (client.phone && client.phone.includes(searchTerm)) ||
                (client.rnc && client.rnc.includes(searchTerm))
            );

            this.displayClientSearchResults(filteredClients);
        } catch (error) {
            console.error('Error searching clients:', error);
            this.showAlert(`Error al buscar clientes: ${error.message}`, 'danger');
        }
    }

    displayClientSearchResults(clients) {
        const resultsDiv = document.getElementById('clientSearchResults');
        const resultsBody = document.getElementById('clientSearchResultsBody');
        
        if (clients.length === 0) {
            resultsBody.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <div>No se encontraron clientes</div>
                    <small>Intenta con otro término de búsqueda o crea un nuevo cliente</small>
                </div>
            `;
            resultsDiv.style.display = 'block';
            return;
        }

        resultsBody.innerHTML = clients.map(client => `
            <div class="client-search-item" onclick="quoteGen.selectClient(${client.id})">
                <div class="client-item-header">
                    <div class="client-item-name">${client.name}</div>
                </div>
                ${client.company ? `<div class="client-item-company">${client.company}</div>` : ''}
                <div class="client-item-contact">
                    ${client.email ? `<span><i class="fas fa-envelope"></i> ${client.email}</span>` : ''}
                    ${client.phone ? `<span><i class="fas fa-phone"></i> ${client.phone}</span>` : ''}
                </div>
                ${client.rnc ? `<div class="client-item-details"><strong>RNC:</strong> ${client.rnc}</div>` : ''}
            </div>
        `).join('');
        
        resultsDiv.style.display = 'block';
    }

    selectClient(clientId) {
        const client = this.clients.find(c => c.id === clientId);
        if (!client) {
            this.showAlert('Cliente no encontrado', 'error');
            return;
        }

        this.selectedClient = client;
        
        // Update UI
        document.getElementById('clientSearch').value = client.company ? `${client.name} (${client.company})` : client.name;
        document.getElementById('selectedClientId').value = client.id;
        document.getElementById('clientSearchResults').style.display = 'none';
        
        // Show selected client info
        this.displaySelectedClientInfo(client);
    }

    displaySelectedClientInfo(client) {
        const selectedInfo = document.getElementById('selectedClientInfo');
        const selectedData = document.getElementById('selectedClientData');
        
        selectedData.innerHTML = `
            <div class="client-info-field">
                <div class="client-info-label">Nombre</div>
                <div class="client-info-value">${client.name}</div>
            </div>
            <div class="client-info-field">
                <div class="client-info-label">Email</div>
                <div class="client-info-value ${client.email ? '' : 'empty'}">${client.email || 'No especificado'}</div>
            </div>
            <div class="client-info-field">
                <div class="client-info-label">Teléfono</div>
                <div class="client-info-value ${client.phone ? '' : 'empty'}">${client.phone || 'No especificado'}</div>
            </div>
            <div class="client-info-field">
                <div class="client-info-label">Empresa</div>
                <div class="client-info-value ${client.company ? '' : 'empty'}">${client.company || 'No especificado'}</div>
            </div>
            <div class="client-info-field">
                <div class="client-info-label">Dirección</div>
                <div class="client-info-value ${client.address ? '' : 'empty'}">${client.address || 'No especificado'}</div>
            </div>
            <div class="client-info-field">
                <div class="client-info-label">RNC</div>
                <div class="client-info-value ${client.rnc ? '' : 'empty'}">${client.rnc || 'No especificado'}</div>
            </div>
        `;
        
        selectedInfo.style.display = 'block';
    }

    clearClientSelection() {
        this.selectedClient = null;
        document.getElementById('clientSearch').value = '';
        document.getElementById('selectedClientId').value = '';
        document.getElementById('selectedClientInfo').style.display = 'none';
        document.getElementById('clientSearchResults').style.display = 'none';
    }

    async searchClients() {
        const searchTerm = document.getElementById('clientSearch').value.trim();
        if (!searchTerm) {
            this.showAlert('Ingrese un término de búsqueda', 'warning');
            return;
        }
        await this.performClientSearch(searchTerm);
    }

    populateQuotesTable() {
        const tbody = document.getElementById('quotesList');
        tbody.innerHTML = '';
        
        if (this.quotes.length === 0) {
            tbody.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-invoice"></i>
                    <div>No hay cotizaciones disponibles</div>
                    <small>Las cotizaciones que generes aparecerán aquí</small>
                </div>
            `;
            return;
        }
        
        this.quotes.forEach(quote => {
            const row = document.createElement('div');
            row.className = 'table-row';
            row.innerHTML = `
                <div class="table-cell">${quote.quote_number}</div>
                <div class="table-cell">${quote.client_company || quote.client_name}</div>
                <div class="table-cell">${new Date(quote.created_at).toLocaleDateString()}</div>
                <div class="table-cell">$${quote.total.toFixed(2)}</div>
                <div class="table-cell">
                    <button class="action-button view" onclick="quoteGen.viewQuote(${quote.id})" title="Ver cotización">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-button download" onclick="quoteGen.downloadPDF(${quote.id})" title="Descargar PDF">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="action-button email" onclick="quoteGen.openEmailModal(${quote.id})" title="Enviar por Email">
                        <i class="fas fa-envelope"></i>
                    </button>
                </div>
            `;
            tbody.appendChild(row);
        });
    }

    async searchProducts() {
        const searchTerm = document.getElementById('productSearch').value.trim();
        if (!searchTerm) {
            this.showAlert('Ingrese un término de búsqueda', 'warning');
            return;
        }

        try {
            const response = await authManager.makeAuthenticatedRequest(`/api/quotes/products?search=${encodeURIComponent(searchTerm)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            const products = result.success ? result.data : [];
            console.log('Products received from server:', products);
            
            // Deduplicate products by ID as extra safety measure
            const uniqueProducts = products.filter((product, index, self) => 
                index === self.findIndex(p => p.id === product.id)
            );
            
            if (uniqueProducts.length !== products.length) {
                console.warn(`Removed ${products.length - uniqueProducts.length} duplicate products`);
            }
            
            this.displaySearchResults(uniqueProducts);
        } catch (error) {
            console.error('Error searching products:', error);
            this.showAlert(`Error al buscar productos: ${error.message}`, 'danger');
        }
    }

    displaySearchResults(products) {
        const resultsDiv = document.getElementById('searchResults');
        const resultsBody = document.getElementById('searchResultsBody');
        
        if (products.length === 0) {
            resultsBody.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <div>No se encontraron productos</div>
                    <small>Intenta con otro término de búsqueda</small>
                </div>
            `;
            resultsDiv.style.display = 'block';
            return;
        }

        resultsBody.innerHTML = products.map(product => {
            // Ensure price is a number
            const price = parseFloat(product.price) || 0;
            
            const itbis = parseFloat(product.itbis) || 0;
            const priceWithTax = parseFloat(product.price_with_tax) || price;
            
            return `
            <div class="product-search-item" onclick="quoteGen.addProduct('${product.id}', '${product.ean}', '${product.name.replace(/'/g, "\\'")}', '${(product.description || '').replace(/'/g, "\\'")}', ${price}, ${itbis}, ${priceWithTax})">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
                    <div style="flex: 1; min-width: 0;">
                        <div class="product-ean">${product.ean}</div>
                        <div style="font-weight: 500; margin: 0.25rem 0; color: var(--text-primary);">${product.name}</div>
                        ${product.description ? `<div style="color: var(--text-muted); font-size: 0.875rem; line-height: 1.4; margin-bottom: 0.5rem;">${product.description.substring(0, 120)}${product.description.length > 120 ? '...' : ''}</div>` : ''}
                        ${product.stock_quantity !== undefined ? `<small style="color: var(--plaza-light-blue); font-size: 0.75rem;">Stock: ${product.stock_quantity}</small>` : ''}
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem;">
                        <div class="product-price">$${priceWithTax.toFixed(2)}</div>
                        ${itbis > 0 ? `<small style="color: var(--text-muted); font-size: 0.75rem;">+$${itbis.toFixed(2)} ITBIS</small>` : ''}
                    </div>
                </div>
            </div>`;
        }).join('');
        
        resultsDiv.style.display = 'block';
    }

    addProduct(id, ean, name, description, price, itbis, priceWithTax) {
        // Check if product already exists
        const existingIndex = this.selectedProducts.findIndex(p => p.id === id);
        if (existingIndex !== -1) {
            this.selectedProducts[existingIndex].quantity += 1;
        } else {
            this.selectedProducts.push({
                id,
                ean,
                name,
                description,
                price: parseFloat(price) || 0,
                quantity: 1,
                itbis: parseFloat(itbis) || 0,
                priceWithTax: parseFloat(priceWithTax) || parseFloat(price) || 0
            });
        }
        
        this.updateSelectedProductsTable();
        document.getElementById('searchResults').style.display = 'none';
        document.getElementById('productSearch').value = '';
    }

    removeProduct(index) {
        this.selectedProducts.splice(index, 1);
        this.updateSelectedProductsTable();
    }

    updateQuantity(index, quantity) {
        if (quantity <= 0) {
            this.removeProduct(index);
            return;
        }
        this.selectedProducts[index].quantity = parseInt(quantity);
        this.updateSelectedProductsTable();
    }

    updateSelectedProductsTable() {
        const tbody = document.getElementById('selectedProducts');
        tbody.innerHTML = '';
        
        if (this.selectedProducts.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-state">
                        <i class="fas fa-shopping-cart"></i>
                        <div>No hay productos seleccionados</div>
                        <small>Busca y selecciona productos para agregar a la cotización</small>
                    </td>
                </tr>
            `;
            document.getElementById('subtotalAmount').textContent = '0.00';
            document.getElementById('totalAmount').textContent = '0.00';
            return;
        }
        
        let subtotal = 0;
        let totalItbis = 0;
        
        this.selectedProducts.forEach((product, index) => {
            const itemTotal = product.quantity * product.price;
            const itemItbis = product.quantity * product.itbis;
            
            subtotal += itemTotal;
            totalItbis += itemItbis;
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <span class="product-ean">${product.ean}</span>
                </td>
                <td style="text-align: left;">
                    <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                        <div style="font-weight: 500;">${product.name}</div>
                        ${product.description ? `<small style="color: var(--text-muted); line-height: 1.3;">${product.description.length > 80 ? product.description.substring(0, 80) + '...' : product.description}</small>` : ''}
                    </div>
                </td>
                <td>
                    <input type="number" class="quantity-input" 
                           value="${product.quantity}" min="1" 
                           onchange="quoteGen.updateQuantity(${index}, this.value)">
                </td>
                <td>$${product.price.toFixed(2)}</td>
                <td>$${itemItbis.toFixed(2)}</td>
                <td><strong>$${(itemTotal + itemItbis).toFixed(2)}</strong></td>
                <td>
                    <button class="action-button delete" onclick="quoteGen.removeProduct(${index})" title="Eliminar producto">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
        
        document.getElementById('subtotalAmount').textContent = totalItbis.toFixed(2);
        document.getElementById('totalAmount').textContent = (subtotal + totalItbis).toFixed(2);
    }

    async saveClient() {
        const clientData = {
            name: document.getElementById('clientName').value,
            email: document.getElementById('clientEmail').value,
            phone: document.getElementById('clientPhone').value,
            company: document.getElementById('clientCompany').value,
            address: document.getElementById('clientAddress').value,
            rnc: document.getElementById('clientRnc').value
        };

        if (!clientData.name) {
            this.showAlert('Nombre es requerido', 'warning');
            return;
        }

        try {
            const response = await authManager.makeAuthenticatedRequest('/api/quotes/clients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(clientData)
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    const newClient = { ...clientData, id: result.data.id };
                    this.clients.push(newClient);
                    
                    // Auto-select the newly created client
                    this.selectClient(newClient.id);
                    
                    // Close modal and reset form
                    this.closeClientModal();
                    document.getElementById('clientForm').reset();
                    
                    this.showAlert('Cliente guardado exitosamente', 'success');
                } else {
                    throw new Error(result.message || 'Error al crear cliente');
                }
            } else {
                const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
                throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Error saving client:', error);
            this.showAlert(`Error al guardar cliente: ${error.message}`, 'danger');
        }
    }

    async handleQuoteSubmit(e) {
        e.preventDefault();
        
        const clientId = document.getElementById('selectedClientId').value;
        const validUntil = document.getElementById('validUntil').value;
        const notes = document.getElementById('notes').value;
        
        if (!clientId || !this.selectedClient) {
            this.showAlert('Seleccione un cliente', 'warning');
            return;
        }
        
        if (this.selectedProducts.length === 0) {
            this.showAlert('Agregue al menos un producto', 'warning');
            return;
        }
        
        const quoteData = {
            client_id: parseInt(clientId),
            valid_until: validUntil || null,
            notes: notes || null,
            items: this.selectedProducts.map(product => ({
                product_id: product.id,
                quantity: product.quantity,
                price: product.price,
                itbis: product.itbis * product.quantity
            }))
        };
        
        try {
            const response = await authManager.makeAuthenticatedRequest('/api/quotes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(quoteData)
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    this.showAlert('Cotización creada exitosamente', 'success');
                    
                    // Reset form
                    this.selectedProducts = [];
                    this.updateSelectedProductsTable();
                    this.clearClientSelection();
                    document.getElementById('quoteForm').reset();
                    
                    // Reload quotes
                    await this.loadQuotes();
                } else {
                    throw new Error(result.message || 'Error al crear cotización');
                }
            } else {
                const errorData = await response.json().catch(() => ({ message: 'Error desconocido' }));
                throw new Error(errorData.message || 'Error al crear cotización');
            }
        } catch (error) {
            console.error('Error creating quote:', error);
            this.showAlert('Error al crear cotización', 'danger');
        }
    }

    async downloadPDF(quoteId) {
        try {
            const response = await authManager.makeAuthenticatedRequest(`/api/quotes/${quoteId}/pdf`);
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `cotizacion-${quoteId}.pdf`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Error downloading PDF:', error);
            this.showAlert('Error al descargar PDF', 'danger');
        }
    }

    async viewQuote(quoteId) {
        try {
            const response = await authManager.makeAuthenticatedRequest(`/api/quotes/${quoteId}`);
            
            if (!response.ok) {
                throw new Error('Failed to load quote details');
            }
            
            const result = await response.json();
            if (result.success) {
                const quote = result.data;
                // Display quote details (you can create a modal for this)
                alert(`Cotización: ${quote.quote_number}\nCliente: ${quote.client_name}\nTotal: $${quote.total.toFixed(2)}`);
            } else {
                throw new Error(result.message || 'Error al cargar cotización');
            }
        } catch (error) {
            console.error('Error viewing quote:', error);
            this.showAlert('Error al ver cotización', 'danger');
        }
    }

    openClientModal() {
        console.log('QuoteGenerator.openClientModal() called');
        const modal = document.getElementById('clientModal');
        if (modal) {
            console.log('Setting modal display to flex...');
            modal.style.display = 'flex';
            console.log('Client modal opened successfully');
        } else {
            console.error('Client modal element not found');
        }
    }
    
    closeClientModal() {
        document.getElementById('clientModal').style.display = 'none';
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
            danger: 'fas fa-exclamation-triangle',
            warning: 'fas fa-exclamation-circle',
            info: 'fas fa-info-circle'
        };
        
        const colorMap = {
            success: 'var(--success)',
            danger: 'var(--error)',
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

    // Email functionality
    currentQuoteForEmail = null;

    async openEmailModal(quoteId) {
        try {
            // Fetch quote details
            const response = await authManager.makeAuthenticatedRequest(`/api/quotes/${quoteId}`);
            if (!response.ok) {
                throw new Error('Error al cargar los detalles de la cotización');
            }

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || 'Error al cargar cotización');
            }
            
            const quote = result.data;
            this.currentQuoteForEmail = quote;

            // Populate modal with quote information
            document.getElementById('emailQuoteNumber').textContent = `Cotización ${quote.quote_number}`;
            document.getElementById('emailQuoteClient').textContent = quote.company || quote.client_name;
            document.getElementById('emailQuoteTotal').textContent = `$${parseFloat(quote.total).toFixed(2)}`;

            // Pre-fill recipient email with client's email if available
            const recipientEmail = document.getElementById('recipientEmail');
            recipientEmail.value = quote.client_email || '';

            // Clear other fields
            document.getElementById('emailSubject').value = '';
            document.getElementById('customMessage').value = '';
            
            // Reset preview
            this.updateEmailPreview();

            // Show modal
            document.getElementById('emailModal').style.display = 'flex';

        } catch (error) {
            console.error('Error opening email modal:', error);
            this.showAlert('Error al abrir el formulario de email', 'danger');
        }
    }

    closeEmailModal() {
        document.getElementById('emailModal').style.display = 'none';
        this.currentQuoteForEmail = null;
        
        // Clear form data
        document.getElementById('recipientEmail').value = '';
        document.getElementById('emailSubject').value = '';
        document.getElementById('customMessage').value = '';
        
        // Hide error message
        const errorDiv = document.getElementById('emailError');
        errorDiv.style.display = 'none';
        
        // Hide preview if expanded
        const previewContent = document.getElementById('emailPreviewContent');
        previewContent.style.display = 'none';
        const chevron = document.getElementById('previewChevron');
        chevron.className = 'fas fa-chevron-down';
    }

    updateEmailPreview() {
        if (!this.currentQuoteForEmail) return;

        const recipientEmail = document.getElementById('recipientEmail').value;
        const emailSubject = document.getElementById('emailSubject').value;
        const customMessage = document.getElementById('customMessage').value;

        // Update preview elements
        document.getElementById('previewRecipient').textContent = recipientEmail || 'cliente@ejemplo.com';
        document.getElementById('previewSubject').textContent = emailSubject || 
            `Cotización ${this.currentQuoteForEmail.quote_number} - Plaza Lama, S.A.`;
        document.getElementById('previewAttachment').textContent = this.currentQuoteForEmail.quote_number;

        // Show/hide custom message in preview
        const customMessageDiv = document.getElementById('previewCustomMessage');
        const customTextDiv = document.getElementById('previewCustomText');
        
        if (customMessage.trim()) {
            customTextDiv.textContent = customMessage;
            customMessageDiv.style.display = 'block';
        } else {
            customMessageDiv.style.display = 'none';
        }
    }

    toggleEmailPreview() {
        const previewContent = document.getElementById('emailPreviewContent');
        const chevron = document.getElementById('previewChevron');
        
        if (previewContent.style.display === 'none') {
            this.updateEmailPreview();
            previewContent.style.display = 'block';
            chevron.className = 'fas fa-chevron-up';
        } else {
            previewContent.style.display = 'none';
            chevron.className = 'fas fa-chevron-down';
        }
    }

    async sendQuoteEmail() {
        if (!this.currentQuoteForEmail) {
            this.showAlert('Error: No hay cotización seleccionada', 'danger');
            return;
        }

        const recipientEmail = document.getElementById('recipientEmail').value.trim();
        const emailSubject = document.getElementById('emailSubject').value.trim();
        const customMessage = document.getElementById('customMessage').value.trim();

        // Validate required fields
        if (!recipientEmail) {
            this.showEmailError('El email del destinatario es requerido');
            return;
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(recipientEmail)) {
            this.showEmailError('Por favor ingrese un email válido');
            return;
        }

        // Disable send button and show loading
        const sendButton = document.getElementById('sendEmailBtn');
        const originalContent = sendButton.innerHTML;
        sendButton.disabled = true;
        sendButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Enviando...</span>';

        try {
            const emailData = {
                recipientEmail: recipientEmail
            };

            // Add optional fields if provided
            if (emailSubject) {
                emailData.subject = emailSubject;
            }
            if (customMessage) {
                emailData.customMessage = customMessage;
            }

            const response = await authManager.makeAuthenticatedRequest(
                `/api/quotes/${this.currentQuoteForEmail.id}/email`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(emailData)
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Error al enviar el email');
            }

            const result = await response.json();
            
            // Show success message
            this.showAlert(`Email enviado exitosamente a ${result.details.recipient}`, 'success');
            
            // Close modal
            this.closeEmailModal();

        } catch (error) {
            console.error('Error sending email:', error);
            this.showEmailError(error.message || 'Error al enviar el email');
        } finally {
            // Re-enable send button
            sendButton.disabled = false;
            sendButton.innerHTML = originalContent;
        }
    }

    showEmailError(message) {
        const errorDiv = document.getElementById('emailError');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        errorDiv.style.background = '#fee';
        errorDiv.style.border = '1px solid #fcc';
        errorDiv.style.color = '#c33';
        errorDiv.style.padding = '0.75rem';
        errorDiv.style.borderRadius = '0.375rem';
        errorDiv.style.marginTop = '1rem';
    }
}

// Global modal functions for HTML onclick handlers
function openClientModal() {
    console.log('openClientModal called');
    if (!window.quoteGen) {
        console.error('quoteGen not initialized');
        alert('Application not fully loaded. Please wait a moment and try again.');
        return;
    }
    try {
        console.log('Calling quoteGen.openClientModal()');
        quoteGen.openClientModal();
    } catch (error) {
        console.error('Error opening client modal:', error);
        alert('Error opening client modal: ' + error.message);
    }
}

function closeClientModal() {
    quoteGen.closeClientModal();
}

// Email modal functions
function closeEmailModal() {
    quoteGen.closeEmailModal();
}

function toggleEmailPreview() {
    quoteGen.toggleEmailPreview();
}

function sendQuoteEmail() {
    quoteGen.sendQuoteEmail();
}

// Initialize the application after DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    console.log('DOM loaded, initializing quotes app...');
    // Wait a bit for auth manager to initialize
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
        // Initialize the quote generator
        console.log('Creating QuoteGenerator instance...');
        window.quoteGen = new QuoteGenerator();
        console.log('QuoteGenerator initialized successfully');
    } catch (error) {
        console.error('Error initializing QuoteGenerator:', error);
        alert('Failed to initialize quotes application: ' + error.message);
    }
});