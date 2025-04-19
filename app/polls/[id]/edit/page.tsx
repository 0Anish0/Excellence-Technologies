'use client'

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { createClient } from "@/lib/supabase/client"
import { CreatePollForm } from "@/components/poll/create-poll-form"
import { Poll, PollOption } from "@/types/poll"

interface EditPollPageProps {
  params: {
    id: string
  }
}

export default function EditPollPage({ params }: EditPollPageProps) {
  const [poll, setPoll] = useState<Poll & { poll_options: PollOption[] }>()
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    const loadPoll = async () => {
      const { data, error } = await supabase
        .from("polls")
        .select(`
          *,
          poll_options (
            id,
            text,
            image_url
          )
        `)
        .eq("id", params.id)
        .single()

      if (error) {
        toast({
          title: "Error",
          description: "Failed to load poll",
          variant: "destructive",
        })
        return
      }

      setPoll(data)
    }

    loadPoll()
  }, [params.id, supabase, toast])

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this poll?")) {
      return
    }

    const { error } = await supabase.from("polls").delete().eq("id", params.id)

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete poll",
        variant: "destructive",
      })
      return
    }

    toast({
      title: "Success",
      description: "Poll deleted successfully",
    })

    router.push("/admin")
  }

  if (!poll) {
    return <div>Loading...</div>
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Edit Poll</h1>
        <Button variant="destructive" onClick={handleDelete}>
          Delete Poll
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edit Poll Details</CardTitle>
        </CardHeader>
        <CardContent>
          <CreatePollForm initialData={poll} />
        </CardContent>
      </Card>
    </div>
  )
} 