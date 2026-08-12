# Enterprise Modular Monolithic Backend (Node.js & ES Modules)

An ultra-scalable, production-ready modular monolithic Node.js backend featuring **AsyncLocalStorage Request Context (`requestId`, `correlationId`)**, **Pino High-Performance Logging**, **MongoDB Lifecycle Management & Aggregations**, **Dedicated Health Module (`/health`, `/ready`)**, **Advanced Security Services (JWT, Token, AES-256 Encryption, Bcrypt)**, **AWS S3 Storage Layer**, **Node-Cron Task Scheduler**, **Automatic Swagger Auto-Loader**, **Rich Exception Hierarchy**, and **Module Barrel Exports (`index.js`)**.

---

## 🏛️ Comprehensive Architecture Layout

```
cctv-Backend/
├── 📄 Dockerfile                      # Multi-stage production container build
├── 📄 docker-compose.yml              # Node.js app + Redis 7 compose orchestrator
├── 📄 package.json                    # Dependencies (Pino, Mongoose, AWS S3, Awilix)
├── 📄 nodemon.json                    # Development hot-reload watcher
├── 📄 jest.config.js                  # Jest ES Modules test framework configuration
├── 📄 .env.example                    # Environment template
└── 📂 src/
    ├── 📄 main.js                     # Server bootstrap with Mongoose, Redis & Graceful Shutdown
    ├── 📄 app.js                      # Express app setup, Pino Logger & AsyncLocalStorage Context
    │
    ├── 📂 config/                     # Centralized Configurations
    │   ├── 📄 env.config.js           # Validated environment variables (MongoDB, S3, Pino)
    │   ├── 📄 database.config.js      # MongoDB lifecycle, retries & graceful shutdown
    │   ├── 📄 redis.config.js         # ioredis client lifecycle
    │   ├── 📄 logger.config.js        # High-performance Pino logger config
    │   ├── 📄 swagger.config.js       # Base Swagger spec & SwaggerRegistry
    │   └── 📄 swagger.loader.js       # Automatic module swagger discovery & loader
    │
    ├── 📂 scheduler/                  # Background Cron Scheduler
    │   ├── 📄 cleanup.job.js          # Nightly cache/temp purge job
    │   └── 📄 scheduled-tasks.js      # Scheduler runner
    │
    ├── 📂 shared/                     # Shared Cross-Cutting Infrastructure
    │   ├── 📂 bases/                  # Base Controllers, Services, Repositories, Validators
    │   ├── 📂 constants/              # HttpStatus, Messages, SystemConstants
    │   ├── 📂 context/                # Request Context via Node.js AsyncLocalStorage
    │   │   ├── 📄 request-context.service.js    # Context store accessor
    │   │   └── 📄 request-context.middleware.js # Generates X-Request-ID & X-Correlation-ID
    │   │
    │   ├── 📂 errors/                 # Exception Hierarchy & Handlers
    │   │   ├── 📄 app-error.js        # Base Exception
    │   │   ├── 📄 validation.error.js # 400 Validation Error
    │   │   ├── 📄 unauthorized.error.js # 401 Unauthorized Error
    │   │   ├── 📄 forbidden.error.js  # 403 Forbidden Error
    │   │   ├── 📄 not-found.error.js  # 404 Not Found Error
    │   │   ├── 📄 conflict.error.js   # 409 Conflict Error
    │   │   ├── 📄 internal-server.error.js # 500 Internal Error
    │   │   └── 📄 global-error.handler.js # Centralized Global Error Handler
    │   │
    │   ├── 📂 security/               # Advanced Security Services
    │   │   ├── 📄 jwt.service.js      # Low-level JWT signing & verification
    │   │   ├── 📄 token.service.js    # Access & Refresh token handling
    │   │   ├── 📄 encryption.service.js # AES-256-GCM symmetric cipher
    │   │   └── 📄 hash.service.js     # Bcrypt password hashing
    │   │
    │   ├── 📂 storage/                # Cloud & Local File Storage
    │   │   ├── 📄 multer.config.js    # Multer file upload filter & limits
    │   │   ├── 📄 storage.service.js  # Generic storage service wrapper
    │   │   └── 📄 s3.service.js       # AWS S3 cloud storage integration
    │   │
    │   ├── 📂 middlewares/            # Middlewares (Pino Request Logger, Auth, Rate Limit)
    │   └── 📂 responses/              # ApiResponse standard JSON formatter
    │
    └── 📂 modules/                    # Self-contained Domain Modules
        ├── 📂 health/                 # Health Check Domain Module
        │   ├── 📄 health.service.js   # Liveness & Readiness probe logic
        │   ├── 📄 health.controller.js
        │   ├── 📄 health.routes.js
        │   ├── 📄 health.swagger.js
        │   └── 📄 index.js            # Module DI entry & public barrel
        │
        └── 📂 user/                   # Example Domain Module (MongoDB Aggregations)
            ├── 📄 user.model.js       # Mongoose Schema & Entity Model
            ├── 📄 user.validator.js   # Joi payload validation
            ├── 📄 user.repository.js  # MongoDB Aggregation Pipeline Repository
            ├── 📄 user.service.js     # UserService
            ├── 📄 user.controller.js  # UserController
            ├── 📄 user.routes.js      # Express router
            ├── 📄 user.swagger.js     # Swagger spec
            └── 📄 index.js            # Module DI Container (Awilix) & Public Barrel
```

---

## 🔥 Enterprise Feature Breakdown

### 1. Request Context (`AsyncLocalStorage`)
Tracks `X-Request-ID` and `X-Correlation-ID` across async call stacks automatically without passing request objects down service layers.

### 2. High-Performance Logging with Pino
Replaces Winston with Pino JSON logging. Automatically decorates logs with `requestId`, `correlationId`, request duration, and HTTP status codes.

### 3. Database Layer (`Mongoose MongoDB`)
- Dedicated connection lifecycle management in `src/config/database.config.js`.
- MongoDB Aggregation pipelines in `UserRepository` for optimized pagination & search queries (`$facet`, `$match`, `$project`).

### 4. Health Check Module (`/health`, `/ready`)
- `/api/v1/health`: Liveness probe.
- `/api/v1/ready`: Readiness probe validating MongoDB and Redis connectivity.

### 5. Advanced Security Services
- `JwtService`: Sign & verify JWT tokens.
- `TokenService`: Access token & refresh token lifecycle management.
- `EncryptionService`: AES-256-GCM symmetric cipher for encrypting sensitive database fields.
- `HashService`: Bcrypt password hashing.

### 6. Storage Layer (Multer + AWS S3)
- `uploadMiddleware`: Memory storage buffer with MIME-type filtering.
- `S3Service`: Upload and delete assets on AWS S3 or MinIO.

### 7. Background Cron Scheduler
`node-cron` integrated task runner in `src/scheduler/` handling scheduled cleanup jobs.

### 8. Swagger Auto Loader
`swagger.loader.js` scans `src/modules/**/*.swagger.js` dynamically, populating Swagger UI automatically without manual imports.

### 9. Module Barrel Exports (`index.js`)
Every module exposes `index.js` containing module DI container wireup (`initUserModule`, `initHealthModule`) and public class exports for loose coupling.
