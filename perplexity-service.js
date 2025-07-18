const axios = require('axios');

// Perplexity API service
class PerplexityService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.perplexity.ai/chat/completions';
  }

  // Main function to execute a query
  async executeQuery(queryData, parentContext = null) {
    try {
      console.log(`Executing query: ${queryData.query_text}`);
      
      // Build the search query with filters
      const searchQuery = this.buildSearchQuery(queryData);
      
      // Build messages array with context if this is a follow-up
      const messages = this.buildMessagesWithContext(searchQuery, parentContext);
      
      // Make the API call to Perplexity
      const response = await axios.post(this.baseURL, {
        model: 'sonar-pro',
        messages: messages,
        max_tokens: 1000,
        temperature: 0.2,
        top_p: 0.9,
        search_domain_filter: this.getSearchDomains(queryData.website_filters),
        search_recency_filter: this.getRecencyFilter(queryData.date_range_start, queryData.date_range_end)
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      // Process the response
      const result = this.processResponse(response.data, queryData, parentContext);
      
      console.log('Query executed successfully');
      return result;
      
    } catch (error) {
      console.error('Error executing Perplexity query:', error.response?.data || error.message);
      throw new Error(`Perplexity API error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Build the search query with filters and context
  buildSearchQuery(queryData) {
    let query = queryData.query_text;
    
    // Add date range context if provided
    if (queryData.date_range_start || queryData.date_range_end) {
      const dateContext = this.formatDateRange(queryData.date_range_start, queryData.date_range_end);
      query += ` ${dateContext}`;
    }
    
    // Add website filters if provided
    if (queryData.website_filters) {
      query += ` ${queryData.website_filters}`;
    }
    
    return query;
  }

  // Format date range for the query
  formatDateRange(startDate, endDate) {
    if (startDate && endDate) {
      return `from ${startDate} to ${endDate}`;
    } else if (startDate) {
      return `since ${startDate}`;
    } else if (endDate) {
      return `until ${endDate}`;
    }
    return '';
  }

  // Extract search domains from website filters
  getSearchDomains(websiteFilters) {
    if (!websiteFilters) return [];
    
    // Extract domains from filters like "site:example.com OR site:another.com"
    const domainRegex = /site:([^\s]+)/g;
    const domains = [];
    let match;
    
    while ((match = domainRegex.exec(websiteFilters)) !== null) {
      domains.push(match[1]);
    }
    
    return domains;
  }

  // Get recency filter based on date range
  getRecencyFilter(startDate, endDate) {
    if (!startDate && !endDate) return 'month';
    
    const now = new Date();
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : now;
    
    const daysDiff = Math.ceil((end - (start || now)) / (1000 * 60 * 60 * 24));
    
    if (daysDiff <= 1) return 'day';
    if (daysDiff <= 7) return 'week';
    if (daysDiff <= 30) return 'month';
    return 'year';
  }

  // Build messages array with optional parent context for follow-ups
  buildMessagesWithContext(searchQuery, parentContext) {
    const messages = [
      {
        role: 'system',
        content: `You are a senior equity research analyst at a top-tier investment bank. Your task is to produce institutional-quality research reports for sophisticated investors including pension funds, hedge funds, and asset managers.

REPORT STRUCTURE REQUIREMENTS:
- Use ACTIONABLE HEADLINES that investors can act on immediately
- Provide QUANTITATIVE METRICS wherever possible (revenue, margins, growth rates, multiples)
- Include RISK FACTORS and potential downside scenarios
- End with ACTIONABLE NEXT STEPS for investors

WRITING STYLE:
- Direct, concise, and clear tone
- Use institutional finance terminology
- Include specific numbers, dates, and percentages
- Structure with clear headers using markdown (## for main sections, ### for subsections)
- Use bullet points for key metrics and action items
- Bold important figures and conclusions

ANALYSIS DEPTH:
- Provide forward-looking analysis, not just current state
- Include competitive positioning and market dynamics
- Analyze both quantitative and qualitative factors
- Consider macroeconomic impact where relevant
- Reference recent developments and their implications

Format your response as a professional equity research report suitable for institutional distribution.`
      }
    ];
    
    // If this is a follow-up query, include the parent context
    if (parentContext) {
      console.log(`\n🔗 BUILDING CONVERSATIONAL CONTEXT:`);
      console.log(`Previous Query: "${parentContext.query}"`);
      console.log(`Previous Content Length: ${parentContext.content.length} characters`);
      console.log(`Follow-up Query: "${searchQuery}"`);
      
      messages.push({
        role: 'user',
        content: `Previous analysis: "${parentContext.query}"`
      });
      
      messages.push({
        role: 'assistant',
        content: parentContext.content
      });
      
      messages.push({
        role: 'user',
        content: `Based on the previous equity research analysis above, provide a follow-up institutional research report addressing: ${searchQuery}

Ensure this follow-up analysis:
- References and builds upon the previous analysis
- Provides new insights or updates to the original investment thesis
- Includes any changes to price targets or recommendations
- Maintains the same professional institutional research format`
      });
      
      console.log(`📝 Message structure: ${messages.length} messages`);
      console.log(`Final user message: "${messages[messages.length - 1].content}"`);
    } else {
      console.log(`📝 No parent context - building regular equity research query`);
      // Regular query without context
      messages.push({
        role: 'user',
        content: `Conduct an institutional-quality equity research analysis on: ${searchQuery}

Provide a comprehensive research report with:
- Clear investment recommendation and price target
- Detailed financial analysis and projections
- Risk assessment and scenario analysis
- Actionable investment conclusions
- Professional formatting suitable for institutional investors`
      });
    }
    
    return messages;
  }

  // Process the API response with context information
  processResponse(responseData, queryData, parentContext = null) {
    const choice = responseData.choices[0];
    const content = choice.message.content;
    
    return {
      query: queryData.query_text,
      timestamp: new Date().toISOString(),
      model: responseData.model,
      content: content,
      usage: responseData.usage,
      filters: {
        date_range: this.formatDateRange(queryData.date_range_start, queryData.date_range_end),
        websites: queryData.website_filters
      },
      metadata: {
        execution_time: new Date().toISOString(),
        query_id: queryData.id,
        schedule: queryData.schedule_cron,
        is_followup: !!parentContext,
        parent_query: parentContext?.query || null
      }
    };
  }

  // Extract citations from the response
  extractCitations(responseData) {
    const citations = responseData.citations || [];
    return citations.map(citation => ({
      title: citation.title,
      url: citation.url,
      snippet: citation.snippet
    }));
  }

  // Format results for Google Docs
  formatForGoogleDocs(results) {
    const date = new Date(results.timestamp).toLocaleDateString();
    const time = new Date(results.timestamp).toLocaleTimeString();
    
    let formatted = `# Search Results: ${results.query}\n\n`;
    formatted += `**Date:** ${date} at ${time}\n`;
    formatted += `**Model:** ${results.model}\n\n`;
    
    if (results.filters.date_range) {
      formatted += `**Date Range:** ${results.filters.date_range}\n`;
    }
    
    if (results.filters.websites) {
      formatted += `**Website Filters:** ${results.filters.websites}\n`;
    }
    
    formatted += `\n## Results\n\n${results.content}\n\n`;
    
    return formatted;
  }

  // Test the API connection
  async testConnection() {
    try {
      const testQuery = {
        query_text: 'Hello, this is a test query',
        date_range_start: null,
        date_range_end: null,
        website_filters: null
      };
      
      const result = await this.executeQuery(testQuery);
      console.log('Perplexity API connection successful!');
      return true;
    } catch (error) {
      console.error('Perplexity API connection failed:', error.message);
      return false;
    }
  }
}

module.exports = PerplexityService;