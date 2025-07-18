const GoogleDriveService = require('./google-drive-service');
const readline = require('readline');

// Simple script to set up Google authentication
async function setupGoogleAuth() {
  console.log('🔧 Setting up Google Drive authentication...\n');
  
  const driveService = new GoogleDriveService();
  
  try {
    // Try to initialize (this will fail if no auth)
    await driveService.initialize();
    console.log('✅ Google Drive is already set up and working!');
  } catch (error) {
    if (error.message.includes('Authorization required')) {
      console.log('📋 Please complete the authorization steps shown above.');
      console.log('After you get the authorization code, enter it below:\n');
      
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      rl.question('Enter authorization code: ', async (code) => {
        try {
          await driveService.setAuthorizationCode(code);
          console.log('\n✅ Google Drive setup complete!');
          console.log('You can now run your server: node server.js');
        } catch (authError) {
          console.error('\n❌ Authorization failed:', authError.message);
          console.log('Please try running this setup again.');
        }
        rl.close();
      });
    } else {
      console.error('❌ Setup failed:', error.message);
      console.log('\nMake sure you have:');
      console.log('1. credentials.json file in your project folder');
      console.log('2. Enabled Google Drive and Google Docs APIs');
    }
  }
}

// Run the setup
setupGoogleAuth();