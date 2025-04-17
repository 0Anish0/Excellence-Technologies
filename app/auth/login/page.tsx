"use client";
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailNotConfirmed, setEmailNotConfirmed] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (error.message && error.message.toLowerCase().includes('email not confirmed')) {
        setEmailNotConfirmed(true);
        setError('Please confirm your email before logging in.');
      } else {
        setError(error.message);
      }
    } else {
      router.push('/upload');
    }

    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-md p-0">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Sign in to your account</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {emailNotConfirmed && (
            <div className="mb-4 text-center">
              <Button
                type="button"
                variant="outline"
                disabled={resendLoading}
                onClick={async () => {
                  setResendLoading(true);
                  setResendSuccess('');
                  setError('');
                  const { error } = await supabase.auth.resend({ type: 'signup', email });
                  if (error) {
                    setError('Failed to resend confirmation email.');
                  } else {
                    setResendSuccess('Confirmation email resent. Please check your inbox.');
                  }
                  setResendLoading(false);
                }}
              >
                {resendLoading ? 'Resending...' : 'Resend Confirmation Email'}
              </Button>
              {resendSuccess && (
                <div className="mt-2 text-green-600 text-sm">{resendSuccess}</div>
              )}
            </div>
          )}
          <form className="space-y-6" onSubmit={handleLogin}>
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full"
              >
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </div>
          </form>
        </CardContent>
        <div className="text-center text-sm mt-4 mb-5">
          Don’t have an account?{' '}
          <Button asChild variant="link">
            <a href="/auth/register">Register</a>
          </Button>
        </div>
      </Card>
    </div>
  );
}