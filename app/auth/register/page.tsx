"use client"
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Modal from '@/components/ui/modal';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    } else {
      setShowSuccessModal(true);
    }

    setLoading(false);
  };

  const handleCloseModal = () => {
    setShowSuccessModal(false);
    router.push('/auth/login');
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-md p-0">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Create an account</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form className="space-y-6" onSubmit={handleRegister}>
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
                {loading ? "Creating account..." : "Create account"}
              </Button>
            </div>
          </form>
        </CardContent>
        <div className="text-center text-sm mt-4 mb-5">
          Already have an account?{' '}
          <Button asChild variant="link">
            <a href="/auth/login">Login</a>
          </Button>
        </div>
      </Card>

      <Modal open={showSuccessModal} onClose={handleCloseModal}>
        <div className="p-6">
          <h2 className="text-xl font-bold mb-4">Account Created Successfully!</h2>
          <p className="text-gray-600 mb-4">
            We have sent a confirmation email to {email}. Please check your inbox and click the confirmation link to verify your account.
          </p>
          <div className="flex justify-end">
            <Button onClick={handleCloseModal}>
              Continue to Login
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}