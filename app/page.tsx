import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect to the upload page
  redirect('/upload');
  
  // This won't be rendered due to the redirect
  return null;
}