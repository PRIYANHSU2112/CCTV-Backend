/**
 * User Module OpenAPI / Swagger Documentation Specifications
 * @openapi
 */
export const userSwaggerDocs = {
  components: {
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '66b4d32a10e5f2a1b89c1001' },
          name: { type: 'string', example: 'Rahul Sharma' },
          phone: { type: 'string', example: '+919876543210' },
          username: { type: 'string', example: 'rahul_admin' },
          email: { type: 'string', example: 'rahul@satyakabir.com' },
          role: { type: 'string', enum: ['SUPER_ADMIN', 'ACCOUNTS_MANAGER', 'OPERATIONS_TEAM', 'CLIENT'], example: 'CLIENT' },
          status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'], example: 'ACTIVE' },
          lastLogin: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      CreateUserPayload: {
        type: 'object',
        required: ['name', 'phone', 'password'],
        properties: {
          name: { type: 'string', example: 'Rahul Sharma' },
          phone: { type: 'string', example: '+919876543210' },
          username: { type: 'string', example: 'rahul_ops' },
          email: { type: 'string', example: 'rahul@satyakabir.com' },
          password: { type: 'string', example: 'securePass123' },
          role: { type: 'string', enum: ['SUPER_ADMIN', 'ACCOUNTS_MANAGER', 'OPERATIONS_TEAM', 'CLIENT'], default: 'CLIENT' },
          status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'], default: 'ACTIVE' }
        }
      },
      MobileLoginPayload: {
        type: 'object',
        required: ['phone', 'password'],
        properties: {
          phone: { type: 'string', example: '+919876543210' },
          password: { type: 'string', example: 'securePass123' }
        }
      },
      SendOtpPayload: {
        type: 'object',
        required: ['phone'],
        properties: {
          phone: { type: 'string', example: '+919876543210' }
        }
      },
      OtpLoginPayload: {
        type: 'object',
        required: ['phone', 'otp'],
        properties: {
          phone: { type: 'string', example: '+919876543210' },
          otp: { type: 'string', example: '1234' }
        }
      },
      AdminLoginPayload: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', example: 'admin_user' },
          password: { type: 'string', example: 'superSecret123' }
        }
      },
      UnifiedLoginPayload: {
        type: 'object',
        required: ['identifier', 'password'],
        properties: {
          identifier: { type: 'string', example: '+919876543210 or admin_user' },
          password: { type: 'string', example: 'securePass123' }
        }
      }
    }
  },
  paths: {
    '/users/register': {
      post: {
        summary: 'Register a new user (Client or Staff)',
        tags: ['Users'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateUserPayload' }
            }
          }
        },
        responses: {
          201: { description: 'User successfully created' },
          400: { description: 'Validation error' },
          409: { description: 'Phone, username, or email already exists' }
        }
      }
    },
    '/users/otp/send': {
      post: {
        summary: 'Send Mobile OTP (Static 1234 for testing)',
        tags: ['Users - Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SendOtpPayload' }
            }
          }
        },
        responses: {
          200: { description: 'OTP sent successfully' },
          400: { description: 'Invalid phone number' }
        }
      }
    },
    '/users/login/otp': {
      post: {
        summary: 'User login or registration using Mobile Phone & OTP',
        tags: ['Users - Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/OtpLoginPayload' }
            }
          }
        },
        responses: {
          200: { description: 'OTP verification & login successful' },
          401: { description: 'Invalid or expired OTP' }
        }
      }
    },
    '/users/login/mobile': {
      post: {
        summary: 'Client User login using Mobile Phone & Password',
        tags: ['Users - Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MobileLoginPayload' }
            }
          }
        },
        responses: {
          200: { description: 'Mobile login successful' },
          401: { description: 'Invalid mobile or password' }
        }
      }
    },
    '/users/login/admin': {
      post: {
        summary: 'Administration login using Username/Email & Password',
        tags: ['Users - Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdminLoginPayload' }
            }
          }
        },
        responses: {
          200: { description: 'Admin login successful' },
          401: { description: 'Invalid username/email or password' }
        }
      }
    },
    '/users/login': {
      post: {
        summary: 'Unified Login (Auto-detects Mobile Phone vs Username/Email)',
        tags: ['Users - Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UnifiedLoginPayload' }
            }
          }
        },
        responses: {
          200: { description: 'Authentication successful' },
          401: { description: 'Invalid credentials' }
        }
      }
    },
    '/users': {
      get: {
        summary: 'List users with pagination, search, and role/status filtering',
        tags: ['Users'],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'role', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Paginated user list' }
        }
      }
    },
    '/users/{id}': {
      get: {
        summary: 'Get user details by ID',
        tags: ['Users'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'User details' },
          404: { description: 'User not found' }
        }
      }
    }
  }
};
