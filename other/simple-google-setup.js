const fs = require('fs');
const { google } = require('googleapis');

async function setupGoogle() {
  console.log('🔧 Setting up Google Drive authentication...\n');
  
  // Check if credentials.json exists
  if (!fs.existsSync('./credentials.json')) {
    console.error('❌ credentials.json file not found!');
    console.log('\nPlease:');
    console.log('1. Go to https://console.cloud.google.com/');
    console.log('2. Go to APIs & Services → Credentials');
    console.log('3. Download your OAuth 2.0 Client ID as credentials.json');
    console.log('4. Put it in your project folder');
    return;
  }

  try {
    // Load credentials
    const credentials = JSON.parse(fs.readFileSync('./credentials.json', 'utf8'));
    console.log('✅ credentials.json loaded successfully');
    
    // Check the structure
    const config = credentials.web || credentials.installed;
    if (!config) {
      console.error('❌ Invalid credentials.json format');
      console.log('Make sure you downloaded the OAuth 2.0 Client ID file');
      return;
    }
    
    console.log('✅ Credentials format looks good');
    
    // Set up OAuth2 client
    const { client_secret, client_id, redirect_uris } = config;
    const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    
    // Check if we already have tokens
    if (fs.existsSync('./token.json')) {
      console.log('✅ Found existing authentication token');
      const token = JSON.parse(fs.readFileSync('./token.json', 'utf8'));
      auth.setCredentials(token);
      
      // Test the connection
      const drive = google.drive({ version: 'v3', auth });
      await drive.files.list({ pageSize: 1 });
      console.log('✅ Google Drive connection working!');
      return;
    }
    
    // Generate auth URL
    const authUrl = auth.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/documents'
      ],
    });
    
    console.log('\n📋 Please complete these steps:');
    console.log('1. Open this URL in your browser:');
    console.log(authUrl);
    console.log('\n2. Complete the authorization');
    console.log('3. Copy the authorization code from the browser');
    console.log('4. Run: node finish-google-setup.js YOUR_CODE_HERE');
    console.log('\nExample: node finish-google-setup.js 4/0AbUR2VOL8cX9YzJ3kF2mN1pQ7R8S');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
  }
}

setupGoogle();