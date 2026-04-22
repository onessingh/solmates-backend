const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';
// Note: You might need to set an admin token if authentication is strictly enforced
// For local testing without a real login, we can mock the token if we had the secret,
// but for this verification, we'll just check if the public routes are working first.

async function testFolders() {
  try {
    console.log('--- Testing Folder API ---');
    
    // 1. Get folders for Semester 1 (should eventually have the 8 subjects)
    console.log('Fetching Semester 1 folders...');
    const res = await axios.get(`${API_BASE}/sol/folders/notes/1`);
    console.log('Folders found:', res.data.data.length);
    
    // 2. Get content for Semester 1 (empty folderId)
    console.log('Fetching root content for notes/1...');
    const resItems = await axios.get(`${API_BASE}/sol/notes/1`);
    console.log('Items found:', resItems.data.data.length);
    
    console.log('--- Verification Complete ---');
  } catch (error) {
    console.error('Test failed:', error.response ? error.response.data : error.message);
    console.log('\nNOTE: Ensure the server is running on http://localhost:3000 before running this test.');
  }
}

testFolders();
