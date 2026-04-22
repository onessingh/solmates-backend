const testAPI = async () => {
  console.log('--- Testing Career Test API ---');
  try {
    const res1 = await fetch('http://localhost:3000/api/career-test/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        desiredField: 'Software Engineering', 
        experienceLevel: 'beginner' // Fixed from 'entry-level'
      })
    });
    const data1 = await res1.json();
    console.log(data1.success ? `SUCCESS! Got ${data1.questions?.length || 0} questions.` : 'FAILED:', data1);
  } catch (e) { console.error(e.message); }

  console.log('\n--- Testing Interview Prep API ---');
  try {
    const res2 = await fetch('http://localhost:3000/api/ai-tools/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolType: 'interview-prep', role: 'Frontend Developer', level: 'Mid Level' })
    });
    const data2 = await res2.json();
    console.log(data2.success ? `SUCCESS! Got ${data2.data?.questions?.length || 0} questions.` : 'FAILED:', data2);
  } catch (e) { console.error(e.message); }

  console.log('\n--- Testing Aptitude Test API ---');
  try {
    const res3 = await fetch('http://localhost:3000/api/ai-tools/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolType: 'aptitude-test', difficulty: 'hard' })
    });
    const data3 = await res3.json();
    console.log(data3.success ? `SUCCESS! Got ${data3.data?.questions?.length || 0} questions.` : 'FAILED:', data3);
  } catch (e) { console.error(e.message); }

  console.log('\n--- Testing Skills (Skill Gap) API ---');
  try {
    const res4 = await fetch('http://localhost:3000/api/ai-tools/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolType: 'skill-gap', targetRole: 'Data Scientist', currentSkills: 'Python, SQL' })
    });
    const data4 = await res4.json();
    console.log(data4.success ? `SUCCESS! Readiness score: ${data4.data?.readinessScore}` : 'FAILED:', data4);
  } catch (e) { console.error(e.message); }
};

testAPI();
