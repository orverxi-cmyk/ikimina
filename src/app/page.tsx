import { redirect } from 'next/navigation';

/**
 * Root page component.
 * Automatically directs visitors to the login page as the default path for the application.
 */
export default function RootPage() {
  redirect('/login');
}
