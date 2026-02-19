import jwt from 'jsonwebtoken';
import { IUser } from '../../models/User';

export function generateTestToken(
  userId: string,
  organizationId: string,
  role: IUser['role'] = 'admin'
): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  const expiresIn = Number(process.env.JWT_EXPIRES_IN) || 15 * 60;

  return jwt.sign(
    {
      id: userId,
      role,
      organization: organizationId,
    },
    jwtSecret,
    { expiresIn }
  );
}