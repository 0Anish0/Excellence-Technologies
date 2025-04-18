'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Header } from '@/components/ui/header'
import { PollForm } from '@/components/poll-form'
import { PollList } from '@/components/poll-list'
import { MyPolls } from '@/components/my-polls'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

type UserRole = 'user' | 'admin'

export default function DashboardPage() {
  const [userRole, setUserRole] = useState<UserRole>('user')
  const [loading, setLoading] = useState(true)
  const supabase = createClientComponentClient()
  const router = useRouter()

  useEffect(() => {
    checkUserRole()
  }, [])

  const checkUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      // Get role from profiles table using id column
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (error) {
        console.error('Error fetching user role:', error)
        return
      }

      setUserRole(profile?.role || 'user')
    } catch (error) {
      console.error('Error checking user role:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          <Tabs defaultValue="polls" className="w-full">
            <TabsList className={cn(
              "grid w-full",
              userRole === 'admin' ? "grid-cols-3" : "grid-cols-1"
            )}>
              <TabsTrigger value="polls">Active Polls</TabsTrigger>
              {userRole === 'admin' && (
                <>
                  <TabsTrigger value="create">Create Poll</TabsTrigger>
                  <TabsTrigger value="my-polls">My Polls</TabsTrigger>
                </>
              )}
            </TabsList>
            <TabsContent value="polls" className="mt-6">
              <PollList />
            </TabsContent>
            {userRole === 'admin' && (
              <>
                <TabsContent value="create" className="mt-6">
                  <PollForm />
                </TabsContent>
                <TabsContent value="my-polls" className="mt-6">
                  <MyPolls />
                </TabsContent>
              </>
            )}
          </Tabs>
        </div>
      </main>
    </div>
  )
}