export interface Credentials {
  email: string;
  password: string;
}

export interface SignupDetails extends Credentials {
  username: string;
}

/** Normalised result of a login/signup attempt. */
export interface AuthResult {
  success: boolean;
  message: string;
  username: string | null;
}

/* Raw server shapes. The backend answers a failed login with HTTP 200 and no
 * `success` flag, which is why these fields are optional. */
export interface AuthResponse {
  message: string;
  success?: boolean;
  username?: string;
  user?: string | { username?: string; email?: string };
}

export interface VerifyResponse {
  status: boolean;
  user?: string;
  username?: string;
}
