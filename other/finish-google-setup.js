const fs = require('fs');
const { google } = require('googleapis');

async function finishSetup() {
  const authCode = process.argv[2];
  
  if (!authCode) {
    console.error('❌ Please provide the authorization code');
    console.log('Usage: node finish-google-setup.js YOUR_AUTH_CODE');
    return;
  }
  
  try {
    // Load credentials
    const credentials = JSON.parse(fs.readFileSync('./credentials.json', 'utf8'));
    const config = credentials.web || credentials.installed;
    const { client_secret, client_id, redirect_uris } = config;
    
    // Set up OAuth2 client
    const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    
    // Exchange code for tokens
    console.log('🔄 Exchanging authorization code for tokens...');
    const { tokens } = await auth.getToken(authCode);
    
    // Save tokens
    fs.writeFileSync('./token.json', JSON.stringify(tokens, null, 2));
    console.log('✅ Tokens saved to token.json');
    
    // Test the connection
    auth.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth });
    await drive.files.list({ pageSize: 1 });
    
    console.log('✅ Google Drive authentication complete!');
    console.log('✅ You can now run: node server.js');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.log('\nCommon issues:');
    console.log('- Code expired (codes expire quickly, try getting a new one)');
    console.log('- Wrong redirect URI in Google Cloud Console');
    console.log('- Invalid credentials.json file');
  }
}

finishSetup();