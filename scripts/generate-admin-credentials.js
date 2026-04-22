#!/usr/bin/env node
/**
 * SOLMATES Admin Credential Generator
 * HIGH FIX #3: Enforces password validation at credential generation time
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const readline = require('readline');

function validatePassword(password) {
    const errors = [];
    
    if (password.length < 12) {
        errors.push('Password must be at least 12 characters');
    }
    
    if (password.length > 72) {
        errors.push('Password must not exceed 72 characters (bcrypt limit)');
    }
    
    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/\d/.test(password)) {
        errors.push('Password must contain at least one number');
    }
    
    if (!/[@$!%*?&#^()_\-+={}[\]|\\:;"'<>,.\/]/.test(password)) {
        errors.push('Password must contain at least one special character');
    }
    
    if (!/^[A-Za-z\d@$!%*?&#^()_\-+={}[\]|\\:;"'<>,.\/]+$/.test(password)) {
        errors.push('Password contains invalid characters');
    }
    
    return errors;
}

async function generateCredentials() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    const question = (prompt) => new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('   SOLMATES ADMIN CREDENTIAL GENERATOR');
    console.log('='.repeat(60) + '\n');
    
    // Generate Admin ID
    const adminId = await question('Enter Admin ID (or press Enter for random): ');
    const finalAdminId = adminId.trim() || `admin_${crypto.randomBytes(8).toString('hex')}`;
    
    console.log(`\n✓ Admin ID: ${finalAdminId}\n`);
    
    // Get password with validation
    let password;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
        password = await question('Enter Admin Password: ');
        
        const errors = validatePassword(password);
        if (errors.length === 0) {
            break;
        }
        
        attempts++;
        console.log('\n❌ Password validation failed:');
        errors.forEach(err => console.log(`   • ${err}`));
        
        if (attempts < maxAttempts) {
            console.log(`\nPlease try again. (${maxAttempts - attempts} attempts remaining)\n`);
        } else {
            console.log('\n❌ Maximum attempts reached. Please run the script again.\n');
            rl.close();
            process.exit(1);
        }
    }
    
    // Generate hash
    console.log('\n⏳ Generating secure hash (this may take a moment)...');
    const hash = await bcrypt.hash(password, 12);
    
    // Generate JWT secret
    const jwtSecret = crypto.randomBytes(64).toString('hex');
    
    // Output
    console.log('\n' + '='.repeat(60));
    console.log('   ✅ CREDENTIALS GENERATED SUCCESSFULLY!');
    console.log('='.repeat(60) + '\n');
    
    console.log('Add these to your .env file:\n');
    console.log('-'.repeat(60));
    console.log(`ADMIN_ID=${finalAdminId}`);
    console.log(`ADMIN_PASSWORD_HASH=${hash}`);
    console.log(`JWT_SECRET=${jwtSecret}`);
    console.log('-'.repeat(60));
    
    console.log('\n⚠️  IMPORTANT SECURITY REMINDERS:');
    console.log('   • Store these credentials securely');
    console.log('   • NEVER commit .env file to Git');
    console.log('   • Use different credentials for staging and production');
    console.log('   • Keep your password in a secure password manager\n');
    
    rl.close();
}

generateCredentials().catch((error) => {
    console.error('\n❌ Error generating credentials:', error.message);
    process.exit(1);
});
