#!/bin/bash

# Integrated Dashboard Startup Script
# This script starts the unified Plaza Lama Dashboard

echo "🚀 Starting Plaza Lama Integrated Dashboard..."
echo "========================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "✅ Created .env file. Please configure your database connections."
        echo "📝 Edit the .env file with your database credentials before running again."
        exit 1
    else
        echo "❌ .env.example file not found."
        exit 1
    fi
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies."
        exit 1
    fi
fi

# Create data directory if it doesn't exist
if [ ! -d "data" ]; then
    mkdir -p data
    echo "📁 Created data directory for SQLite database."
fi

# Create logs directory if it doesn't exist
if [ ! -d "logs" ]; then
    mkdir -p logs
    echo "📁 Created logs directory."
fi

echo ""
echo "🏠 Dashboard will be available at: http://localhost:3000"
echo "📊 API Documentation: http://localhost:3000/api/docs"
echo "🏥 Health Check: http://localhost:3000/api/health"
echo ""
echo "📋 Available Modules:"
echo "  • Quote Management: http://localhost:3000/quotes/"
echo "  • User Activity Logs: http://localhost:3000/logs/"
echo "  • Catalog Management: http://localhost:3000/catalog/"
echo "  • Sales Analytics: http://localhost:3000/sales/"
echo ""
echo "🔗 API Endpoints:"
echo "  • Authentication: http://localhost:3000/api/auth/"
echo "  • Quotes API: http://localhost:3000/api/quotes/"
echo "  • Logs API: http://localhost:3000/api/logs/"
echo "  • Catalog API: http://localhost:3000/api/catalog/"
echo "  • Sales API: http://localhost:3000/api/sales/"
echo ""
echo "🚀 Starting server..."
echo "========================================"

# Start the server
npm start