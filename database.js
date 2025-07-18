const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create or open the database file
const db = new sqlite3.Database(path.join(__dirname, 'queries.db'));

// Initialize the database with our tables
function initializeDatabase() {
  // Table for storing scheduled queries
  db.run(`
    CREATE TABLE IF NOT EXISTS scheduled_queries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_text TEXT NOT NULL,
      schedule_cron TEXT NOT NULL,
      date_range_start TEXT,
      date_range_end TEXT,
      website_filters TEXT,
      google_folder_id TEXT,
      status TEXT DEFAULT 'active',
      parent_query_id INTEGER,
      is_followup BOOLEAN DEFAULT 0,
      followup_delay_days INTEGER DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_query_id) REFERENCES scheduled_queries (id)
    )
  `);

  // Table for storing query results
  db.run(`
    CREATE TABLE IF NOT EXISTS query_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_id INTEGER,
      execution_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      results TEXT,
      google_doc_id TEXT,
      follow_up_scheduled BOOLEAN DEFAULT 0,
      status TEXT DEFAULT 'completed',
      FOREIGN KEY (query_id) REFERENCES scheduled_queries (id)
    )
  `);

  // Add new columns to existing tables if they don't exist
  addMissingColumns();

  console.log('Database initialized successfully!');
}

// Function to add missing columns to existing tables
function addMissingColumns() {
  console.log('🔧 Checking and adding missing database columns...');
  
  // Check and add parent_query_id column
  db.run(`ALTER TABLE scheduled_queries ADD COLUMN parent_query_id INTEGER`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('Note: parent_query_id column may already exist');
    } else if (!err) {
      console.log('✅ Added parent_query_id column');
    }
  });

  // Check and add is_followup column
  db.run(`ALTER TABLE scheduled_queries ADD COLUMN is_followup BOOLEAN DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('Note: is_followup column may already exist');
    } else if (!err) {
      console.log('✅ Added is_followup column');
    }
  });

  // Check and add followup_delay_days column
  db.run(`ALTER TABLE scheduled_queries ADD COLUMN followup_delay_days INTEGER DEFAULT NULL`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('Note: followup_delay_days column may already exist');
    } else if (!err) {
      console.log('✅ Added followup_delay_days column');
    }
  });

  // Check and add auto_triggered column
  db.run(`ALTER TABLE scheduled_queries ADD COLUMN auto_triggered BOOLEAN DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('Note: auto_triggered column may already exist');
    } else if (!err) {
      console.log('✅ Added auto_triggered column');
    }
  });

  // Update query_results table
  db.run(`ALTER TABLE query_results ADD COLUMN follow_up_scheduled BOOLEAN DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('Note: follow_up_scheduled column may already exist');
    } else if (!err) {
      console.log('✅ Added follow_up_scheduled column');
    }
  });

  // Show current schema after updates
  setTimeout(() => {
    db.all(`PRAGMA table_info(scheduled_queries)`, (err, columns) => {
      if (!err) {
        console.log('📊 Current scheduled_queries columns:');
        columns.forEach(col => {
          console.log(`  - ${col.name} (${col.type})`);
        });
      }
    });
  }, 1000);
}

// Helper functions to interact with the database
const dbHelpers = {
  // Add a new scheduled query
  addScheduledQuery: (queryData) => {
    return new Promise((resolve, reject) => {
      const { query_text, schedule_cron, date_range_start, date_range_end, website_filters, google_folder_id } = queryData;
      
      db.run(
        `INSERT INTO scheduled_queries (query_text, schedule_cron, date_range_start, date_range_end, website_filters, google_folder_id) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [query_text, schedule_cron, date_range_start, date_range_end, website_filters, google_folder_id],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  },

  // Get all scheduled queries
  getAllScheduledQueries: () => {
    return new Promise((resolve, reject) => {
      db.all(`SELECT * FROM scheduled_queries WHERE status = 'active'`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  // Save query result
  saveQueryResult: (resultData) => {
    return new Promise((resolve, reject) => {
      const { query_id, results, google_doc_id, follow_up_schedule } = resultData;
      
      db.run(
        `INSERT INTO query_results (query_id, results, google_doc_id, follow_up_schedule) 
         VALUES (?, ?, ?, ?)`,
        [query_id, results, google_doc_id, follow_up_schedule],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  },

  // Get results for a specific query
  getQueryResults: (queryId) => {
    return new Promise((resolve, reject) => {
      console.log(`🔍 Looking for results for query ID: ${queryId}`);
      db.all(`SELECT * FROM query_results WHERE query_id = ? ORDER BY execution_timestamp DESC`, [queryId], (err, rows) => {
        if (err) {
          console.error(`❌ Database error getting results for query ${queryId}:`, err);
          reject(err);
        } else {
          console.log(`📊 Found ${rows.length} results for query ${queryId}`);
          if (rows.length > 0) {
            console.log(`📅 Latest result timestamp: ${rows[0].execution_timestamp}`);
          }
          resolve(rows);
        }
      });
    });
  },

  // Get statistics for dashboard
  getStatistics: () => {
    return new Promise((resolve, reject) => {
      const stats = {};
      
      // Get total scheduled queries
      db.get(`SELECT COUNT(*) as count FROM scheduled_queries WHERE status = 'active'`, (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        stats.scheduledQueries = row.count;
        
        // Get total documents created (results with google_doc_id)
        db.get(`SELECT COUNT(*) as count FROM query_results WHERE google_doc_id IS NOT NULL`, (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          stats.documentsCreated = row.count;
          
          // Get completed today
          const today = new Date().toISOString().split('T')[0];
          db.get(`SELECT COUNT(*) as count FROM query_results WHERE DATE(execution_timestamp) = ?`, [today], (err, row) => {
            if (err) {
              reject(err);
              return;
            }
            stats.completedToday = row.count;
            resolve(stats);
          });
        });
      });
    });
  },

  // Delete a scheduled query
  deleteScheduledQuery: (queryId) => {
    return new Promise((resolve, reject) => {
      db.run(`DELETE FROM scheduled_queries WHERE id = ?`, [queryId], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  },

  // Add a follow-up query
  addFollowupQuery: (parentQueryId, followupData) => {
    return new Promise(async (resolve, reject) => {
      const { query_text, date_range_start, date_range_end, website_filters } = followupData;
      
      console.log(`📝 Creating follow-up for parent query ${parentQueryId}`);
      console.log(`Follow-up text: ${query_text}`);
      
      try {
        // Get the parent query to copy its schedule
        const parentQuery = await dbHelpers.getQueryById(parentQueryId);
        if (!parentQuery) {
          reject(new Error('Parent query not found'));
          return;
        }
        
        // Parse parent's cron schedule and add 5 minutes
        const parentCronParts = parentQuery.schedule_cron.split(' ');
        const parentMinute = parseInt(parentCronParts[0]);
        const parentHour = parseInt(parentCronParts[1]);
        
        // Add 5 minutes to parent's schedule
        let followupMinute = parentMinute + 5;
        let followupHour = parentHour;
        
        // Handle minute overflow (e.g., 58 + 5 = 63 -> 3 minutes of next hour)
        if (followupMinute >= 60) {
          followupMinute = followupMinute - 60;
          followupHour = followupHour + 1;
          
          // Handle hour overflow (e.g., 23 + 1 = 24 -> 0 of next day)
          if (followupHour >= 24) {
            followupHour = 0;
          }
        }
        
        // Build the follow-up cron schedule
        const followupCron = `${followupMinute} ${followupHour} ${parentCronParts[2]} ${parentCronParts[3]} ${parentCronParts[4]}`;
        
        console.log(`⏰ Parent cron: ${parentQuery.schedule_cron}`);
        console.log(`⏰ Follow-up cron: ${followupCron} (5 minutes later)`);
        
        // Check if new columns exist
        db.all(`PRAGMA table_info(scheduled_queries)`, (err, columns) => {
          if (err) {
            reject(err);
            return;
          }
          
          const hasParentQueryId = columns.some(col => col.name === 'parent_query_id');
          const hasIsFollowup = columns.some(col => col.name === 'is_followup');
          
          let sql, params;
          
          if (hasParentQueryId && hasIsFollowup) {
            // Use new schema
            sql = `INSERT INTO scheduled_queries (query_text, schedule_cron, date_range_start, date_range_end, website_filters, parent_query_id, is_followup, followup_delay_days) 
                   VALUES (?, ?, ?, ?, ?, ?, 1, 5)`;
            params = [query_text, followupCron, date_range_start, date_range_end, website_filters, parentQueryId];
            console.log(`✅ Using new schema with parent_query_id: ${parentQueryId}`);
          } else {
            // Use old schema (fallback)
            sql = `INSERT INTO scheduled_queries (query_text, schedule_cron, date_range_start, date_range_end, website_filters) 
                   VALUES (?, ?, ?, ?, ?)`;
            params = [query_text, followupCron, date_range_start, date_range_end, website_filters];
            console.log(`⚠️  Using old schema - parent context will not work!`);
          }
          
          db.run(sql, params, function(err) {
            if (err) {
              console.error(`❌ Error creating follow-up:`, err);
              reject(err);
            } else {
              console.log(`✅ Follow-up created with ID: ${this.lastID}`);
              console.log(`⏰ Follow-up will run 5 minutes after parent query`);
              resolve(this.lastID);
            }
          });
        });
        
      } catch (error) {
        console.error(`❌ Error in addFollowupQuery:`, error);
        reject(error);
      }
    });
  },

  // Get follow-up queries for a parent query
  getFollowupQueries: (parentQueryId) => {
    return new Promise((resolve, reject) => {
      db.all(`SELECT * FROM scheduled_queries WHERE parent_query_id = ? AND is_followup = 1`, [parentQueryId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  // Mark follow-up as auto-triggered
  markFollowupAutoTriggered: (followupId) => {
    return new Promise((resolve, reject) => {
      db.run(`UPDATE scheduled_queries SET auto_triggered = 1 WHERE id = ?`, [followupId], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  },

  // Get untriggered follow-ups for a parent query
  getUntriggeredFollowups: (parentQueryId) => {
    return new Promise((resolve, reject) => {
      db.all(`SELECT * FROM scheduled_queries WHERE parent_query_id = ? AND is_followup = 1 AND auto_triggered = 0`, [parentQueryId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  // Get query by ID
  getQueryById: (queryId) => {
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM scheduled_queries WHERE id = ?`, [queryId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
};

module.exports = { db, initializeDatabase, dbHelpers };