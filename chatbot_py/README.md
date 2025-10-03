# Health Compass AI System

A comprehensive AI-powered health supplement, medicine, and vaccine recommendation and chatbot system built with FastAPI, OpenAI GPT-4, and MongoDB.

## Overview

Health Compass is an intelligent health assistant that provides educational information about supplements, medicines, and vaccines. The system automatically detects when users ask "what is [name]?" and searches through a comprehensive database of health factsheets, falling back to GPT-4 for general educational information when specific data isn't available.

## Key Features

### Core AI Capabilities
- **AI Chatbot Integration** - OpenAI GPT-4/3.5 powered health assistant
- **Multi-Context Support** - Supplement, medicine, and vaccine-specific responses
- **Factsheet Search** - Automatic detection of "what is [name]?" queries with database search
- **AI-Based Recommendations** - Intelligent supplement suggestions based on health tags
- **Safety-First Approach** - Built-in medical disclaimers and content filtering

### Health Management Systems
- **Supplement Management** - Complete CRUD operations for dietary supplements
- **Medicine Management** - Comprehensive medicine information and tracking
- **Vaccine Management** - Vaccine details and scheduling systems
- **Scheduling Systems** - Medicine and vaccine reminder scheduling

### Technical Features
- **Rate Limiting** - IP and anonymous token-based request throttling
- **Comprehensive Logging** - AI query logs and supplement view analytics
- **Anonymous Sessions** - Short-lived tokens for user tracking without PII
- **Input Sanitization** - Security measures and banned keyword filtering

## Architecture

The system is built with a modular architecture:

- **FastAPI** - Modern, fast web framework for building APIs
- **OpenAI GPT-4/3.5** - Advanced AI language models for natural conversations
- **MongoDB** - NoSQL database for flexible data storage
- **Motor** - Asynchronous MongoDB driver for Python
- **Pydantic** - Data validation and settings management
- **Uvicorn** - ASGI server for production deployment

## Installation

### Prerequisites
- Python 3.8+
- MongoDB instance
- OpenAI API key

### Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd healthcompass_2
```

2. **Create virtual environment**
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install dependencies**
```bash
python3 -m pip install -r requirements.txt
```

4. **Environment configuration**
Create a `.env` file with your configuration (do NOT commit real secrets):
```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4

MONGODB_URL=
MONGODB_DB=health-compass

REDIS_URL=redis://localhost:6379

LOG_LEVEL=INFO
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=3600
```

5. **Initialize sample data**
```bash
python3 init_sample_data.py
```

6. **Run the application**
```bash
python3 main.py
```

The server will start at `http://localhost:8000`

## API Endpoints

### Core Chatbot
- **POST /api/bot/ask** - Main AI chatbot endpoint with automatic factsheet detection
- **POST /api/bot/comprehensive** - **NEW!** Comprehensive query processing with intelligent routing
- **POST /api/bot/recommend** - AI-based supplement recommendations
- **POST /api/bot/factsheet-search** - Direct factsheet search endpoint

### Health Management
- **POST /api/supplements** - Create new supplement
- **GET /api/supplements/{id}** - Get supplement by ID
- **GET /api/supplements/search/{query}** - Search supplements
- **POST /api/medicines** - Create new medicine
- **GET /api/medicines/{id}** - Get medicine by ID
- **GET /api/medicines/search/{query}** - Search medicines
- **POST /api/vaccines** - Create new vaccine
- **GET /api/vaccines/{id}** - Get vaccine by ID
- **GET /api/vaccines/search/{query}** - Search vaccines

### Scheduling Systems
- **POST /api/medicines/schedule** - Create medicine schedule
- **GET /api/medicines/schedule/{token}** - Get medicine schedules
- **PUT /api/medicines/schedule/{id}** - Update medicine schedule
- **POST /api/vaccines/schedule** - Create vaccine schedule
- **GET /api/vaccines/schedule/{token}** - Get vaccine schedules
- **PUT /api/vaccines/schedule/{id}** - Update vaccine schedule

### Analytics and Admin
- **GET /api/admin/logs/queries** - AI query logs with filtering
- **GET /api/admin/logs/views** - Supplement view analytics
- **GET /api/rate-limit/info** - Rate limit information
- **POST /api/supplements/{id}/view** - Log supplement view

## Factsheet Search Feature

### Automatic Detection
The system automatically detects when users ask questions like:
- "What is vitamin C?"
- "Tell me about aspirin"
- "Information about flu vaccine"
- "What's omega 3?"
- "Explain ibuprofen"

### How It Works
1. **Query Detection** - System identifies factsheet search patterns
2. **Database Search** - Searches across supplements, medicines, and vaccines
3. **AI Structuring** - GPT organizes factsheet information into clear responses
4. **Educational Output** - Provides well-formatted, informative content
5. **GPT-4 Fallback** - Automatically provides information when no database data found

### API Endpoints
- **POST /api/bot/ask** - Main endpoint (automatically detects factsheet searches)
- **POST /api/bot/factsheet-search** - Direct factsheet search endpoint

### Example Usage
```bash
# Ask about a supplement
curl -X POST "http://localhost:8000/api/bot/ask" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is vitamin C?", "query_type": "SUPPLEMENT_GENERAL"}'

# Ask about a medicine
curl -X POST "http://localhost:8000/api/bot/ask" \
  -H "Content-Type: application/json" \
  -d '{"query": "Tell me about aspirin", "query_type": "MEDICINE_GENERAL"}'
```

### GPT-4 Fallback Feature
When no factsheet data is found in the database, the system automatically falls back to GPT-4 to provide educational information:

```bash
# Query for item not in database
curl -X POST "http://localhost:8000/api/bot/ask" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is quercetin?"}'

# Result: GPT-4 provides educational information about quercetin
# No more "Failed to search factsheet information" errors!
```

**Benefits:**
- **Always helpful responses** - No more empty results
- **Educational content** - GPT-4 provides comprehensive information
- **Seamless experience** - Users get information regardless of database coverage
- **Safety maintained** - Medical disclaimers and safety warnings included

## Comprehensive Query System (NEW!)

The Health Compass AI System now includes a **Comprehensive Query Processing** system that implements intelligent query routing based on your exact requirements:

### 🔍 **Query Flow Overview**

```
User Query
    ↓
┌─────────────────────────────────────────────────────────┐
│ 🔍 STEP 1: Health-Related Check                        │
│    • Use GPT to determine if query is health-related   │
│    • If NOT health-related → Show off-topic message    │
└─────────────────────────────────────────────────────────┘
    ↓ (if health-related)
┌─────────────────────────────────────────────────────────┐
│ 🔍 STEP 2: Personal Query Detection                    │
│    • Check if asking about medicine schedule           │
│    • If personal query → Redirect to appropriate      │
│      endpoint with guidance                            │
└─────────────────────────────────────────────────────────┘
    ↓ (if not personal)
┌─────────────────────────────────────────────────────────┐
│ 🔍 STEP 3: Factsheet Search Detection                  │
│    • Check if asking "What is [name]?"                 │
│    • If factsheet query → Search database              │
│    • If found → Return structured data                 │
│    • If not found → Use GPT-4 fallback                 │
└─────────────────────────────────────────────────────────┘
    ↓ (if not factsheet search)
┌─────────────────────────────────────────────────────────┐
│ 🔍 STEP 4: General Health Query                        │
│    • Process as general health question                │
│    • Use standard AI response generation               │
└─────────────────────────────────────────────────────────┘
    ↓
Response with Flow Summary
```

### 🚀 **New Endpoint: `/api/bot/comprehensive`**

This endpoint implements the complete intelligent routing system:

```bash
# Comprehensive query processing
curl -X POST "http://localhost:8000/api/bot/comprehensive" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is vitamin C?"}'
```

### 📋 **Query Types and Responses**

#### **1. Non-Health Queries (Blocked)**
- **Example**: "How do I write a Python function?"
- **Response**: Off-topic message with health focus reminder
- **Flow**: `Query blocked - Not health-related`

#### **2. Health Factsheet Queries (Database Found)**
- **Example**: "What is vitamin C?"
- **Response**: Structured factsheet data from database
- **Flow**: `Factsheet found - Database data for vitamin C`

#### **3. Health Factsheet Queries (GPT Fallback)**
- **Example**: "What is quercetin?"
- **Response**: GPT-4 generated educational information
- **Flow**: `Factsheet not found - GPT-4 fallback for quercetin`

#### **4. Personal Medicine Schedule Queries**
- **Example**: "What is my medicine schedule on 2025-08-11?"
- **Response**: Redirect guidance to medicine schedule endpoint
- **Flow**: `Personal query handled - Medicine schedule for 2025-08-11`

#### **5. General Health Queries**
- **Example**: "What are the benefits of regular exercise?"
- **Response**: Standard AI-generated health advice
- **Flow**: `General health query processed`

### 🧪 **Testing the Comprehensive System**

#### **Run the Demo**
```bash
# Interactive demo with examples
python3 demo_comprehensive_flow.py

# Run comprehensive tests
python3 test_comprehensive_flow.py
```

#### **Test Different Query Types**
```bash
# Test non-health query (should be blocked)
curl -X POST "http://localhost:8000/api/bot/comprehensive" \
  -H "Content-Type: application/json" \
  -d '{"query": "How do I write JavaScript code?"}'

# Test health factsheet query (should find database data)
curl -X POST "http://localhost:8000/api/bot/comprehensive" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is vitamin D?"}'

# Test personal medicine schedule query
curl -X POST "http://localhost:8000/api/bot/comprehensive" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is my medicine schedule on 2025-08-11?"}'
```

### 🔧 **Implementation Details**

The comprehensive system is implemented in `ai_service.py` with the `process_comprehensive_query()` method:

```python
# Process any query with intelligent routing
response_data = await ai_service.process_comprehensive_query(
    query="What is vitamin C?",
    anon_token="optional_token"
)

# Response includes flow summary and metadata
print(response_data["flow_summary"])
print(response_data["metadata"]["flow_step"])
```

### 📊 **Response Format**

All comprehensive query responses include:

- **`response`**: The actual response text
- **`metadata`**: Detailed information about processing
- **`disclaimer`**: Appropriate medical disclaimers
- **`flow_summary`**: Human-readable flow description
- **`flow_step`**: Technical flow step identifier

### 🎯 **Benefits**

1. **Intelligent Routing**: Automatically detects query type and routes appropriately
2. **Token Efficiency**: Blocks non-health queries to save AI tokens
3. **Database First**: Prioritizes factsheet data over AI generation
4. **Personal Query Handling**: Properly routes personal health questions
5. **Flow Transparency**: Clear visibility into how queries are processed
6. **Consistent Responses**: Standardized response format across all query types

### 🔄 **Migration from Old System**

The comprehensive system is **additive** - your existing endpoints continue to work:

- **`/api/bot/ask`**: Original endpoint (still functional)
- **`/api/bot/comprehensive`**: New comprehensive endpoint (recommended)
- **`/api/bot/factsheet-search`**: Direct factsheet search (still available)

### 🚀 **Getting Started**

1. **Start the server**: `python3 main.py`
2. **Test the demo**: `python3 demo_comprehensive_flow.py`
3. **Use the endpoint**: Send POST requests to `/api/bot/comprehensive`
4. **Monitor flow**: Check `flow_summary` in responses to understand routing

The comprehensive query system provides a **production-ready** solution that handles all the query routing requirements you specified, with clear flow control and appropriate responses for each scenario.

## Security Features

### Rate Limiting
- IP-based rate limiting with configurable limits
- Anonymous token-based throttling
- Configurable time windows and request limits

### Input Validation
- Comprehensive input sanitization
- Banned keyword filtering
- SQL injection prevention
- XSS protection

### Medical Safety
- Built-in medical disclaimers
- No medical advice provision
- Healthcare professional consultation reminders
- Educational content only

## Data Models

### Supplement
- Name, description, ingredients
- Benefits, risks, usage instructions
- Dosage information, category
- Factsheet content

### Medicine
- Name, generic name, description
- Active ingredients, dosage forms
- Indications, contraindications
- Side effects, interactions

### Vaccine
- Name, description, target disease
- Age groups, dosage schedule
- Contraindications, side effects
- Effectiveness information

### Scheduling
- Anonymous token tracking
- Start dates, due dates
- Frequency, status tracking
- Completion logging

## Configuration

### Environment Variables
- `OPENAI_API_KEY` - Your OpenAI API key
- `MONGODB_URL` - MongoDB connection string
- `MONGODB_DATABASE` - Database name
- `LOG_LEVEL` - Logging level (DEBUG, INFO, WARNING, ERROR)
- `RATE_LIMIT_REQUESTS` - Maximum requests per window
- `RATE_LIMIT_WINDOW` - Time window in seconds

### Database Collections
- `supplement` - Dietary supplement information
- `medicine` - Medicine details and factsheets
- `vaccine` - Vaccine information and schedules
- `medicineschedule` - Medicine scheduling data
- `vaccineschedule` - Vaccine scheduling data
- `ai_query_logs` - AI interaction logs
- `supplement_view_logs` - Supplement view analytics

## Development

### Project Structure
```
healthcompass_2/
├── main.py              # FastAPI application entry point
├── config.py            # Configuration and settings
├── models.py            # Pydantic data models
├── database.py          # MongoDB connection and operations
├── ai_service.py        # OpenAI integration and AI logic
├── rate_limiter.py      # Rate limiting implementation
├── utils.py             # Utility functions
├── requirements.txt     # Python dependencies
├── demo.py              # Demonstration script
├── init_sample_data.py  # Sample data initialization
└── README.md            # This file
```

### Running Tests
```bash
# Run comprehensive demo
python3 demo.py

# Test factsheet search functionality
python3 test_factsheet_search.py

# Test GPT-4 fallback functionality
python3 test_gpt4_fallback.py
```

### Testing Factsheet Search
```bash
# Test the new factsheet search functionality
python3 test_factsheet_search.py

# Test specific factsheet queries
curl -X POST "http://localhost:8000/api/bot/ask" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is vitamin C?", "query_type": "SUPPLEMENT_GENERAL"}'

curl -X POST "http://localhost:8000/api/bot/ask" \
  -H "Content-Type: application/json" \
  -d '{"query": "Tell me about aspirin", "query_type": "MEDICINE_GENERAL"}'
```

### Testing GPT-4 Fallback
```bash
# Test the GPT-4 fallback functionality
python3 test_gpt4_fallback.py

# Test queries that will trigger GPT-4 fallback
curl -X POST "http://localhost:8000/api/bot/ask" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is quercetin?"}'

curl -X POST "http://localhost:8000/api/bot/ask" \
  -H "Content-Type: application/json" \
  -d '{"query": "Tell me about zinc supplements"}'
```

### Initialize Sample Data
```bash
# Populate database with sample supplements, medicines, and vaccines
python3 init_sample_data.py

# This will allow you to test factsheet search with real data:
# • "What is vitamin C?" → Returns database factsheet
# • "Tell me about aspirin" → Returns database factsheet
# • "Information about flu vaccine" → Returns database factsheet
```

## Monitoring & Logging

### AI Query Logs
- Query text and AI response
- Model used and tokens consumed
- Timestamp and success status
- Anonymous token tracking
- Context information (supplement, medicine, vaccine IDs)

### Supplement View Analytics
- Page visit tracking
- User agent and IP information
- Anonymous session correlation
- Time-based analytics

### Admin Dashboard
- Real-time query monitoring
- Rate limit status
- Error tracking and debugging
- Performance metrics

## Deployment

### Docker
```bash
# Build image
docker build -t healthcompass .

# Run container
docker run -p 8000:8000 --env-file .env healthcompass
```

### Production Considerations
- Set appropriate rate limits
- Configure MongoDB authentication
- Enable HTTPS
- Set up monitoring and alerting
- Configure backup strategies
- Implement proper logging rotation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions or support, please open an issue in the repository or contact the development team.

## Acknowledgments

- OpenAI for providing the GPT-4 API
- FastAPI team for the excellent web framework
- MongoDB team for the robust database solution
- The health and wellness community for inspiration

---

**Note**: This system is designed for educational purposes only. It does not provide medical advice, and users should always consult healthcare professionals for medical decisions.
