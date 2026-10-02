/**
 * @fileOverview Comprehensive Application Error Handling Framework.
 * 
 * Translates raw Firebase, Network, HTTP, and runtime exceptions into
 * user-friendly, gracious, production-grade error diagnostics.
 * 
 * Covers all edge cases:
 * - Network disconnected / offline / DNS failure
 * - Firebase Authentication errors (invalid credentials, rate-limiting, missing identity)
 * - Firestore database connectivity & security permission errors
 * - Cloud Function callables & timeout failures
 * - Safe fallback for unexpected exceptions
 */

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'fatal';

export type ErrorCategory = 
  | 'network'
  | 'auth'
  | 'permission'
  | 'not_found'
  | 'rate_limit'
  | 'validation'
  | 'quota'
  | 'timeout'
  | 'server'
  | 'unknown';

export interface AppErrorDetails {
  title: string;
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  isNetworkError: boolean;
  retryable: boolean;
  originalCode?: string;
  suggestedAction?: string;
}

/**
 * Checks if the browser or runtime is currently offline.
 */
export function isBrowserOffline(): boolean {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
    return !navigator.onLine;
  }
  return false;
}

/**
 * Checks if an error is caused by a network disconnection or unreachable host.
 */
export function isNetworkError(error: unknown): boolean {
  if (isBrowserOffline()) return true;

  if (!error) return false;

  const errStr = String(error).toLowerCase();
  const code = (error as any)?.code ? String((error as any).code).toLowerCase() : '';
  const message = (error as any)?.message ? String((error as any).message).toLowerCase() : '';

  return (
    code.includes('network-request-failed') ||
    code.includes('unavailable') ||
    code.includes('deadline-exceeded') ||
    message.includes('network') ||
    message.includes('offline') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('networkerror') ||
    message.includes('load failed') ||
    message.includes('interrupted connection') ||
    message.includes('unreachable host') ||
    message.includes('client is offline') ||
    errStr.includes('networkerror') ||
    errStr.includes('econnrefused') ||
    errStr.includes('err_internet_disconnected')
  );
}

/**
 * Exhaustive error parser that translates any exception into clear,
 * gracious user feedback.
 */
export function parseAppError(error: unknown): AppErrorDetails {
  // 1. Check for immediate offline state
  if (isBrowserOffline()) {
    return {
      title: 'You Are Offline',
      message: 'Your device appears to be disconnected from the internet. Please check your Wi-Fi or mobile data connection and try again.',
      category: 'network',
      severity: 'warning',
      isNetworkError: true,
      retryable: true,
      suggestedAction: 'Check your internet connection and tap Retry.',
    };
  }

  if (!error) {
    return {
      title: 'Unexpected State',
      message: 'An unspecified event occurred. Please try again.',
      category: 'unknown',
      severity: 'error',
      isNetworkError: false,
      retryable: true,
    };
  }

  const err = error as any;
  const rawCode: string = err.code || err.status || '';
  const rawMessage: string = err.message || (typeof err === 'string' ? err : '');
  const codeLower = rawCode.toLowerCase();
  const messageLower = rawMessage.toLowerCase();

  // 2. Network & Connectivity Errors
  if (isNetworkError(error)) {
    return {
      title: 'Network Connection Lost',
      message: 'Unable to reach the server. The connection was interrupted or timed out. Please check your internet connection.',
      category: 'network',
      severity: 'warning',
      isNetworkError: true,
      retryable: true,
      originalCode: rawCode,
      suggestedAction: 'Verify your internet connection and try again.',
    };
  }

  // 3. Firebase Authentication Specific Codes
  if (codeLower.includes('auth/')) {
    switch (codeLower) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
        return {
          title: 'Incorrect Credentials',
          message: 'The email address or password entered does not match our records. Please double-check and try again.',
          category: 'auth',
          severity: 'error',
          isNetworkError: false,
          retryable: true,
          originalCode: rawCode,
          suggestedAction: 'Re-enter your password carefully or contact group management if you forgot your credentials.',
        };

      case 'auth/user-not-found':
        return {
          title: 'Account Not Found',
          message: 'No registered member account was found with this email address. Please verify your email or contact an administrator to register.',
          category: 'not_found',
          severity: 'error',
          isNetworkError: false,
          retryable: false,
          originalCode: rawCode,
          suggestedAction: 'Contact your scheme administrator to ensure your account was registered.',
        };

      case 'auth/user-disabled':
        return {
          title: 'Account Deactivated',
          message: 'This member account has been disabled by system administration. Please contact your scheme committee.',
          category: 'auth',
          severity: 'error',
          isNetworkError: false,
          retryable: false,
          originalCode: rawCode,
        };

      case 'auth/too-many-requests':
        return {
          title: 'Too Many Attempts',
          message: 'Access to this account has been temporarily paused due to multiple consecutive failed attempts. Please wait a few minutes before trying again.',
          category: 'rate_limit',
          severity: 'warning',
          isNetworkError: false,
          retryable: true,
          originalCode: rawCode,
          suggestedAction: 'Please wait 2 to 5 minutes before attempting to log in again.',
        };

      case 'auth/invalid-email':
        return {
          title: 'Invalid Email Format',
          message: 'The provided email address format is not valid. Please enter a valid email address (e.g. name@domain.com).',
          category: 'validation',
          severity: 'error',
          isNetworkError: false,
          retryable: true,
          originalCode: rawCode,
        };

      case 'auth/email-already-in-use':
        return {
          title: 'Email Already In Use',
          message: 'A member account with this email address already exists in the system.',
          category: 'auth',
          severity: 'error',
          isNetworkError: false,
          retryable: false,
          originalCode: rawCode,
        };

      case 'auth/expired-action-code':
        return {
          title: 'Activation Link Expired',
          message: 'This security verification link has expired. Please request a new activation link from the login page.',
          category: 'auth',
          severity: 'warning',
          isNetworkError: false,
          retryable: true,
          originalCode: rawCode,
          suggestedAction: 'Enter your email again on the login screen to receive a fresh activation link.',
        };

      case 'auth/invalid-action-code':
        return {
          title: 'Invalid Security Link',
          message: 'This activation or sign-in link is invalid or has already been used. Please request a new one.',
          category: 'auth',
          severity: 'error',
          isNetworkError: false,
          retryable: true,
          originalCode: rawCode,
        };

      case 'auth/requires-recent-login':
        return {
          title: 'Session Re-authentication Required',
          message: 'For security protection, this sensitive financial operation requires you to sign in again before proceeding.',
          category: 'auth',
          severity: 'warning',
          isNetworkError: false,
          retryable: true,
          originalCode: rawCode,
          suggestedAction: 'Sign out and sign back in to renew your security credentials.',
        };

      case 'auth/operation-not-allowed':
        return {
          title: 'Authentication Service Unavailable',
          message: 'The requested sign-in method is currently disabled in system settings. Please contact the administrator.',
          category: 'auth',
          severity: 'error',
          isNetworkError: false,
          retryable: false,
          originalCode: rawCode,
        };

      default:
        break;
    }
  }

  // 4. Firestore Database Specific Codes
  if (codeLower === 'permission-denied' || messageLower.includes('insufficient permissions')) {
    return {
      title: 'Access Restricted',
      message: 'You do not have the required permissions to perform this operation. Only authorized administrators can execute this action.',
      category: 'permission',
      severity: 'error',
      isNetworkError: false,
      retryable: false,
      originalCode: rawCode,
    };
  }

  if (codeLower === 'unauthenticated' || messageLower.includes('unauthenticated')) {
    return {
      title: 'Session Expired',
      message: 'Your active security session has expired. Please log in again to continue.',
      category: 'auth',
      severity: 'warning',
      isNetworkError: false,
      retryable: true,
      originalCode: rawCode,
      suggestedAction: 'Sign in again to continue.',
    };
  }

  if (codeLower === 'resource-exhausted' || messageLower.includes('quota exceeded')) {
    return {
      title: 'Service Limit Reached',
      message: 'System resource or API quota temporarily exceeded. Please try again shortly.',
      category: 'quota',
      severity: 'warning',
      isNetworkError: false,
      retryable: true,
      originalCode: rawCode,
    };
  }

  if (codeLower === 'not-found') {
    return {
      title: 'Record Not Found',
      message: 'The requested record, account, or document could not be found.',
      category: 'not_found',
      severity: 'error',
      isNetworkError: false,
      retryable: false,
      originalCode: rawCode,
    };
  }

  // 5. Cloud Function Specific Codes & Business Errors
  if (messageLower.includes('identity') || messageLower.includes('missing identity') || messageLower.includes('token')) {
    return {
      title: 'Authentication Verification Needed',
      message: 'Unable to verify your user identity. If you recently disconnected or refreshed, please sign in again.',
      category: 'auth',
      severity: 'warning',
      isNetworkError: false,
      retryable: true,
      suggestedAction: 'Sign in to refresh your authentication identity.',
    };
  }

  if (messageLower.includes('email not found')) {
    return {
      title: 'Unregistered Email',
      message: 'This email address is not registered in the system. Please ensure there are no typos or contact your group administrator to be added.',
      category: 'not_found',
      severity: 'error',
      isNetworkError: false,
      retryable: false,
    };
  }

  if (messageLower.includes('exceeds')) {
    return {
      title: 'Policy Limit Exceeded',
      message: rawMessage,
      category: 'validation',
      severity: 'warning',
      isNetworkError: false,
      retryable: true,
    };
  }

  // 6. Generic Graceful Fallback
  return {
    title: 'Operation Failed',
    message: rawMessage && !rawMessage.startsWith('Firebase:') && !rawMessage.includes('INTERNAL')
      ? rawMessage
      : 'An unexpected error occurred while processing your request. Please try again in a few moments.',
    category: 'unknown',
    severity: 'error',
    isNetworkError: false,
    retryable: true,
    originalCode: rawCode,
  };
}

/**
 * Returns a human-friendly string for toasts or alerts from any error object.
 */
export function getErrorMessage(error: unknown, fallbackMessage = 'An unexpected error occurred.'): string {
  const parsed = parseAppError(error);
  return parsed.message || fallbackMessage;
}
