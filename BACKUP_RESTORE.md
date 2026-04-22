# Backup & Restoration Guide

## Overview

SOLMATES automatically creates backups of the database every 6 hours to protect your data. This guide explains how to restore from these backups if needed.

## Automatic Backup System

### Backup Schedule
- **Frequency:** Every 6 hours
- **Location:** `/backend/data/` directory
- **Format:** `solmates-db.json.backup.TIMESTAMP`
- **Retention:** All backups are kept (manual cleanup required)

### Backup File Naming
```
solmates-db.json.backup.1708015200000
                        └─ Unix timestamp (milliseconds)
```

To convert timestamp to human-readable date:
```bash
# Linux/Mac
date -d @$((1708015200000/1000))

# Or use online converter: https://www.epochconverter.com/
```

## Viewing Available Backups

```bash
cd /path/to/backend/data/
ls -lh solmates-db.json.backup.*

# Show most recent 5 backups
ls -lt solmates-db.json.backup.* | head -5

# Show backups with human-readable dates (Linux)
for f in solmates-db.json.backup.*; do
    timestamp=$(echo $f | sed 's/.*backup\.//')
    date=$(date -d @$((timestamp/1000)) '+%Y-%m-%d %H:%M:%S')
    echo "$date - $f"
done
```

## Restoration Procedures

### Method 1: Standard Restoration (Recommended)

**Step 1:** Stop the server
```bash
# If using PM2
pm2 stop solmates-backend

# If using systemd
sudo systemctl stop solmates-backend

# If running directly
# Press Ctrl+C in terminal
```

**Step 2:** Backup current database (safety measure)
```bash
cd /path/to/backend/data/
cp solmates-db.json solmates-db.json.before-restore-$(date +%s)
```

**Step 3:** List available backups and choose one
```bash
ls -lt solmates-db.json.backup.* | head -10
```

**Step 4:** Restore from chosen backup
```bash
# Replace TIMESTAMP with the actual backup timestamp
cp solmates-db.json.backup.TIMESTAMP solmates-db.json

# Example:
# cp solmates-db.json.backup.1708015200000 solmates-db.json
```

**Step 5:** Verify the restored database
```bash
# Check file size
ls -lh solmates-db.json

# Validate JSON structure
node -e "console.log(Object.keys(require('./solmates-db.json')))"
# Should output: [ 'content', 'youtube_videos', 'admin_sessions', 'semester_links', 'failed_login_attempts' ]
```

**Step 6:** Restart the server
```bash
# If using PM2
pm2 start solmates-backend

# If using systemd
sudo systemctl start solmates-backend

# If running directly
npm start
```

**Step 7:** Verify restoration
```bash
# Test API health
curl http://localhost:3000/api/live

# Should return: {"alive":true,"timestamp":"..."}

# Check logs
pm2 logs solmates-backend
# or
journalctl -u solmates-backend -f
```

### Method 2: Quick Restoration (No Server Stop)

⚠️ **WARNING:** This method is risky and may cause data corruption. Only use if you cannot stop the server.

```bash
cd /path/to/backend/data/

# Create safety backup
cp solmates-db.json solmates-db.json.emergency-backup-$(date +%s)

# Restore
cp solmates-db.json.backup.TIMESTAMP solmates-db.json

# Server will automatically detect changes on next read
```

### Method 3: Emergency Restoration (Corrupted Database)

If the database is corrupted and server won't start:

**Step 1:** Navigate to data directory
```bash
cd /path/to/backend/data/
```

**Step 2:** Move corrupted database
```bash
mv solmates-db.json solmates-db.json.corrupted-$(date +%s)
```

**Step 3:** Restore from last known good backup
```bash
# Find most recent backup
LATEST_BACKUP=$(ls -t solmates-db.json.backup.* | head -1)
echo "Restoring from: $LATEST_BACKUP"

# Restore
cp "$LATEST_BACKUP" solmates-db.json
```

**Step 4:** Validate before starting
```bash
# Test JSON validity
node -e "require('./solmates-db.json')" && echo "✓ Valid JSON" || echo "✗ Invalid JSON"

# If invalid, try next most recent backup
NEXT_BACKUP=$(ls -t solmates-db.json.backup.* | head -2 | tail -1)
cp "$NEXT_BACKUP" solmates-db.json
```

**Step 5:** Start server
```bash
npm start
```

## Verification After Restoration

### 1. Check API Endpoints
```bash
# Health check
curl http://localhost:3000/api/live

# Get content (should return data)
curl http://localhost:3000/api/content/notes?semester=1

# Get YouTube videos
curl http://localhost:3000/api/youtube?semester=1
```

### 2. Verify Admin Access
```bash
# Try admin login (replace with your credentials)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"adminId":"your_admin_id","password":"your_password"}'

# Should return: {"success":true,"token":"..."}
```

### 3. Check Logs
```bash
# PM2
pm2 logs solmates-backend --lines 50

# Systemd
journalctl -u solmates-backend -n 50

# Direct logs
tail -f backend/logs/app.log
```

### 4. Test Frontend
1. Open frontend in browser
2. Verify content loads on database pages
3. Test admin login
4. Try adding/editing content
5. Verify changes persist

## Backup Best Practices

### Manual Backup Before Major Changes

```bash
cd /path/to/backend/data/

# Create manual backup with descriptive name
cp solmates-db.json "solmates-db.json.manual-$(date +%Y%m%d-%H%M%S)-before-major-update"
```

### Regular Backup Verification

Create a weekly cron job to verify backups:

```bash
# Add to crontab (crontab -e)
0 2 * * 0 /path/to/verify-backups.sh
```

Create `/path/to/verify-backups.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/path/to/backend/data"

cd "$BACKUP_DIR"

echo "=== Backup Verification $(date) ===" >> backup-verification.log

# Count backups
BACKUP_COUNT=$(ls solmates-db.json.backup.* 2>/dev/null | wc -l)
echo "Total backups: $BACKUP_COUNT" >> backup-verification.log

# Verify latest backup
LATEST=$(ls -t solmates-db.json.backup.* | head -1)
if [ -f "$LATEST" ]; then
    echo "Latest backup: $LATEST" >> backup-verification.log
    
    # Validate JSON
    if node -e "require('./$LATEST')" 2>/dev/null; then
        echo "✓ Latest backup is valid JSON" >> backup-verification.log
    else
        echo "✗ ERROR: Latest backup is invalid!" >> backup-verification.log
        # Send alert (email, SMS, etc.)
    fi
fi

echo "" >> backup-verification.log
```

### Cleanup Old Backups

Keep only last 30 days of backups:

```bash
cd /path/to/backend/data/

# Find and delete backups older than 30 days
find . -name "solmates-db.json.backup.*" -mtime +30 -delete

# Or keep specific number (e.g., last 100 backups)
ls -t solmates-db.json.backup.* | tail -n +101 | xargs rm -f
```

## Troubleshooting

### Issue: "Database file locked"
```bash
# Check for existing locks
ls -la /path/to/backend/data/*.lock

# Remove stale locks (only if server is stopped!)
rm /path/to/backend/data/solmates-db.json.lock
```

### Issue: "Permission denied"
```bash
# Fix permissions
cd /path/to/backend
sudo chown -R $USER:$USER data/
chmod 755 data/
chmod 644 data/solmates-db.json
chmod 644 data/solmates-db.json.backup.*
```

### Issue: "Invalid JSON after restore"
```bash
# Validate JSON
node -e "require('./data/solmates-db.json')"

# If error, try pretty-print to see issue
node -e "console.log(JSON.stringify(require('./data/solmates-db.json'), null, 2))" | head -50

# If completely broken, restore from older backup
```

### Issue: "Data loss after restore"
This means you restored from a backup that was older than you thought.

**Solution:**
1. Check backup timestamps carefully before restoring
2. If possible, merge missing data from `solmates-db.json.before-restore-*` file
3. Consider implementing more frequent backups (edit `database.js` backup interval)

## Advanced: Manual Data Recovery

If you need to recover specific data from a backup:

```bash
# Extract content from backup using jq
jq '.content.notes' data/solmates-db.json.backup.TIMESTAMP

# Compare with current database
jq '.content.notes' data/solmates-db.json

# Merge specific items (requires manual editing)
```

## Support

If you encounter issues during restoration:

1. **Check logs first:** `pm2 logs` or `journalctl -u solmates-backend`
2. **Verify file integrity:** Ensure JSON is valid
3. **Test in staging:** If possible, test restoration in non-production environment first
4. **Document the issue:** Keep notes on what went wrong for future reference

## Emergency Contacts

- **Developer:** [Your contact info]
- **System Admin:** [Admin contact]
- **Backup Location:** `/backend/data/`
- **Documentation:** See `README.md` and `DEPLOYMENT.md`

---

**Last Updated:** February 15, 2026  
**Version:** 1.0
