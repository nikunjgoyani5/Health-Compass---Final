# Task Document: AWS Routes Integration - Phase 1 to 6

## 📋 Task Title

**AWS Infrastructure & Operations Management System Integration**

## 📝 Short Description

Implementation of comprehensive AWS-based infrastructure management system featuring real-time monitoring dashboard, operations management, data ingestion pipelines, AI agent integration, orchestration failure handling, disclaimer management, and sandbox environment for supplement data ingestion. This system provides complete visibility and control over AWS services, automated data pipelines, and intelligent recommendation processing.

---

## 🎯 Scope Overview

This task encompasses 7 major modules integrated into the Health Compass platform, providing enterprise-grade AWS infrastructure management capabilities.

---

## 📂 Module Breakdown

### 1. AWS Dashboard Module

**Base Route:** `/api/v1/aws/dashboard`

**Files:**

- Route: `routes/awsdashboard.route.js`
- Controller: `controllers/awsdashboard.controller.js`

**Endpoints:**
| Method | Endpoint | Access Level | Description |
|--------|----------|--------------|-------------|
| GET | `/v1` | Super Admin | Comprehensive AWS infrastructure dashboard with real-time metrics |

**Key Features:**

- Real-time ECS service monitoring
- Pipeline health and status tracking
- Governance and compliance scoring
- Failover readiness status
- Performance metrics (uptime, error rates, cost estimates)
- Active alerts and notifications
- 6-hour pipeline timeline visualization
- Automated data aggregation from multiple AWS services

**Data Models Used:**

- `OpsSummary` - Stores aggregated operational summaries
- `AwsLog` - Logs AWS service activities

---

### 2. Operations (OPS) Management Module

**Base Route:** `/api/v1/aws/ops`

**Files:**

- Route: `routes/ops.route.js`
- Controller: `controllers/ops.controller.js`

**Endpoints:**
| Method | Endpoint | Access Level | Description |
|--------|----------|--------------|-------------|
| GET | `/failures` | All Users | List all failure logs with optional filtering |
| POST | `/failures/resolve` | All Users | Mark failures as resolved with resolution metadata |
| GET | `/quarantine` | All Users | List all quarantined items |

**Query Parameters:**

- `type` - Filter failures by type
- `since` - Filter failures from a specific date

**Key Features:**

- Failure tracking and categorization
- Resolution workflow management
- Quarantine management system
- Historical failure analysis

**Data Models Used:**

- `FailureLog` - Tracks system failures
- `Quarantine` - Manages quarantined data

---

### 3. Data Ingestion Module

**Base Route:** `/api/v1/aws/ingest`

**Files:**

- Route: `routes/ingest.route.js`
- Controller: `controllers/ingest.controller.js`

**Endpoints:**
| Method | Endpoint | Access Level | Description |
|--------|----------|--------------|-------------|
| POST | `/ecs/supplements/status` | External Services | ECS pipeline status callback webhook |
| POST | `/drive/hook` | External Services | Google Drive ingestion webhook |
| POST | `/trello/hook` | External Services | Trello board ingestion webhook |

**Key Features:**

- ECS supplement pipeline status tracking
- Automated failure logging for pipeline errors
- Google Drive integration hooks
- Trello board integration hooks
- Real-time pipeline metrics updates (success, warnings, errors)

**Data Models Used:**

- `OpsSummary` - Updates pipeline metrics
- `FailureLog` - Logs ingestion failures

---

### 4. AWS Agent Module (AI-Powered)

**Base Route:** `/api/v1/aws/agent`

**Files:**

- Route: `routes/awsagent.route.js`
- Controller: `controllers/awsagent.controller.js`

**Endpoints:**
| Method | Endpoint | Access Level | Description |
|--------|----------|--------------|-------------|
| POST | `/output/recommendation` | Validated Schema | Accept and process AI-generated recommendations |
| POST | `/self-diagnosis` | All Users | Add self-diagnosis notes for agent performance tracking |
| GET | `/self-diagnosis/history` | All Users | Retrieve historical self-diagnosis records |
| GET | `/metrics` | All Users | Get agent performance metrics and analytics |

**Query Parameters (Metrics):**

- `timeRange` - Options: `1h`, `24h`, `7d`, `30d` (default: `24h`)

**Query Parameters (History):**

- `taskId` - Filter by specific task
- `runId` - Filter by specific run
- `limit` - Results limit (default: 50)

**Key Features:**

- Schema validation with auto-quarantine on failure
- AI recommendation processing with confidence scoring
- Self-diagnosis tracking for AI agent introspection
- Performance metrics calculation
- Sentiment analysis and trend detection
- Suggested action generation
- Risk assessment for health recommendations
- LLM-based diagnosis analysis

**Schema Validation:**

- Uses `RecommendationCardSchema` (v1.0.0)
- Middleware: `lockAndValidate` with schema locking

**Data Models Used:**

- `SelfDiagnosis` - Stores agent self-diagnosis notes
- `AwsLog` - Logs agent activities

---

### 5. Orchestration Module

**Base Route:** `/api/v1/aws/orch`

**Files:**

- Route: `routes/orch.route.js`
- Controller: `controllers/orch.controller.js`

**Endpoints:**
| Method | Endpoint | Access Level | Description |
|--------|----------|--------------|-------------|
| POST | `/failure` | Orchestration Services | Accept failure metadata from orchestration layer |

**Request Body:**

```javascript
{
  taskId: String,
  attempt: Number,
  failureType: String,
  resolutionPath: String,
  outcome: String,
  source: String,
  metadata: Object
}
```

**Key Features:**

- Centralized failure metadata collection
- Integration with orchestration pipelines
- Automated failure documentation

**Data Models Used:**

- `FailureLog` - Stores orchestration failures

---

### 6. Disclaimer Management Module

**Base Route:** `/api/v1/disclaimer`

**Files:**

- Route: `routes/disclaimer.route.js`
- Controller: `controllers/disclaimer.controller.js`
- Validation: `validations/disclaimer.validation.js`

**Endpoints:**
| Method | Endpoint | Access Level | Description |
|--------|----------|--------------|-------------|
| POST | `/` | Authenticated | Create new disclaimer with type validation |
| GET | `/` | Authenticated | Get all active disclaimers with pagination |
| GET | `/:id` | Authenticated | Get specific disclaimer by ID |
| PUT | `/:id` | Authenticated | Update disclaimer details |
| DELETE | `/:id` | Authenticated | Soft delete disclaimer (deactivate) |

**Query Parameters (GET all):**

- `type` - Filter by disclaimer type
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10)

**Key Features:**

- Type-based disclaimer management
- Automatic deactivation of previous disclaimers of same type
- Soft delete functionality
- Pagination support
- Formatted content retrieval
- User tracking (createdBy)
- Active status management

**Supported Disclaimer Types:**

- Defined in `config/disclaimer.config.js`
- Multi-type support with validation

**Data Models Used:**

- `Disclaimer` - Stores disclaimer content

**Middleware:**

- `verifyToken` - Authentication required for all endpoints
- `validate` - Request validation using Joi schemas

---

### 7. Sandbox Supplement Ingest Module

**Base Route:** `/api/v1/sandbox`

**Files:**

- Route: `routes/sandboxsupplementIngest.route.js`
- Controller: `controllers/sandboxsupplementIngest.controller.js`

**Endpoints:**
| Method | Endpoint | Access Level | Description |
|--------|----------|--------------|-------------|
| POST | `/ingest/supplement` | All Users | Ingest supplement data in sandbox environment |

**Request Body:**

```javascript
{
  createdBy: ObjectId (optional),
  productName: String (required),
  brandName: String (required),
  servingsPerContainer: String,
  servingSize: String,
  ingredients: [ObjectId],  // Ingredient IDs
  tags: [ObjectId],         // SupplementTag IDs
  usageGroup: [String],
  description: String,
  warnings: [String],
  claims: [String],
  isAvailable: Boolean (default: true),
  createdByAdmin: Boolean (default: false),
  image: String
}
```

**Key Features:**

- Sandbox environment for testing supplement ingestion
- Input normalization and validation
- Schema-compliant data transformation
- Unique run ID tracking for each ingestion
- Comprehensive error handling
- Response with inserted document details

**Data Models Used:**

- `SupplementModel` - Supplement schema

---

## 🔧 Technical Dependencies

### Services

- `services/awsReadService.js` - AWS data aggregation utilities
  - `getEcsServiceSummary()`
  - `getPipelineCountsFromLogs()`
  - `getGovernanceStatus()`
  - `getFailoverStatus()`
- `services/llmRouter.service.js` - LLM routing for AI features

### Utilities

- `utils/awsapiResponse.js` - Standardized AWS API responses
  - `apiOk()`, `apiBad()`, `apiCreated()`
- `helper/api-response.helper.js` - General API response helper

### Middleware

- `middleware/verify-token.middleware.js` - JWT authentication
- `middleware/verify-role.middleware.js` - Role-based access control
- `middleware/schemaLock.middleware.js` - Schema validation with quarantine
- `middleware/validate.middleware.js` - Request validation

### Configuration

- `config/enum.config.js` - User role enumerations
- `config/disclaimer.config.js` - Disclaimer type definitions

---

## 🗄️ Database Models

### AWS-Specific Models

1. **OpsSummary** - Aggregated operational metrics
2. **AwsLog** - AWS service activity logs
3. **FailureLog** - System failure tracking
4. **Quarantine** - Quarantined data management
5. **SelfDiagnosis** - AI agent self-diagnosis records

### Application Models

6. **Disclaimer** - Disclaimer content management
7. **SupplementModel** - Supplement product information

---

## 🔐 Security & Access Control

### Authentication

- JWT-based token verification (`verifyToken` middleware)
- Required for: Dashboard, Disclaimer management

### Authorization

- Role-based access control (`checkPermission` middleware)
- **Super Admin Only:** AWS Dashboard v1 endpoint

### Schema Validation

- Input validation using Joi schemas
- Schema locking with auto-quarantine for failed validations
- Recommendation card schema validation (v1.0.0)

---

## 📊 Key Metrics & Analytics

### Dashboard Metrics

- **Orchestration Status:** LIVE/DEGRADED/ERROR
- **Pipeline Health:** Success/Warning/Error counts
- **Governance Compliance Score:** 0-100 scale
- **Failover Readiness:** AWS/DigitalOcean status
- **Performance Metrics:** Uptime %, Error rate %, Cost estimates

### Agent Metrics

- Total recommendations processed
- Total diagnoses recorded
- Average confidence scores
- Top checkpoints frequency
- Performance score (success rate)
- Trend analysis (improving/stable/declining)

---

## 🔄 Integration Points

### External Services

1. **ECS Pipeline** → `/api/v1/aws/ingest/ecs/supplements/status`
2. **Google Drive** → `/api/v1/aws/ingest/drive/hook`
3. **Trello** → `/api/v1/aws/ingest/trello/hook`
4. **Orchestration Layer** → `/api/v1/aws/orch/failure`

### Internal Services

- Background job: `jobs/pullAws.job.js` (Scheduled AWS data pull)
- Cron services for automated tasks

---

## 📈 Monitoring & Observability

### Logging

- Comprehensive error logging with context
- Activity tracking in AwsLog model
- Failure categorization and resolution tracking

### Alerts

- Pipeline error threshold alerts (> 5 errors)
- Governance compliance alerts
- Failover readiness notifications
- Real-time status updates

---

## 🧪 Testing Considerations

### Test Coverage Areas

1. Dashboard data aggregation accuracy
2. Failure log creation and resolution workflow
3. Webhook payload processing
4. AI recommendation validation and quarantine
5. Self-diagnosis tracking and insights
6. Disclaimer CRUD operations with type validation
7. Sandbox supplement ingestion validation

### Edge Cases

- Missing AWS service responses
- Invalid schema payloads (auto-quarantine)
- Concurrent disclaimer updates
- Large-scale failure log queries
- Pipeline timeout scenarios

---

## 📦 Deployment Considerations

### Environment Variables

- AWS credentials configuration
- Database connection strings
- External service webhook URLs
- JWT secret keys

### Scaling Considerations

- Dashboard query optimization for large datasets
- Failure log pagination and archival strategy
- Real-time metrics caching
- Background job scheduling optimization

---

## 🎯 Success Criteria

1. ✅ Real-time AWS dashboard with < 2s load time
2. ✅ 99.9% webhook processing success rate
3. ✅ Automated failure detection and logging
4. ✅ AI recommendation processing with schema validation
5. ✅ Comprehensive agent performance analytics
6. ✅ Secure disclaimer management with audit trail
7. ✅ Sandbox environment for safe data testing

---

## 📝 Notes

- All AWS routes follow consistent error handling patterns
- Uses standardized AWS API response format
- Background jobs continuously sync AWS service data
- Schema validation prevents invalid data from entering the system
- Soft delete pattern used for disclaimer management
- Sandbox environment isolated from production data

---

**Document Version:** 1.0  
**Last Updated:** October 3, 2025  
**Prepared By:** AI Assistant  
**Project:** Health Compass - AWS Infrastructure Integration
