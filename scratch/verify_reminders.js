
const { parseStartTime } = require('../src/utils/time-utils');

// Mock data
const mockClasses = [
    { title: "MBA Sem II: Marketing (15:00 - 17:00)", reminder30MinSent: false, reminder10MinSent: false }, // Should trigger 30m
    { title: "MBA Sem II: Finance (14:30 - 16:30)", reminder30MinSent: true, reminder10MinSent: false }, // Should trigger 10m
    { title: "Late Class (14:15)", reminder30MinSent: false, reminder10MinSent: false } // Should trigger 10m (since 10m has priority)
];

const nowMinutes = 14 * 60 + 10; // 14:10 IST

console.log('--- REMINDER LOGIC VERIFICATION (Now: 14:10) ---');

mockClasses.forEach(item => {
    const startTimeMinutes = parseStartTime(item.title);
    const diff = startTimeMinutes - nowMinutes;
    console.log(`\nTesting: ${item.title}`);
    console.log(`Diff: ${diff}m`);

    if (diff >= 0 && diff <= 15 && !item.reminder10MinSent) {
        console.log('>>> [ACTION] TRIGGERING 10M FINAL WARNING');
    } 
    else if (diff > 15 && diff <= 45 && !item.reminder30MinSent) {
        console.log('>>> [ACTION] TRIGGERING 30M HEADS-UP');
    }
    else if (diff < 0 && diff >= -10 && !item.reminder10MinSent) {
        console.log('>>> [ACTION] TRIGGERING EMERGENCY START');
    } else {
        console.log('>>> [ACTION] NO TRIGGER (Already sent or outside window)');
    }
});
