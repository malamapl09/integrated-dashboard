# CLAUDE.md - Integrated Dashboard

This file provides guidance to Claude Code (claude.ai/code) when working with the Integrated Plaza Lama Dashboard system.

## Project Overview

This is a unified dashboard system that integrates 4 previously separate applications:

1. **Quote Management** - Client management, quote generation, PDF export
2. **User Activity Logs** - User action monitoring, audit trails
3. **Catalog Management** - ERP/PIM synchronization, product analysis  
4. **Sales Analytics** - Real-time sales metrics, performance tracking

## Architecture

### Technology Stack
- **Backend**: Node.js + Express.js
- **Frontend**: Vanilla JavaScript + TailwindCSS + Alpine.js
- **Databases**: SQLite (quotes/users) + MySQL (products/logs/sales) + Oracle (ERP - optional)
- **Authentication**: JWT with refresh tokens
- **API**: RESTful endpoints for all modules

### Project Structure
```
integrated-dashboard/
├── src/
│   ├── modules/           # 4 main business modules
│   │   ├── quotes/       # Quote management (migrated from Cotizador)
│   │   ├── logs/         # User logs (migrated from User Log Analyzer)
│   │   ├── catalog/      # Catalog automation (converted from Python)
│   │   └── sales/        # Sales analytics (converted from Python)
│   ├── shared/           # Common functionality
│   │   ├── database/     # Unified database connections
│   │   ├── auth/         # Authentication system
│   │   ├── middleware/   # Express middleware
│   │   └── utils/        # Common utilities
│   ├── routes/           # API route definitions
│   └── app.js           # Main Express application
├── public/               # Static web assets for each module
└── data/                # SQLite database files
```

## Development Commands

### Primary Commands
```bash
# Start development server
npm run dev

# Start production server  
npm start

# Quick setup and start
./start.sh

# Install dependencies
npm install

# Run linting
npm run lint
```

### Database Commands
The system automatically:
- Creates SQLite database with proper schema
- Tests MySQL connection
- Initializes default admin user

### Server Information
- **Default Port**: 3007
- **Main Dashboard**: http://localhost:3007
- **API Base**: http://localhost:3007/api
- **Health Check**: http://localhost:3007/api/health

## Module Details

### 1. Quote Management (`/quotes/`)
**Location**: `src/modules/quotes/`
**Migrated from**: Cotizador project
**Database**: SQLite
**Features**: 
- Client management
- Quote creation and PDF generation
- Invoice tracking
- Email notifications

### 2. User Activity Logs (`/logs/`)
**Location**: `src/modules/logs/`  
**Migrated from**: User Log Analyzer project
**Database**: MySQL (`users_logs` table)
**Features**:
- Activity monitoring
- Log filtering and search
- User behavior analytics
- Audit trail functionality

### 3. Catalog Management (`/catalog/`)
**Location**: `src/modules/catalog/`
**Converted from**: Python FastAPI (AI Catalog Automation)
**Database**: MySQL (PIM) + Oracle (ERP)
**Features**:
- ERP vs PIM product comparison
- Category-based analysis
- New/obsolete product identification
- Stock threshold management

### 4. Sales Analytics (`/sales/`)
**Location**: `src/modules/sales/`
**Converted from**: Python FastAPI (Sales Dashboard)
**Database**: MySQL/Oracle (sales tables: WEB_ORDENES, WEB_FACTURAS, WEB_ARTICULOS)
**Features**:
- Revenue and order metrics
- Store performance comparison
- Daily/hourly sales trends
- Top product analysis

## Key API Endpoints

### Authentication (`/api/auth/`)
- `POST /login` - User authentication
- `POST /register` - User registration  
- `GET /profile` - User profile
- `PUT /password` - Change password

### Module APIs
- **Quotes**: `/api/quotes/*` - Quote and client management
- **Logs**: `/api/logs/*` - User activity monitoring
- **Catalog**: `/api/catalog/*` - Product catalog operations  
- **Sales**: `/api/sales/*` - Sales analytics and reporting

## Database Configuration

### Connection Setup
Configure in `.env` file:
```env
# MySQL (Products, Logs, Sales)
MYSQL_HOST=localhost
MYSQL_USER=your_user
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=your_database

# JWT Authentication
JWT_SECRET=your_secret_key

# Email (for notifications)
EMAIL_HOST=smtp.gmail.com
EMAIL_USER=your_email
EMAIL_PASSWORD=your_password
```

### Database Schema
- **SQLite**: Auto-created with users, clients, quotes tables
- **MySQL**: Requires existing tables for products, logs, sales data  
- **Oracle**: **✅ FULLY IMPLEMENTED** - ERP connection with INTRANET schema tables
  - `INTRANET.WEB_ORDENES` - 13,451+ ERP orders
  - `INTRANET.WEB_FACTURAS` - 15,028+ invoices
  - `INTRANET.WEB_ARTICULOS` - 42,111+ order line items
  - Connection: TNS format with SID, Oracle client libraries included

## Authentication System

### JWT Implementation
- Access tokens (1 hour expiration)
- Refresh tokens (7 days expiration) 
- Session management in database
- Role-based authorization (admin, manager, user)

### Default Credentials
- **Username**: admin
- **Password**: admin123 (change immediately)
- **Role**: admin

### Security Features
- Account lockout after failed attempts
- Rate limiting on auth endpoints
- Security headers (Helmet.js)
- Password strength requirements

## Frontend Architecture

### Main Dashboard
- **File**: `public/dashboard/index.html`
- **Framework**: Alpine.js for reactivity
- **Styling**: TailwindCSS
- **Features**: Module navigation, stats overview, quick actions

### Module UIs
Each module has its own UI in `public/{module}/index.html`:
- Responsive design
- Module-specific functionality
- Consistent navigation back to main dashboard

## Development Guidelines

### Code Style
- Use existing patterns from migrated code
- Follow Node.js/Express conventions
- Maintain consistent error handling
- Use async/await for database operations

### Database Operations
- Use unified database configuration (`src/shared/database/`)
- Implement proper connection pooling
- Handle errors gracefully
- Include performance monitoring

### API Design
- RESTful endpoints
- Consistent response format:
  ```json
  {
    "success": true/false,
    "message": "Description",
    "data": {...}
  }
  ```
- Proper HTTP status codes
- Authentication on protected routes

## Common Tasks

### Adding New Features
1. Identify target module (`quotes`, `logs`, `catalog`, `sales`)
2. Add service logic in `src/modules/{module}/{module}Service.js`
3. Add controller endpoint in `src/modules/{module}/{module}Controller.js`
4. Add route in `src/routes/{module}Routes.js`
5. Update frontend if needed

### Database Changes
1. Update schema in `src/shared/database/index.js` for SQLite
2. Handle MySQL/Oracle schema externally
3. Test connections with `npm start`

### Debugging
1. Check application logs in console
2. Verify database connections: `/api/health`
3. Test individual modules: `/api/{module}/health`
4. Review environment configuration

## Migration Notes

### From Original Projects
- **Cotizador**: Routes and services copied, adapted for unified auth
- **User Log Analyzer**: Database service converted, UI preserved
- **AI Catalog Automation**: Converted from Python to Node.js, models translated
- **Sales Dashboard**: Python FastAPI converted to Express, maintaining same data structures

### Key Conversions
- Python Pydantic models → JavaScript classes
- SQLAlchemy → mysql2/sqlite3
- FastAPI endpoints → Express routes
- Python async → Node.js async/await

## Troubleshooting

### Common Issues
1. **Database connection errors**: Check `.env` configuration
2. **Port already in use**: Change PORT in `.env` or kill existing process
3. **Authentication failures**: Verify JWT_SECRET in `.env`
4. **Module not loading**: Check file paths and imports

### Health Checks
- **System**: `GET /api/health`
- **Individual modules**: `GET /api/{module}/health`
- **Database status**: Included in health responses

### Performance Monitoring
- Connection pooling stats available
- Query performance tracking
- Error rate monitoring
- Built-in logging for debugging

This integrated system successfully combines all previous functionality into a single, powerful dashboard while maintaining the original features and improving the overall user experience.