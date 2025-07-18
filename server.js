const express = require('express');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config(); // Load environment variables
const { initializeDatabase, dbHelpers } = require('./database');
const PerplexityService = require('./perplexity-service');
const GoogleDriveService = require('./google-drive-service');

// Create the web server
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Perplexity service
const perplexityService = new PerplexityService(process.env.PERPLEXITY_API_KEY);

// Initialize Google Drive service
const googleDriveService = new GoogleDriveService();

// Middleware - think of these as helpful assistants
app.use(express.json()); // Helps understand JSON data
app.use(express.static('public')); // Serves our website files

// Initialize database when server starts
initializeDatabase();

// API Routes - these are like different phone numbers for different services

// Get all scheduled queries
app.get('/api/queries', async (req, res) => {
  try {
    const queries = await dbHelpers.getAllScheduledQueries();
    res.json(queries);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get queries' });
  }
});

// Get statistics
app.get('/api/statistics', async (req, res) => {
  try {
    const stats = await dbHelpers.getStatistics();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// Add a new scheduled query
app.post('/api/queries', async (req, res) => {
  try {
    const queryData = req.body;
    const queryId = await dbHelpers.addScheduledQuery(queryData);
    
    // Schedule the query to run automatically
    scheduleQuery(queryId, queryData);
    
    res.json({ success: true, queryId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add query' });
  }
});

// Get results for a specific query
app.get('/api/queries/:id/results', async (req, res) => {
  try {
    const queryId = req.params.id;
    const results = await dbHelpers.getQueryResults(queryId);
    
    // Parse the results JSON back to objects
    const parsedResults = results.map(result => ({
      ...result,
      results: JSON.parse(result.results)
    }));
    
    res.json(parsedResults);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get results' });
  }
});

// Manually trigger a query (for testing)
app.post('/api/queries/:id/execute', async (req, res) => {
  try {
    const queryId = req.params.id;
    
    // Get the query details
    const queries = await dbHelpers.getAllScheduledQueries();
    const query = queries.find(q => q.id == queryId);
    
    if (!query) {
      return res.status(404).json({ error: 'Query not found' });
    }
    
    // Execute the query
    const results = await executeQuery(query);
    
    // Save to Google Drive
    let googleDocInfo = null;
    try {
      googleDocInfo = await googleDriveService.createDocument(query, results);
    } catch (driveError) {
      console.error('Failed to save to Google Drive:', driveError.message);
    }
    
    // Save results to database
    await dbHelpers.saveQueryResult({
      query_id: queryId,
      results: JSON.stringify(results),
      google_doc_id: googleDocInfo?.documentId || null,
      follow_up_scheduled: false
    });
    
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute query' });
  }
});

// Delete a scheduled query
app.delete('/api/queries/:id', async (req, res) => {
  try {
    const queryId = req.params.id;
    
    // Delete the query from database
    const changes = await dbHelpers.deleteScheduledQuery(queryId);
    
    if (changes === 0) {
      return res.status(404).json({ error: 'Query not found' });
    }
    
    res.json({ success: true, message: 'Query deleted successfully' });
  } catch (error) {
    console.error('Error deleting query:', error);
    res.status(500).json({ error: 'Failed to delete query' });
  }
});

// Add a follow-up query
app.post('/api/queries/:id/followup', async (req, res) => {
  try {
    const parentQueryId = req.params.id;
    const followupData = req.body;
    
    console.log(`Adding follow-up for query ${parentQueryId}:`, followupData);
    
    // Validate parent query exists
    const parentQuery = await dbHelpers.getQueryById(parentQueryId);
    if (!parentQuery) {
      return res.status(404).json({ error: 'Parent query not found' });
    }
    
    // Add the follow-up query
    const followupId = await dbHelpers.addFollowupQuery(parentQueryId, followupData);
    console.log(`Follow-up query created with ID: ${followupId}`);
    
    // Get the newly created follow-up query and schedule it normally
    const followupQuery = await dbHelpers.getQueryById(followupId);
    if (followupQuery) {
      scheduleQuery(followupId, followupQuery);
      console.log(`Follow-up query ${followupId} scheduled successfully`);
    }
    
    res.json({ success: true, followupId, message: 'Follow-up query scheduled for 5 minutes from now' });
  } catch (error) {
    console.error('Error adding follow-up query:', error);
    res.status(500).json({ error: 'Failed to add follow-up query: ' + error.message });
  }
});

// Get follow-up queries for a query
app.get('/api/queries/:id/followups', async (req, res) => {
  try {
    const queryId = req.params.id;
    const followups = await dbHelpers.getFollowupQueries(queryId);
    res.json(followups);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get follow-up queries' });
  }
});

// Function to execute a query using Perplexity API - UPDATED VERSION
async function executeQuery(queryData) {
  console.log(`\n🚀 EXECUTEQUERY V2 - UPDATED VERSION`);
  console.log(`📋 Executing query: ${queryData.query_text}`);
  console.log(`🔍 QUERY DATA DEBUG:`, {
    id: queryData.id,
    parent_query_id: queryData.parent_query_id,
    is_followup: queryData.is_followup,
    query_text: queryData.query_text.substring(0, 50) + '...'
  });
  
  try {
    let parentContext = null;
    
    // If this is a follow-up query, get the parent's results for context
    if (queryData.parent_query_id) {
      console.log(`🔍 This is a follow-up query! Parent ID: ${queryData.parent_query_id}`);
      try {
        const parentResults = await dbHelpers.getQueryResults(queryData.parent_query_id);
        console.log(`📊 Found ${parentResults.length} parent results for query ${queryData.parent_query_id}`);
        
        if (parentResults.length > 0) {
          const parentData = JSON.parse(parentResults[0].results);
          parentContext = {
            query: parentData.query,
            content: parentData.content
          };
          
          console.log(`\n🎯 PARENT CONTEXT LOADED SUCCESSFULLY!`);
          console.log(`Parent Query: "${parentContext.query}"`);
          console.log(`Parent Content Length: ${parentContext.content.length} characters`);
          console.log(`Parent Content Preview: "${parentContext.content.substring(0, 200)}..."`);
          console.log(`🔄 Using parent context for follow-up query\n`);
        } else {
          console.log(`⚠️  No parent results found for parent_query_id: ${queryData.parent_query_id}`);
        }
      } catch (contextError) {
        console.error('❌ Failed to load parent context:', contextError);
      }
    } else {
      console.log(`📝 This is a regular query (no parent_query_id found)`);
    }
    
    // Use the Perplexity service to get real results with context
    console.log(`🌐 Calling Perplexity API with context: ${parentContext ? 'YES' : 'NO'}`);
    const results = await perplexityService.executeQuery(queryData, parentContext);
    
    console.log('✅ Query executed successfully');
    return results;
    
  } catch (error) {
    console.error('❌ Error executing query:', error);
    
    return {
      query: queryData.query_text,
      timestamp: new Date().toISOString(),
      error: error.message,
      content: 'Failed to execute query. Please check your API key and try again.',
      filters: {
        date_range: queryData.date_range_start && queryData.date_range_end ? 
          `${queryData.date_range_start} to ${queryData.date_range_end}` : '',
        websites: queryData.website_filters
      }
    };
  }
}

// Function to schedule a query to run automatically
function scheduleQuery(queryId, queryData) {
  try {
    console.log(`Scheduling query ${queryId} with cron: ${queryData.schedule_cron}`);
    console.log(`Query text: ${queryData.query_text}`);
    
    // Validate cron schedule
    if (!queryData.schedule_cron || queryData.schedule_cron.split(' ').length !== 5) {
      console.error(`Invalid cron schedule for query ${queryId}: ${queryData.schedule_cron}`);
      return;
    }
    
    cron.schedule(queryData.schedule_cron, async () => {
      console.log(`\n🚀 Running scheduled query ${queryId}: ${queryData.query_text}`);
      
      try {
        // Execute the main query
        const results = await executeQuery(queryData);
        
        // Save to Google Drive
        let googleDocInfo = null;
        try {
          googleDocInfo = await googleDriveService.createDocument(queryData, results);
          console.log(`Results saved to Google Doc: ${googleDocInfo.title}`);
        } catch (driveError) {
          console.error('Failed to save to Google Drive:', driveError.message);
        }
        
        // Save results to database
        await dbHelpers.saveQueryResult({
          query_id: queryId,
          results: JSON.stringify(results),
          google_doc_id: googleDocInfo?.documentId || null,
          follow_up_scheduled: false
        });
        
        console.log(`✅ Query ${queryId} completed successfully`);
        
        // Note: Follow-ups are now scheduled as regular cron jobs with +5 minute timing
        // No need for auto-trigger logic anymore
        
      } catch (error) {
        console.error(`❌ Error executing query ${queryId}:`, error);
      }
    });
    
    console.log(`✅ Query ${queryId} scheduled successfully`);
  } catch (error) {
    console.error(`❌ Error scheduling query ${queryId}:`, error);
  }
}

// Serve the main webpage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Your query scheduler is ready!');
  
  // Test Perplexity API connection
  console.log('Testing Perplexity API connection...');
  const connectionTest = await perplexityService.testConnection();
  if (connectionTest) {
    console.log('✅ Perplexity API connected successfully!');
  } else {
    console.log('❌ Perplexity API connection failed. Check your API key.');
  }
  
  // Test Google Drive connection
  console.log('Testing Google Drive connection...');
  try {
    const driveInitialized = await googleDriveService.initialize();
    if (driveInitialized) {
      await googleDriveService.testConnection();
    }
  } catch (error) {
    console.log('❌ Google Drive not set up yet. Run: node setup-google-auth.js');
  }
});

// Load existing scheduled queries when server starts
async function loadExistingQueries() {
  try {
    const queries = await dbHelpers.getAllScheduledQueries();
    console.log(`📋 Loading ${queries.length} existing scheduled queries:`);
    
    queries.forEach(query => {
      console.log(`  Query ${query.id}: "${query.query_text}" (Parent: ${query.parent_query_id}, Follow-up: ${query.is_followup})`);
      scheduleQuery(query.id, query);
    });
    
    console.log(`✅ Loaded ${queries.length} existing scheduled queries`);
  } catch (error) {
    console.error('Error loading existing queries:', error);
  }
}

// Load existing queries after a short delay
setTimeout(loadExistingQueries, 1000);