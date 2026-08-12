import { JwtService } from './jwt.service.js';
import { env } from '../../config/env.config.js';

export class TokenService {
  static generateAuthTokens(userPayload) {
    const accessToken = JwtService.signToken(
      { id: userPayload.id, email: userPayload.email, role: userPayload.role },
      env.JWT_SECRET,
      env.JWT_EXPIRES_IN
    );

    const refreshToken = JwtService.signToken(
      { id: userPayload.id },
      env.REFRESH_TOKEN_SECRET,
      env.REFRESH_TOKEN_EXPIRES_IN
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: env.JWT_EXPIRES_IN
    };
  }

  static verifyRefreshToken(refreshToken) {
    return JwtService.verifyToken(refreshToken, env.REFRESH_TOKEN_SECRET);
  }
}
