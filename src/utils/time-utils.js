/**
 * SOLMATES Time Utilities (v85.1)
 * Centralized logic for IST/SOL curriculum timing.
 */

/**
 * Get current date/time localized to IST (UTC+5:30)
 */
function getISTNow() {
  const now = new Date();
  // India is +5:30
  return new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
}

/**
 * Format date for comparison (e.g. "2026-04-16" and "16 April 2026")
 */
function getISTDateString() {
  const ist = getISTNow();
  
  // Format 1: 2026-04-16 (ISO-like, common in automated DBs)
  const yyyy = ist.getUTCFullYear();
  const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(ist.getUTCDate()).padStart(2, '0');
  const iso = `${yyyy}-${mm}-${dd}`;

  // Format 2: 16 April 2026 (Long format, sometimes used in titles)
  const options = { day: 'numeric', month: 'long', year: 'numeric' };
  const longDate = ist.toLocaleDateString('en-GB', options);

  // Format 3: 16-04-2026 (Indian standard)
  const indian = `${dd}-${mm}-${yyyy}`;

  return { iso, longDate, indian };
}

/**
 * Extract start time (minutes from midnight) from a title string
 * e.g. "MBA Sem II: Financial Management (15:00 - 17:00)" -> 900
 */
function parseStartTime(str) {
  if (!str) return null;
  try {
    const s = str.toLowerCase().trim();
    
    // 0. High-precision extraction for "HH:MM AM/PM" or "HH AM/PM"
    const ampmMatch = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (ampmMatch) {
        let hours = parseInt(ampmMatch[1]);
        const minutes = parseInt(ampmMatch[2] || 0);
        const ampm = ampmMatch[3].toLowerCase();
        
        if (ampm === 'pm' && hours < 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;
        
        return hours * 60 + minutes;
    }

    // 1. Check for standard Solmates format in parentheses or with separators: "(19:00 - 21:00)"
    // v105.1: Added more robust start-of-time detection
    const solMatch = s.match(/(?:\(|\s|^|t)(\d{1,2}(?::\d{2})?)\s*(?:-|to|at)/i);
    if (solMatch) {
        let timePart = solMatch[1].trim();
        if (!timePart.includes(':')) timePart += ':00';
        const [hours, minutes] = timePart.split(':').map(n => parseInt(n) || 0);
        
        let finalHours = hours;
        // Check for trailing AM/PM in the whole string as fallback
        if (s.includes('pm') && finalHours < 12) finalHours += 12;
        if (s.includes('am') && finalHours === 12) finalHours = 0;
        
        return finalHours * 60 + minutes;
    }

    // 2. Check for standalone 24h format: "19:00" 
    // v105.1: If it's an ISO string like "2026-04-18T19:00:00", we should skip the date colons if any.
    // Actually, T usually separates date and time.
    const timeOnly = s.includes('t') ? s.split('t')[1] : s;
    const rawMatch = timeOnly.match(/(\d{1,2}):(\d{2})/);
    if (rawMatch) {
        let hours = parseInt(rawMatch[1]);
        const minutes = parseInt(rawMatch[2]);
        if (s.includes('pm') && hours < 12) hours += 12;
        if (s.includes('am') && hours === 12) hours = 0;
        return hours * 60 + minutes;
    }

    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Get current minutes from midnight in IST
 */
function getISTMinutesNow() {
  const ist = getISTNow();
  return (ist.getUTCHours() % 24) * 60 + ist.getUTCMinutes();
}

module.exports = {
  getISTNow,
  getISTDateString,
  parseStartTime,
  getISTMinutesNow
};
