const fetch = require('node-fetch');

const tools = [
  { type: 'personality-test', payload: {} },
  { type: 'aptitude-test', payload: { difficulty: 'medium' } },
  { type: 'interest-inventory', payload: {} },
  { type: 'skill-gap', payload: { targetRole: 'Frontend Developer', currentSkills: 'HTML, CSS' } },
  { type: 'learning-path', payload: { goal: 'Node.js Mastery', level: 'Beginner', time: '5 hours/week' } },
  { type: 'certification-guide', payload: { field: 'Cloud Computing', level: 'Beginner' } },
  { type: 'skill-tracker', payload: { skill: 'JavaScript', proficiency: 30 } },
  { type: 'project-ideas', payload: { domain: 'Web Development', level: 'Intermediate' } },
  { type: 'salary-insights', payload: { role: 'Software Engineer', location: 'India' } },
  { type: 'job-market', payload: { role: 'Product Manager', location: 'Bangalore' } },
  { type: 'company-culture', payload: { values: 'Remote-first, Innovation', industry: 'Tech' } },
  { type: 'growth-opportunities', payload: { currentRole: 'QA Engineer' } },
  { type: 'interview-prep', payload: { role: 'Backend Developer', level: 'Junior' } },
  { type: 'study-planner', payload: { subject: 'SQL for Data Science', timeframe: '2 weeks', hours: '5' } }
];

const testAllTools = async () => {
  console.log('🚀 Starting Comprehensive Skills Tool Test...\n');
  
  for (const tool of tools) {
    process.stdout.write(`Testing [${tool.type}]... `);
    try {
      const response = await fetch('http://localhost:3000/api/ai-tools/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolType: tool.type, ...tool.payload })
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log('✅ SUCCESS');
      } else {
        console.log(`❌ FAILED: ${result.error}`);
        if (result.detail) console.error('   Detail:', result.detail);
      }
    } catch (err) {
      console.log(`💥 ERROR: ${err.message}`);
    }
  }
  
  console.log('\n🏁 All tests completed.');
};

testAllTools();
