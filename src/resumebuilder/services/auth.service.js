"use strict";

const crypto = require("crypto");

const users = new Map();
const sessions = new Map();

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const SECRET = process.env.SOLMATES_AUTH_SECRET || "";

const nowIso = () => new Date().toISOString();

const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
};

const verifyPassword = (password, stored) => {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const verify = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(verify));
};

const signToken = (payload) => {
  if (!SECRET) throw new Error("auth secret not configured");
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
};

const verifyToken = (token) => {
  if (!token || !SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (payload.exp && Date.now() > payload.exp) return null;
  return payload;
};

const register = ({ full_name, email, password, provider = "local" } = {}) => {
  if (!full_name || !email || !password) {
    throw new Error("full_name, email, and password are required");
  }
  if (!validateEmail(email)) throw new Error("invalid email");
  if (users.has(email)) {
    throw new Error("email already registered");
  }
  const user = {
    id: crypto.randomUUID(),
    full_name,
    email,
    password_hash: hashPassword(password),
    provider,
    is_premium: false,
    created_at: nowIso(),
    updated_at: nowIso()
  };
  users.set(email, user);
  return { ...user, password_hash: undefined };
};

const login = ({ email, password } = {}) => {
  if (!email || !password) {
    throw new Error("email and password are required");
  }
  const user = users.get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new Error("invalid credentials");
  }
  const session = {
    id: crypto.randomUUID(),
    user_id: user.id,
    created_at: nowIso(),
    expires_at: Date.now() + TOKEN_TTL_MS
  };
  sessions.set(session.id, session);
  const token = signToken({ sub: user.id, sid: session.id, exp: session.expires_at });
  return { token, user: { ...user, password_hash: undefined } };
};

const getProfile = (userId) => {
  const user = Array.from(users.values()).find((u) => u.id === userId);
  if (!user) throw new Error("user not found");
  return { ...user, password_hash: undefined };
};

const updateProfile = (userId, payload = {}) => {
  const user = Array.from(users.values()).find((u) => u.id === userId);
  if (!user) throw new Error("user not found");
  if (payload.full_name) user.full_name = payload.full_name;
  if (typeof payload.is_premium === "boolean") user.is_premium = payload.is_premium;
  user.updated_at = nowIso();
  users.set(user.email, user);
  return { ...user, password_hash: undefined };
};

const logout = (sessionId) => {
  if (!sessionId) return true;
  sessions.delete(sessionId);
  return true;
};

const decodeToken = (token) => verifyToken(token);

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  logout,
  decodeToken
};
