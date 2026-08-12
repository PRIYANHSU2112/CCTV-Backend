import jwt from 'jsonwebtoken';
import { env } from '../../config/env.config.js';

export class JwtService {
  static signToken(payload, secret = env.JWT_SECRET, expiresIn = env.JWT_EXPIRES_IN) {
    return jwt.sign(payload, secret, { expiresIn });
  }

  static verifyToken(token, secret = env.JWT_SECRET) {
    return jwt.verify(token, secret);
  }

  static decodeToken(token) {
    return jwt.decode(token);
  }
}
