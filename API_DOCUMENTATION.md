# 📚 SOLMATES API DOCUMENTATION

Complete API reference for the SOLMATES backend.

**Base URL:** `http://localhost:3000/api` (development)  
**Base URL:** `https://your-domain.com/api` (production)

---

## 🔐 AUTHENTICATION

All admin endpoints require JWT authentication via the `Authorization` header:

```
Authorization: Bearer <your_jwt_token>
```

Get token via `/api/auth/login` endpoint.

---

## 📋 TABLE OF CONTENTS

1. [Authentication Endpoints](#authentication-endpoints)
2. [Public Content Endpoints](#public-content-endpoints)
3. [Admin Content Management](#admin-content-management)
4. [YouTube Management](#youtube-management)
5. [Session Management](#session-management)
6. [Health & Status](#health--status)
7. [Error Codes](#error-codes)
8. [Rate Limiting](#rate-limiting)

---

## 🔑 AUTHENTICATION ENDPOINTS

### POST /api/auth/login

Admin login endpoint.

**Rate Limit:** 3 requests per 15 minutes per IP

**Request:**
```json
{
  "adminId": "admin_prod_2026_x7k9",
  "password": "YourSecurePassword123!"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "2h"
}
```

**Response (Failure):**
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

**Status Codes:**
- `200` - Success
- `400` - Validation error
- `401` - Invalid credentials
- `429` - Too many attempts

---

### POST /api/auth/verify

Verify JWT token validity.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "valid": true,
  "adminId": "admin_prod_2026_x7k9",
  "sessionId": "sess_123456",
  "expiresAt": "2026-02-14T18:00:00.000Z"
}
```

---

### POST /api/auth/logout

Logout and invalidate session.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## 📚 PUBLIC CONTENT ENDPOINTS

### GET /api/content/:type

Get content by type (notes, pyq, oneshot, elearning, professor, classes).

**No authentication required.**

**Parameters:**
- `type` (path) - Content type
- `semester` (query, optional) - Filter by semester (1-4)
- `subject` (query, optional) - Filter by subject

**Example:**
```
GET /api/content/notes?semester=1
GET /api/content/professor?semester=2&subject=Marketing
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "content_123",
      "type": "notes",
      "title": "Financial Management Notes",
      "description": "Comprehensive notes covering...",
      "url": "https://drive.google.com/...",
      "subject": "Financial Management",
      "semester": "1",
      "thumbnail": "https://...",
      "created_at": "2026-02-14T10:00:00.000Z",
      "updated_at": "2026-02-14T10:00:00.000Z"
    }
  ],
  "count": 1
}
```

---

### GET /api/content/semester-links

Get semester folder links (for notes, pyq, oneshot pages).

**No authentication required.**

**Response:**
```json
{
  "success": true,
  "data": {
    "1": "https://drive.google.com/drive/folders/...",
    "2": "https://drive.google.com/drive/folders/...",
    "3": "https://drive.google.com/drive/folders/...",
    "4": "https://drive.google.com/drive/folders/..."
  }
}
```

---

## 🛠️ ADMIN CONTENT MANAGEMENT

**All endpoints require authentication.**

### POST /api/admin/content/:type

Add new content item.

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "title": "Financial Management Chapter 1",
  "description": "Introduction to Financial Management",
  "url": "https://drive.google.com/file/d/...",
  "subject": "Financial Management",
  "semester": "1",
  "thumbnail": "https://..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Content added successfully",
  "data": {
    "id": "content_123",
    "type": "notes",
    "title": "Financial Management Chapter 1",
    // ... rest of data
  }
}
```

**Status Codes:**
- `201` - Created
- `400` - Validation error
- `401` - Unauthorized
- `409` - Duplicate URL

---

### PUT /api/admin/content/:type/:id

Update existing content.

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "title": "Updated Title",
  "description": "Updated description"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Content updated successfully",
  "data": {
    // updated content object
  }
}
```

---

### DELETE /api/admin/content/:type/:id

Delete content item.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Content deleted successfully"
}
```

---

### PUT /api/admin/semester-links

Update semester folder links.

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "type": "notes",
  "semester": "1",
  "link": "https://drive.google.com/drive/folders/..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Semester link updated successfully"
}
```

---

## 📺 YOUTUBE MANAGEMENT

### GET /api/youtube/:semester

Get YouTube videos for specific semester.

**No authentication required.**

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "youtube_123",
      "title": "Introduction to Marketing",
      "url": "https://youtube.com/watch?v=...",
      "subject": "Marketing",
      "thumbnail": "https://img.youtube.com/vi/.../maxresdefault.jpg",
      "semester": "1",
      "created_at": "2026-02-14T10:00:00.000Z"
    }
  ]
}
```

---

### POST /api/admin/youtube

Add YouTube video.

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "title": "Marketing Basics",
  "url": "https://youtube.com/watch?v=abc123",
  "subject": "Marketing",
  "semester": "1"
}
```

**Response:**
```json
{
  "success": true,
  "message": "YouTube video added successfully",
  "data": {
    "id": "youtube_123",
    // ... video data
  }
}
```

---

### DELETE /api/admin/youtube/:id

Delete YouTube video.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "YouTube video deleted successfully"
}
```

---

## 👥 SESSION MANAGEMENT

### GET /api/admin/sessions

Get all active sessions (admin only).

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "sessions": [
    {
      "sessionId": "sess_123",
      "adminId": "admin_prod_2026_x7k9",
      "created": "2026-02-14T10:00:00.000Z",
      "lastAccess": "2026-02-14T11:30:00.000Z",
      "ipAddress": "192.168.1.xxx",
      "userAgent": "Mozilla/5.0..."
    }
  ]
}
```

---

### DELETE /api/admin/sessions/:sessionId

Revoke specific session.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Session revoked successfully"
}
```

---

## ❤️ HEALTH & STATUS

### GET /api/live

Basic liveness check.

**No authentication required.**

**Response:**
```json
{
  "status": "Server is running",
  "timestamp": "2026-02-14T12:00:00.000Z"
}
```

---

### GET /api/health

Detailed health check with metrics.

**No authentication required.**

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-14T12:00:00.000Z",
  "uptime": 86400,
  "memory": {
    "used": 120,
    "total": 256,
    "external": 5,
    "unit": "MB"
  },
  "environment": "production",
  "version": "1.0.0",
  "checks": {
    "database": "healthy",
    "api": "healthy"
  },
  "stats": {
    "sessions": 5,
    "notes": 24,
    "pyq": 18,
    "oneshot": 12,
    "elearning": 30,
    "professor": 45,
    "classes": 15,
    "youtube": 60
  }
}
```

**Status Codes:**
- `200` - Healthy
- `503` - Degraded (database issue)

---

## ❌ ERROR CODES

All error responses follow this format:

```json
{
  "success": false,
  "message": "Error description",
  "error": "ERROR_CODE" // optional
}
```

### Common Error Codes:

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `DUPLICATE_URL` | 409 | URL already exists |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
| `DATABASE_ERROR` | 500 | Database operation failed |

---

## ⏱️ RATE LIMITING

The API implements the following rate limits:

### General API
- **Limit:** 100 requests per 15 minutes per IP
- **Applies to:** All /api/* endpoints
- **Header:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### Authentication
- **Limit:** 3 requests per 15 minutes per IP
- **Applies to:** `/api/auth/login`
- **Reason:** Prevent brute force attacks

### Chatbot
- **Limit:** 10 requests per 1 minute per IP
- **Applies to:** `/api/chatbot`
- **Reason:** Prevent spam

### Rate Limit Response:

```json
{
  "success": false,
  "message": "Too many requests. Please try again later.",
  "retryAfter": 900
}
```

**Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1676380800
Retry-After: 900
```

---

## 🔧 CORS

CORS is configured to allow requests from whitelisted origins only.

**Allowed Methods:** GET, POST, PUT, DELETE, OPTIONS  
**Allowed Headers:** Content-Type, Authorization  
**Credentials:** true (cookies and auth headers allowed)  

**Production:** Only `FRONTEND_URL` from `.env` is allowed  
**Development:** `http://localhost:*` allowed

---

## 📊 REQUEST/RESPONSE EXAMPLES

### Full Flow: Add Note as Admin

#### Step 1: Login
```bash
curl -X POST https://api.solmates.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "adminId": "admin_prod_2026_x7k9",
    "password": "YourSecurePassword123!"
  }'
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "2h"
}
```

#### Step 2: Add Note
```bash
curl -X POST https://api.solmates.com/api/admin/content/notes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "title": "Financial Management Notes",
    "description": "Complete notes for FM",
    "url": "https://drive.google.com/file/d/abc123",
    "subject": "Financial Management",
    "semester": "1"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Content added successfully",
  "data": {
    "id": "content_1676380800123",
    "type": "notes",
    "title": "Financial Management Notes",
    "description": "Complete notes for FM",
    "url": "https://drive.google.com/file/d/abc123",
    "subject": "Financial Management",
    "semester": "1",
    "created_at": "2026-02-14T12:00:00.000Z",
    "updated_at": "2026-02-14T12:00:00.000Z",
    "created_by": "admin_prod_2026_x7k9"
  }
}
```

#### Step 3: Verify Note Appears for Users
```bash
curl https://api.solmates.com/api/content/notes?semester=1
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "content_1676380800123",
      "type": "notes",
      "title": "Financial Management Notes",
      "description": "Complete notes for FM",
      "url": "https://drive.google.com/file/d/abc123",
      "subject": "Financial Management",
      "semester": "1",
      "thumbnail": null,
      "created_at": "2026-02-14T12:00:00.000Z",
      "updated_at": "2026-02-14T12:00:00.000Z"
    }
  ],
  "count": 1
}
```

---

## 🔒 SECURITY HEADERS

All responses include security headers:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
Referrer-Policy: strict-origin-when-cross-origin
```

---

## 📝 CHANGELOG

### Version 1.0.0 (Current)
- Initial API release
- Authentication endpoints
- Content management
- YouTube management
- Session management
- Health checks

---

## 💡 TIPS & BEST PRACTICES

1. **Always use HTTPS in production**
2. **Store tokens securely** (HttpOnly cookies or secure storage)
3. **Implement token refresh** before expiry
4. **Handle rate limits** gracefully with exponential backoff
5. **Validate all inputs** on frontend before sending
6. **Use pagination** for large datasets (to be implemented)
7. **Cache public endpoints** with appropriate TTL
8. **Monitor API usage** to detect anomalies
9. **Implement request retries** with exponential backoff
10. **Log all errors** for debugging

---

## 📞 SUPPORT

For API issues or questions:
- Email: dev@solmates.com
- Documentation: https://docs.solmates.com
- GitHub: https://github.com/solmates/api

---

**API Version:** 1.0.0  
**Last Updated:** February 14, 2026
