#!/bin/bash

# SOLMATES Credentials Generator
# Run this script to generate production-ready credentials

echo "=================================================="
echo "   SOLMATES - Credentials Generator"
echo "=================================================="
echo ""

# Generate Admin ID
ADMIN_ID="admin_$(date +%s)"
echo "✅ Admin ID Generated:"
echo "   $ADMIN_ID"
echo ""

# Generate JWT Secret
echo "🔐 Generating JWT Secret..."
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))" 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "✅ JWT Secret Generated (copy this):"
    echo "   $JWT_SECRET"
else
    echo "❌ Error: Node.js not found. Please install Node.js first."
    exit 1
fi
echo ""

# Generate Password Hash
echo "🔒 Enter your desired admin password (min 12 characters):"
read -s ADMIN_PASSWORD
echo ""

if [ ${#ADMIN_PASSWORD} -lt 12 ]; then
    echo "❌ Error: Password must be at least 12 characters"
    exit 1
fi

echo "Generating password hash..."
# FIXED CRITICAL #2: Pass password via environment variable to prevent exposure in process list
PASSWORD_HASH=$(ADMIN_PASSWORD="$ADMIN_PASSWORD" node -e "const bcrypt = require('bcryptjs'); bcrypt.hash(process.env.ADMIN_PASSWORD, 12).then(h => console.log(h))" 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "✅ Password Hash Generated:"
    echo "   $PASSWORD_HASH"
else
    echo "❌ Error: bcryptjs not installed. Run 'npm install' first."
    exit 1
fi
echo ""

# Create .env file
echo "=================================================="
echo "   Creating .env file..."
echo "=================================================="

cat > .env << EOF
# Generated on $(date)

NODE_ENV=production
PORT=3000

# Admin Credentials
ADMIN_ID=$ADMIN_ID
ADMIN_PASSWORD_HASH=$PASSWORD_HASH
JWT_SECRET=$JWT_SECRET

# Session Configuration
SESSION_EXPIRY_HOURS=2
SESSION_IP_BINDING=false

# Frontend URL (UPDATE THIS!)
FRONTEND_URL=https://your-domain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
AUTH_RATE_LIMIT_MAX=3

# Logging
LOG_LEVEL=info
EOF

echo ""
echo "✅ .env file created successfully!"
echo ""
echo "=================================================="
echo "   IMPORTANT: Save these credentials!"
echo "=================================================="
echo ""
echo "Admin ID:       $ADMIN_ID"
echo "Admin Password: $ADMIN_PASSWORD"
echo ""
echo "⚠️  BEFORE DEPLOYING:"
echo "   1. Update FRONTEND_URL in .env with your actual domain"
echo "   2. Never commit .env to Git"
echo "   3. Store credentials securely"
echo ""
echo "✅ You can now run: npm start"
echo "=================================================="
