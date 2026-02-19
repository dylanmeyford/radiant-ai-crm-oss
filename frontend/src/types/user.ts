export interface User {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'user';
  RadiantAdmin?: boolean;
  organization?: string;
}
