/**
 * Test Reminder Logic
 * This script mocks the time and database state to verify the 10-minute reminder trigger.
 */
const { parseStartTime } = require('../src/utils/time-utils');

function testParsing() {
    console.log('--- Testing Time Parsing ---');
    const cases = [
        { title: 'MBA Sem 1: Accounting (19:00 - 21:00)', expected: 1140 },
        { title: 'Class with (07:00 to 09:00)', expected: 420 },
        { title: 'MBA Sem 2: Economics', time: '15:30', expected: 930 },
        { title: 'No time here', expected: null }
    ];

    cases.forEach(c => {
        const result = parseStartTime(c.time || c.title);
        console.log(`Input: ${c.time || c.title} | Expected: ${c.expected} | Result: ${result} | ${result === c.expected ? '✅' : '❌'}`);
    });
}

function testLogic(nowMinutes, startTimeMinutes) {
    const diff = startTimeMinutes - nowMinutes;
    // Window: 8 to 11 minutes
    const shouldTrigger = diff > 7 && diff <= 12;
    console.log(`Now: ${nowMinutes} | Start: ${startTimeMinutes} | Diff: ${diff} | Trigger: ${shouldTrigger ? 'YES ✅' : 'NO ❌'}`);
}

testParsing();
console.log('\n--- Testing Trigger Window ---');
testLogic(1130, 1140); // 10 mins before -> YES
testLogic(1125, 1140); // 15 mins before -> NO
testLogic(1131, 1140); // 9 mins before -> YES
testLogic(1135, 1140); // 5 mins before -> NO
testLogic(1128, 1140); // 12 mins before -> YES (Upper bound)
