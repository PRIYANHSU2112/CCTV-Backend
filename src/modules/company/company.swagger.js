/**
 * Company Module OpenAPI / Swagger Specifications
 * @openapi
 */
export const companySwaggerDocs = {
  components: {
    schemas: {
      CompanyProfile: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '66b4d32a10e5f2a1b89c1099' },
          legalName: { type: 'string', example: 'Satya Kabir CCTV Private Limited' },
          displayName: { type: 'string', example: 'Satya Kabir CCTV Solutions' },
          registrationNumber: { type: 'string', example: 'U72900MP2021PTC056789' },
          taxId: { type: 'string', example: '23AAAAA0000A1Z5' },
          businessType: { type: 'string', example: 'PRIVATE_LIMITED' },
          email: { type: 'string', example: 'info@satyakabir.in' },
          supportEmail: { type: 'string', example: 'support@satyakabir.in' },
          phone: { type: 'string', example: '+919876543210' },
          website: { type: 'string', example: 'https://satyakabir.in' },
          address: {
            type: 'object',
            properties: {
              street: { type: 'string', example: 'Corporate Park, Sector 62' },
              city: { type: 'string', example: 'Noida' },
              state: { type: 'string', example: 'Uttar Pradesh' },
              postalCode: { type: 'string', example: '201301' },
              country: { type: 'string', example: 'India' }
            }
          },
          socialMedia: {
            type: 'object',
            properties: {
              facebook: { type: 'string', example: 'https://facebook.com/satyakabir' },
              instagram: { type: 'string', example: 'https://instagram.com/satyakabir' },
              twitter: { type: 'string', example: 'https://twitter.com/satyakabir' },
              linkedin: { type: 'string', example: 'https://linkedin.com/company/satyakabir' },
              youtube: { type: 'string', example: 'https://youtube.com/c/satyakabir' }
            }
          },
          policies: {
            type: 'object',
            properties: {
              termsAndConditions: { type: 'string', example: 'Terms & Conditions content...' },
              privacyPolicy: { type: 'string', example: 'Privacy Policy content...' },
              refundPolicy: { type: 'string', example: 'Refund Policy content...' },
              cancellationPolicy: { type: 'string', example: 'Cancellation Policy content...' }
            }
          }
        }
      },
      UpdateCompanyPayload: {
        type: 'object',
        properties: {
          legalName: { type: 'string' },
          displayName: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
          website: { type: 'string' },
          socialMedia: {
            type: 'object',
            properties: {
              facebook: { type: 'string' },
              instagram: { type: 'string' },
              linkedin: { type: 'string' }
            }
          },
          policies: {
            type: 'object',
            properties: {
              termsAndConditions: { type: 'string' },
              privacyPolicy: { type: 'string' },
              refundPolicy: { type: 'string' }
            }
          }
        }
      }
    }
  },
  paths: {
    '/company': {
      get: {
        summary: 'Get Company Profile Details',
        tags: ['Company'],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Company profile details retrieved successfully' },
          401: { description: 'Unauthorized' }
        }
      },
      put: {
        summary: 'Update Company Profile Details',
        tags: ['Company'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateCompanyPayload' }
            }
          }
        },
        responses: {
          200: { description: 'Company profile updated successfully' },
          400: { description: 'Validation error' },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden' }
        }
      }
    }
  }
};
