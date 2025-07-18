const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class GoogleDriveService {
  constructor() {
    this.auth = null;
    this.drive = null;
    this.docs = null;
    this.mainFolderId = null;
  }

  // Initialize the Google APIs
  async initialize() {
    try {
      // Load credentials
      const credentialsPath = path.join(__dirname, 'credentials.json');
      const credentials = JSON.parse(await fs.readFile(credentialsPath, 'utf8'));
      
      // Set up OAuth2 client
      const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;
      this.auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

      // Check if we have saved tokens
      const tokenPath = path.join(__dirname, 'token.json');
      try {
        const token = JSON.parse(await fs.readFile(tokenPath, 'utf8'));
        this.auth.setCredentials(token);
        console.log('Google Drive: Using saved authentication');
      } catch (error) {
        // No saved token, need to authorize
        console.log('Google Drive: No saved token found, authorization required');
        await this.authorize();
      }

      // Initialize APIs
      this.drive = google.drive({ version: 'v3', auth: this.auth });
      this.docs = google.docs({ version: 'v1', auth: this.auth });

      // Create main folder
      await this.createMainFolder();
      
      console.log('✅ Google Drive service initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Google Drive initialization failed:', error.message);
      return false;
    }
  }

  // Authorize the application
  async authorize() {
    const authUrl = this.auth.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/documents'
      ],
    });

    console.log('\n📋 Google Drive Authorization Required:');
    console.log('1. Open this URL in your browser:');
    console.log(authUrl);
    console.log('\n2. Complete the authorization');
    console.log('3. Copy the authorization code');
    console.log('4. Restart your server and it will prompt for the code\n');

    // In a real app, you'd implement a way to get the code
    // For now, we'll throw an error with instructions
    throw new Error('Authorization required. Please follow the steps above.');
  }

  // Set authorization code (called manually during setup)
  async setAuthorizationCode(code) {
    try {
      const { tokens } = await this.auth.getToken(code);
      this.auth.setCredentials(tokens);

      // Save tokens for future use
      const tokenPath = path.join(__dirname, 'token.json');
      await fs.writeFile(tokenPath, JSON.stringify(tokens));
      
      console.log('✅ Authorization successful! Tokens saved.');
      return true;
    } catch (error) {
      console.error('❌ Authorization failed:', error.message);
      return false;
    }
  }

  // Create main folder for query results
  async createMainFolder() {
    try {
      // Check if folder already exists
      const response = await this.drive.files.list({
        q: "name='Query Scheduler Results' and mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields: 'files(id, name)',
      });

      if (response.data.files.length > 0) {
        this.mainFolderId = response.data.files[0].id;
        console.log('Google Drive: Using existing main folder');
      } else {
        // Create new folder
        const folderResponse = await this.drive.files.create({
          requestBody: {
            name: 'Query Scheduler Results',
            mimeType: 'application/vnd.google-apps.folder',
          },
        });
        
        this.mainFolderId = folderResponse.data.id;
        console.log('Google Drive: Created main folder');
      }
    } catch (error) {
      console.error('Error creating main folder:', error);
      throw error;
    }
  }

  // Create a Google Doc with query results
  async createDocument(queryData, results) {
    try {
      console.log(`Creating Google Doc for query: ${queryData.query_text}`);
      
      // Generate document title
      const timestamp = new Date().toISOString().split('T')[0];
      const title = `${queryData.query_text} - ${timestamp}`;
      
      // Create the document
      const docResponse = await this.docs.documents.create({
        requestBody: {
          title: title,
        },
      });
      
      const documentId = docResponse.data.documentId;
      
      // Format content with rich formatting
      const formattingRequests = this.createFormattingRequests(queryData, results);
      
      // Add content to the document with formatting
      await this.docs.documents.batchUpdate({
        documentId: documentId,
        requestBody: {
          requests: formattingRequests,
        },
      });

      // Move document to our folder
      await this.drive.files.update({
        fileId: documentId,
        addParents: this.mainFolderId,
        fields: 'id, parents',
      });

      console.log(`✅ Google Doc created: ${title}`);
      
      return {
        documentId: documentId,
        title: title,
        url: `https://docs.google.com/document/d/${documentId}/edit`
      };
      
    } catch (error) {
      console.error('Error creating Google Doc:', error);
      throw error;
    }
  }

  // Create formatting requests for Google Docs with rich text
  createFormattingRequests(queryData, results) {
    const date = new Date(results.timestamp).toLocaleDateString();
    const time = new Date(results.timestamp).toLocaleTimeString();
    
    const requests = [];
    let currentIndex = 1;
    
    // Add title
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text: `${results.query}\n\n`,
      },
    });
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: currentIndex,
          endIndex: currentIndex + results.query.length,
        },
        textStyle: {
          bold: true,
          fontSize: { magnitude: 16, unit: 'PT' }
        },
        fields: 'bold,fontSize',
      },
    });
    currentIndex += results.query.length + 2;
    
    // Add metadata (not bold)
    const metadataText = `Executed: ${date} at ${time}\nModel: ${results.model || 'N/A'}\n`;
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text: metadataText,
      },
    });
    currentIndex += metadataText.length;
    
    if (results.filters?.date_range) {
      const dateRangeText = `Date Range: ${results.filters.date_range}\n`;
      requests.push({
        insertText: {
          location: { index: currentIndex },
          text: dateRangeText,
        },
      });
      currentIndex += dateRangeText.length;
    }
    
    if (results.filters?.websites) {
      const websiteText = `Website Filters: ${results.filters.websites}\n`;
      requests.push({
        insertText: {
          location: { index: currentIndex },
          text: websiteText,
        },
      });
      currentIndex += websiteText.length;
    }
    
    // Add separator
    const separatorText = '\n--- RESULTS ---\n\n';
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text: separatorText,
      },
    });
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: currentIndex + 1,
          endIndex: currentIndex + 15, // "--- RESULTS ---"
        },
        textStyle: {
          bold: true,
          fontSize: { magnitude: 14, unit: 'PT' }
        },
        fields: 'bold,fontSize',
      },
    });
    currentIndex += separatorText.length;
    
    // Process the content and clean up markdown
    const cleanedContent = this.cleanMarkdownForGoogleDocs(results.content);
    this.addFormattedContentToDoc(cleanedContent, requests, currentIndex);
    
    return requests;
  }
  
  // Clean markdown and prepare for Google Docs formatting
  cleanMarkdownForGoogleDocs(content) {
    // Pre-process the content to identify formatting sections
    const sections = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      if (trimmedLine === '') {
        sections.push({ type: 'empty', text: '' });
      } else if (trimmedLine.startsWith('### ')) {
        sections.push({ type: 'h3', text: trimmedLine.substring(4).trim() });
      } else if (trimmedLine.startsWith('## ')) {
        sections.push({ type: 'h2', text: trimmedLine.substring(3).trim() });
      } else if (trimmedLine.startsWith('# ')) {
        sections.push({ type: 'h1', text: trimmedLine.substring(2).trim() });
      } else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('• ')) {
        // Handle bullet points - remove the bullet marker
        let bulletText = trimmedLine.substring(2).trim();
        sections.push({ 
          type: 'bullet', 
          text: bulletText, 
          hasFormatting: bulletText.includes('**') || bulletText.includes('__') 
        });
      } else if (/^\d+\.\s/.test(trimmedLine)) {
        // Handle numbered lists
        sections.push({ type: 'number', text: trimmedLine });
      } else if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
        // Handle table rows - treat as regular text for now
        sections.push({ 
          type: 'text', 
          text: trimmedLine, 
          hasFormatting: false 
        });
      } else if (trimmedLine.startsWith('---') || trimmedLine.startsWith('===')) {
        // Skip separator lines
        continue;
      } else {
        // Regular text paragraphs
        sections.push({ 
          type: 'text', 
          text: trimmedLine, 
          hasFormatting: trimmedLine.includes('**') || trimmedLine.includes('__') 
        });
      }
    }
    
    return sections;
  }
  
  // Add formatted content to Google Docs
  addFormattedContentToDoc(sections, requests, startIndex) {
    let currentIndex = startIndex;
    
    for (const section of sections) {
      switch (section.type) {
        case 'empty':
          // Single line break for empty lines
          requests.push({
            insertText: {
              location: { index: currentIndex },
              text: '\n',
            },
          });
          currentIndex += 1;
          break;
          
        case 'h1':
          // Major headers with single line break after
          const h1Text = section.text + '\n';
          requests.push({
            insertText: {
              location: { index: currentIndex },
              text: h1Text,
            },
          });
          requests.push({
            updateTextStyle: {
              range: {
                startIndex: currentIndex,
                endIndex: currentIndex + section.text.length,
              },
              textStyle: {
                bold: true,
                fontSize: { magnitude: 16, unit: 'PT' }
              },
              fields: 'bold,fontSize',
            },
          });
          currentIndex += h1Text.length;
          break;
          
        case 'h2':
          // Section headers with single line break after
          const h2Text = section.text + '\n';
          requests.push({
            insertText: {
              location: { index: currentIndex },
              text: h2Text,
            },
          });
          requests.push({
            updateTextStyle: {
              range: {
                startIndex: currentIndex,
                endIndex: currentIndex + section.text.length,
              },
              textStyle: {
                bold: true,
                fontSize: { magnitude: 14, unit: 'PT' }
              },
              fields: 'bold,fontSize',
            },
          });
          currentIndex += h2Text.length;
          break;
          
        case 'h3':
          // Sub-headers with single line break after
          const h3Text = section.text + '\n';
          requests.push({
            insertText: {
              location: { index: currentIndex },
              text: h3Text,
            },
          });
          requests.push({
            updateTextStyle: {
              range: {
                startIndex: currentIndex,
                endIndex: currentIndex + section.text.length,
              },
              textStyle: {
                bold: true,
                fontSize: { magnitude: 12, unit: 'PT' }
              },
              fields: 'bold,fontSize',
            },
          });
          currentIndex += h3Text.length;
          break;
          
        case 'bullet':
          // Indented paragraphs with single line break
          const bulletText = '    ' + section.text + '\n';
          if (section.hasFormatting) {
            currentIndex = this.addTextWithInlineFormatting(bulletText, requests, currentIndex);
          } else {
            requests.push({
              insertText: {
                location: { index: currentIndex },
                text: bulletText,
              },
            });
            currentIndex += bulletText.length;
          }
          break;
          
        case 'number':
          // Numbered items with single line break
          const numberText = section.text + '\n';
          requests.push({
            insertText: {
              location: { index: currentIndex },
              text: numberText,
            },
          });
          currentIndex += numberText.length;
          break;
          
        case 'text':
          // Regular paragraphs with single line break
          const textWithBreak = section.text + '\n';
          if (section.hasFormatting) {
            currentIndex = this.addTextWithInlineFormatting(textWithBreak, requests, currentIndex);
          } else {
            requests.push({
              insertText: {
                location: { index: currentIndex },
                text: textWithBreak,
              },
            });
            currentIndex += textWithBreak.length;
          }
          break;
      }
    }
  }
  
  // Add text with inline bold formatting (** and __)
  addTextWithInlineFormatting(text, requests, startIndex) {
    let currentIndex = startIndex;
    
    // Split text by bold markers, keeping the markers
    const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__)/g);
    
    for (const part of parts) {
      if (!part) continue;
      
      if ((part.startsWith('**') && part.endsWith('**')) || 
          (part.startsWith('__') && part.endsWith('__'))) {
        // This is bold text - remove the markers and make it bold
        const boldText = part.substring(2, part.length - 2);
        
        if (boldText.length > 0) {
          requests.push({
            insertText: {
              location: { index: currentIndex },
              text: boldText,
            },
          });
          requests.push({
            updateTextStyle: {
              range: {
                startIndex: currentIndex,
                endIndex: currentIndex + boldText.length,
              },
              textStyle: { bold: true },
              fields: 'bold',
            },
          });
          currentIndex += boldText.length;
        }
      } else {
        // Regular text - clean up any remaining asterisks
        let cleanText = part;
        // Remove single asterisks that might be leftover
        cleanText = cleanText.replace(/\*+/g, '');
        
        if (cleanText.length > 0) {
          requests.push({
            insertText: {
              location: { index: currentIndex },
              text: cleanText,
            },
          });
          currentIndex += cleanText.length;
        }
      }
    }
    
    return currentIndex;
  }

  // Create a subfolder for a specific query (optional)
  async createQueryFolder(queryText) {
    try {
      const folderName = queryText.substring(0, 50) + (queryText.length > 50 ? '...' : '');
      
      const response = await this.drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [this.mainFolderId],
        },
      });
      
      return response.data.id;
    } catch (error) {
      console.error('Error creating query folder:', error);
      throw error;
    }
  }

  // List recent documents
  async listRecentDocuments(limit = 10) {
    try {
      const response = await this.drive.files.list({
        q: `'${this.mainFolderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
        orderBy: 'modifiedTime desc',
        pageSize: limit,
        fields: 'files(id, name, modifiedTime, webViewLink)',
      });
      
      return response.data.files;
    } catch (error) {
      console.error('Error listing documents:', error);
      throw error;
    }
  }

  // Test the Google Drive connection
  async testConnection() {
    try {
      const response = await this.drive.files.list({
        pageSize: 1,
        fields: 'files(id, name)',
      });
      
      console.log('✅ Google Drive connection test successful');
      return true;
    } catch (error) {
      console.error('❌ Google Drive connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = GoogleDriveService;