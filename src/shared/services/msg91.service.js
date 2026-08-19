import https from 'https';
import { logger } from '../utils/logger.js';

const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY || process.env.MSG_KEY || '384292AwWekgBJSf635f77feP1';
const MSG91_HOST = process.env.MSG91_HOST || 'api.msg91.com';
const MSG91_FLOW_PATH = process.env.MSG91_FLOW_PATH || '/api/v5/flow/';
const MSG91_FLOW_ID = process.env.MSG91_FLOW_ID || '63614b3dabf10640e61fa856';
const MSG91_SENDER = process.env.MSG91_SENDER || 'Home Service';
const MSG91_COUNTRY_CODE = process.env.MSG91_COUNTRY_CODE || '91';

/**
 * Send Real OTP via MSG91 Flow API
 * @param {string} mobile - 10-digit mobile number
 * @param {string|number} otp - 4 to 6 digit OTP
 */
export const sendOtpViaMSG91 = (mobile, otp) => {
  return new Promise((resolve, reject) => {
    // Strip non-digits and extract clean 10-digit number
    const cleanDigits = String(mobile || '').replace(/\D/g, '');
    const clean10 = cleanDigits.slice(-10);

    if (!clean10 || clean10.length < 10) {
      return reject(new Error('Invalid 10-digit mobile number'));
    }

    const authkey = process.env.MSG91_AUTH_KEY || process.env.MSG_KEY || MSG91_AUTH_KEY;
    const host = process.env.MSG91_HOST || MSG91_HOST;
    const path = process.env.MSG91_FLOW_PATH || MSG91_FLOW_PATH;
    const flowId = process.env.MSG91_FLOW_ID || MSG91_FLOW_ID;
    const sender = process.env.MSG91_SENDER || MSG91_SENDER;
    const countryCode = process.env.MSG91_COUNTRY_CODE || MSG91_COUNTRY_CODE;

    const body = JSON.stringify({
      flow_id: flowId,
      sender: sender,
      mobiles: `${countryCode}${clean10}`,
      otp: String(otp),
    });

    const options = {
      method: 'POST',
      hostname: host,
      path: path,
      headers: {
        authkey: authkey,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          logger.info(`[MSG91 Flow] Response for ${clean10} (status ${res.statusCode}): ${data}`);
          if (res.statusCode === 200 || parsed.type === 'success') {
            resolve(parsed);
          } else {
            reject(new Error(parsed.message || parsed.error?.message || 'MSG91 API error'));
          }
        } catch {
          logger.info(`[MSG91 Flow] Raw response for ${clean10}: ${data}`);
          resolve({ raw: data });
        }
      });
    });

    req.on('error', (err) => {
      logger.error(`[MSG91 Flow] Network error for ${clean10}: ${err.message}`);
      reject(err);
    });

    req.write(body);
    req.end();
  });
};

/**
 * Standard Send OTP SMS wrapper
 */
export async function sendOtpSms(phone, otp) {
  try {
    const res = await sendOtpViaMSG91(phone, otp);
    return { success: true, result: res };
  } catch (err) {
    logger.error(`Failed to send OTP via MSG91 Flow to ${phone}: ${err.message}`);
    return { success: false, error: err.message };
  }
}
