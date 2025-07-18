// This file makes the website interactive

// Wait for the page to load completely
document.addEventListener('DOMContentLoaded', function() {
    // Get references to important elements
    const addQueryBtn = document.getElementById('addQueryBtn');
    const addQueryModal = document.getElementById('addQueryModal');
    const closeModal = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelBtn');
    const addQueryForm = document.getElementById('addQueryForm');
    const scheduleType = document.getElementById('scheduleType');
    const customSchedule = document.getElementById('customSchedule');
    const queriesList = document.getElementById('queriesList');
    const loadingIndicator = document.getElementById('loadingIndicator');
    
    // Follow-up modal elements
    const followupModal = document.getElementById('followupModal');
    const closeFollowupModal = document.getElementById('closeFollowupModal');
    const cancelFollowupBtn = document.getElementById('cancelFollowupBtn');
    const followupForm = document.getElementById('followupForm');
    
    let currentQueryId = null; // Track which query we're adding follow-up to

    // Load existing queries when page loads
    loadQueries();
    updateStats();

    // Show the modal when "Add New Query" button is clicked
    addQueryBtn.addEventListener('click', function() {
        addQueryModal.classList.remove('hidden');
    });

    // Hide the modal when X or Cancel is clicked
    closeModal.addEventListener('click', hideModal);
    cancelBtn.addEventListener('click', hideModal);

    // Hide modal when clicking outside of it
    addQueryModal.addEventListener('click', function(e) {
        if (e.target === addQueryModal) {
            hideModal();
        }
    });

    // Show custom schedule input when "Custom Schedule" is selected
    scheduleType.addEventListener('change', function() {
        if (this.value === 'custom') {
            customSchedule.classList.remove('hidden');
        } else {
            customSchedule.classList.add('hidden');
        }
    });

    // Handle form submission
    addQueryForm.addEventListener('submit', function(e) {
        e.preventDefault();
        addNewQuery();
    });

    // Follow-up modal event listeners
    closeFollowupModal.addEventListener('click', hideFollowupModal);
    cancelFollowupBtn.addEventListener('click', hideFollowupModal);
    
    followupModal.addEventListener('click', function(e) {
        if (e.target === followupModal) {
            hideFollowupModal();
        }
    });
    
    followupForm.addEventListener('submit', function(e) {
        e.preventDefault();
        addFollowupQuery();
    });

    // Function to hide the modal
    function hideModal() {
        addQueryModal.classList.add('hidden');
        addQueryForm.reset();
        customSchedule.classList.add('hidden');
    }

    // Function to hide follow-up modal
    function hideFollowupModal() {
        followupModal.classList.add('hidden');
        followupForm.reset();
        currentQueryId = null;
    }

    // Function to show loading indicator
    function showLoading() {
        loadingIndicator.classList.remove('hidden');
    }

    // Function to hide loading indicator
    function hideLoading() {
        loadingIndicator.classList.add('hidden');
    }

    // Function to load all queries from the server
    async function loadQueries() {
        try {
            showLoading();
            const response = await fetch('/api/queries');
            const queries = await response.json();
            
            displayQueries(queries);
            hideLoading();
        } catch (error) {
            console.error('Error loading queries:', error);
            hideLoading();
            showError('Failed to load queries');
        }
    }

    // Function to display queries in the list
    function displayQueries(queries) {
        queriesList.innerHTML = '';
        
        if (queries.length === 0) {
            queriesList.innerHTML = `
                <div class="p-6 text-center text-gray-500">
                    <i class="fas fa-search text-4xl mb-4"></i>
                    <p>No queries scheduled yet.</p>
                    <p class="text-sm">Click "Add New Query" to get started!</p>
                </div>
            `;
            return;
        }

        queries.forEach(query => {
            const queryElement = createQueryElement(query);
            queriesList.appendChild(queryElement);
        });
    }

    // Function to create a single query element
    function createQueryElement(query) {
        const div = document.createElement('div');
        div.className = 'p-6 hover:bg-gray-50';
        
        const scheduleText = getScheduleText(query.schedule_cron);
        const dateRange = getDateRangeText(query.date_range_start, query.date_range_end);
        
        div.innerHTML = `
            <div class="flex items-start justify-between">
                <div class="flex-1">
                    <div class="flex items-center mb-2">
                        <h3 class="text-lg font-medium text-gray-900">${query.query_text}</h3>
                        ${query.is_followup ? `<span class="ml-2 px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">Follow-up</span>` : ''}
                    </div>
                    <div class="flex items-center space-x-4 text-sm text-gray-500">
                        <span><i class="fas fa-clock mr-1"></i>${scheduleText}</span>
                        ${dateRange ? `<span><i class="fas fa-calendar mr-1"></i>${dateRange}</span>` : ''}
                        ${query.website_filters ? `<span><i class="fas fa-filter mr-1"></i>Filtered</span>` : ''}
                        ${query.parent_query_id ? `<span><i class="fas fa-link mr-1"></i>Parent: ${query.parent_query_id}</span>` : ''}
                    </div>
                </div>
                <div class="flex items-center space-x-2">
                    <button onclick="executeQuery(${query.id})" class="text-green-600 hover:text-green-800 px-3 py-1 rounded">
                        <i class="fas fa-play mr-1"></i>Run Now
                    </button>
                    <button onclick="viewResults(${query.id})" class="text-blue-600 hover:text-blue-800 px-3 py-1 rounded">
                        <i class="fas fa-eye mr-1"></i>View Results
                    </button>
                    <button onclick="scheduleFollowup(${query.id})" class="text-purple-600 hover:text-purple-800 px-3 py-1 rounded">
                        <i class="fas fa-plus-circle mr-1"></i>Follow-up
                    </button>
                    <button onclick="deleteQuery(${query.id})" class="text-red-600 hover:text-red-800 px-3 py-1 rounded">
                        <i class="fas fa-trash mr-1"></i>Delete
                    </button>
                </div>
            </div>
        `;
        
        return div;
    }

    // Function to convert cron schedule to human-readable text
    function getScheduleText(cron) {
        const scheduleMap = {
            '0 9 * * *': 'Daily at 9:00 AM',
            '0 9 * * 1': 'Weekly on Monday at 9:00 AM',
            '0 9 * * 1-5': 'Weekdays at 9:00 AM'
        };
        
        return scheduleMap[cron] || `Custom: ${cron}`;
    }

    // Function to format date range text
    function getDateRangeText(start, end) {
        if (!start && !end) return '';
        if (start && end) return `${start} to ${end}`;
        if (start) return `From ${start}`;
        if (end) return `Until ${end}`;
        return '';
    }

    // Function to add a new query
    async function addNewQuery() {
        try {
            showLoading();
            
            // Get form data
            const queryText = document.getElementById('queryText').value;
            const scheduleTypeValue = document.getElementById('scheduleType').value;
            const cronSchedule = document.getElementById('cronSchedule').value;
            const dateStart = document.getElementById('dateStart').value;
            const dateEnd = document.getElementById('dateEnd').value;
            const websiteFilters = document.getElementById('websiteFilters').value;
            
            // Determine the actual cron schedule
            let actualCron;
            if (scheduleTypeValue === 'daily') {
                actualCron = '0 9 * * *';
            } else if (scheduleTypeValue === 'weekly') {
                actualCron = '0 9 * * 1';
            } else {
                actualCron = cronSchedule;
            }
            
            // Create the query object
            const queryData = {
                query_text: queryText,
                schedule_cron: actualCron,
                date_range_start: dateStart || null,
                date_range_end: dateEnd || null,
                website_filters: websiteFilters || null,
                google_folder_id: null // We'll implement this later
            };
            
            // Send to server
            const response = await fetch('/api/queries', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(queryData)
            });
            
            if (response.ok) {
                hideModal();
                loadQueries(); // Reload the queries list
                updateStats(); // Update statistics
                showSuccess('Query added successfully!');
            } else {
                throw new Error('Failed to add query');
            }
            
            hideLoading();
        } catch (error) {
            console.error('Error adding query:', error);
            hideLoading();
            showError('Failed to add query');
        }
    }

    // Function to update statistics - FIXED VERSION
    async function updateStats() {
        try {
            const response = await fetch('/api/statistics');
            if (response.ok) {
                const stats = await response.json();
                document.getElementById('scheduledCount').textContent = stats.scheduledQueries || 0;
                document.getElementById('completedCount').textContent = stats.completedToday || 0;
                document.getElementById('documentsCount').textContent = stats.documentsCreated || 0;
            } else {
                // Fallback to basic count if statistics endpoint doesn't exist
                const queriesResponse = await fetch('/api/queries');
                const queries = await queriesResponse.json();
                document.getElementById('scheduledCount').textContent = queries.length;
                document.getElementById('completedCount').textContent = '0';
                document.getElementById('documentsCount').textContent = '0';
            }
        } catch (error) {
            console.error('Error updating stats:', error);
            // Set to 0 if there's an error
            document.getElementById('scheduledCount').textContent = '0';
            document.getElementById('completedCount').textContent = '0';
            document.getElementById('documentsCount').textContent = '0';
        }
    }

    // Function to convert markdown to HTML
    function markdownToHtml(text) {
        return text
            // Headers
            .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
            .replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold mt-6 mb-3">$1</h2>')
            .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mt-6 mb-4">$1</h1>')
            
            // Bold text
            .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
            .replace(/__(.*?)__/g, '<strong class="font-semibold">$1</strong>')
            
            // Italic text
            .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
            .replace(/_(.*?)_/g, '<em class="italic">$1</em>')
            
            // Code blocks
            .replace(/```([\s\S]*?)```/g, '<pre class="bg-gray-100 p-3 rounded mt-2 mb-2 overflow-x-auto"><code>$1</code></pre>')
            .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 rounded text-sm">$1</code>')
            
            // Convert bullet points (both * and -)
            .replace(/^[\*\-] (.+$)/gm, '<li class="ml-4">$1</li>')
            
            // Convert numbered lists
            .replace(/^\d+\. (.+$)/gm, '<li class="ml-4">$1</li>')
            
            // Line breaks
            .replace(/\n\n/g, '</p><p class="mb-3">')
            .replace(/\n/g, '<br>');
    }

    // Function to wrap lists properly
    function wrapLists(html) {
        // Wrap consecutive <li> elements in <ul>
        return html.replace(/(<li[^>]*>.*?<\/li>(?:\s*<li[^>]*>.*?<\/li>)*)/gs, '<ul class="list-disc ml-6 mb-3 space-y-1">$1</ul>');
    }

    // Function to format content for display
    function formatContent(content) {
        if (!content) return '';
        
        let html = markdownToHtml(content);
        html = wrapLists(html);
        
        // Wrap in paragraphs if not already wrapped
        if (!html.includes('<p>') && !html.includes('<h') && !html.includes('<ul>')) {
            html = `<p class="mb-3">${html}</p>`;
        } else if (!html.startsWith('<')) {
            html = `<p class="mb-3">${html}`;
        }
        
        return html;
    }

    // Function to show success message
    function showSuccess(message) {
        showNotification(message, 'success');
    }

    // Function to show error message
    function showError(message) {
        showNotification(message, 'error');
    }

    // Function to show notification
    function showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 px-4 py-2 rounded-lg text-white z-50 ${
            type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check' : 'exclamation-triangle'} mr-2"></i>
            ${message}
        `;
        
        document.body.appendChild(notification);
        
        // Remove notification after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // Make these functions available globally for the HTML buttons
    window.executeQuery = async function(queryId) {
        try {
            showLoading();
            const response = await fetch(`/api/queries/${queryId}/execute`, {
                method: 'POST'
            });
            
            if (response.ok) {
                showSuccess('Query executed successfully!');
                updateStats(); // Update stats after execution
                setTimeout(() => {
                    viewResults(queryId);
                }, 1000);
            } else {
                throw new Error('Failed to execute query');
            }
            hideLoading();
        } catch (error) {
            hideLoading();
            showError('Failed to execute query');
        }
    };

    window.viewResults = async function(queryId) {
        try {
            showLoading();
            const response = await fetch(`/api/queries/${queryId}/results`);
            const results = await response.json();
            
            if (results.length === 0) {
                showError('No results found for this query');
                hideLoading();
                return;
            }
            
            // Show results in a modal
            showResultsModal(results);
            hideLoading();
        } catch (error) {
            hideLoading();
            showError('Failed to load results');
        }
    };

    window.deleteQuery = async function(queryId) {
        if (confirm('Are you sure you want to delete this query? This action cannot be undone.')) {
            try {
                showLoading();
                const response = await fetch(`/api/queries/${queryId}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    showSuccess('Query deleted successfully!');
                    loadQueries(); // Reload the queries list
                    updateStats(); // Update statistics
                } else {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to delete query');
                }
                hideLoading();
            } catch (error) {
                hideLoading();
                showError('Failed to delete query: ' + error.message);
                console.error('Delete error:', error);
            }
        }
    };

    window.scheduleFollowup = function(queryId) {
        currentQueryId = queryId;
        followupModal.classList.remove('hidden');
    };

    // Function to add follow-up query
    async function addFollowupQuery() {
        try {
            showLoading();
            
            const followupData = {
                query_text: document.getElementById('followupQueryText').value,
                date_range_start: document.getElementById('followupDateStart').value || null,
                date_range_end: document.getElementById('followupDateEnd').value || null,
                website_filters: document.getElementById('followupWebsiteFilters').value || null
            };
            
            const response = await fetch(`/api/queries/${currentQueryId}/followup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(followupData)
            });
            
            if (response.ok) {
                hideFollowupModal();
                loadQueries();
                updateStats();
                showSuccess('Follow-up scheduled! It will run 5 minutes after the main query and read its actual output.');
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to schedule follow-up');
            }
            
            hideLoading();
        } catch (error) {
            hideLoading();
            showError('Failed to schedule follow-up: ' + error.message);
            console.error('Follow-up error:', error);
        }
    }

    // Function to show results modal
    function showResultsModal(results) {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 z-50 flex items-center justify-center p-4';
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
        
        const latestResult = results[0];
        const resultData = latestResult.results;
        
        modal.innerHTML = `
            <div class="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <h3 class="text-lg font-semibold text-gray-900">Query Results</h3>
                    <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-gray-600">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="p-6">
                    <div class="mb-4">
                        <h4 class="font-medium text-gray-900 mb-2">Query:</h4>
                        <p class="text-gray-700">${resultData.query}</p>
                        ${resultData.metadata?.is_followup ? `
                            <div class="mt-2 p-2 bg-purple-50 border border-purple-200 rounded">
                                <p class="text-sm text-purple-800">
                                    <i class="fas fa-link mr-1"></i>
                                    This is a conversational follow-up with context from: "${resultData.metadata.parent_query}"
                                </p>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="mb-4">
                        <h4 class="font-medium text-gray-900 mb-2">Executed:</h4>
                        <p class="text-gray-700">${new Date(resultData.timestamp).toLocaleString()}</p>
                    </div>
                    
                    ${resultData.error ? `
                        <div class="mb-4 p-4 bg-red-50 border border-red-200 rounded">
                            <h4 class="font-medium text-red-900 mb-2">Error:</h4>
                            <p class="text-red-700">${resultData.error}</p>
                        </div>
                    ` : ''}
                    
                    <div class="mb-4">
                        <h4 class="font-medium text-gray-900 mb-2">Results:</h4>
                        <div class="bg-gray-50 p-4 rounded border prose max-w-none">
                            ${formatContent(resultData.content)}
                        </div>
                    </div>
                    
                    ${latestResult.google_doc_id ? `
                        <div class="mb-4 p-4 bg-green-50 border border-green-200 rounded">
                            <h4 class="font-medium text-green-900 mb-2">Google Doc Created:</h4>
                            <a href="https://docs.google.com/document/d/${latestResult.google_doc_id}/edit" 
                               target="_blank" 
                               class="text-green-700 hover:text-green-900 flex items-center">
                                <i class="fas fa-external-link-alt mr-2"></i>
                                Open in Google Docs
                            </a>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
});