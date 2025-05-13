'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { extractPdfText, extractDocxText } from '@/lib/extractText'

const formSchema = z.object({
  question: z.string().min(1, 'Question is required'),
  option1: z.string().min(1, 'Option 1 is required'),
  option2: z.string().min(1, 'Option 2 is required'),
  option3: z.string().min(1, 'Option 3 is required'),
  option4: z.string().min(1, 'Option 4 is required'),
})

type Poll = {
  id: string
  user_id: string
  question: string
  option1: string
  option2: string
  option3: string
  option4: string
  file_url: string | null
  file_type: string | null
  extracted_text: string | null
  created_at: string
}

export function MyPolls() {
  const [polls, setPolls] = useState<Poll[]>([])
  const [loading, setLoading] = useState(true)
  const [editingPoll, setEditingPoll] = useState<Poll | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [extractedText, setExtractedText] = useState<string>('')
  const supabase = createClientComponentClient()
  const { toast } = useToast()
  const router = useRouter()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      question: '',
      option1: '',
      option2: '',
      option3: '',
      option4: '',
    },
  })

  useEffect(() => {
    fetchPolls()
  }, [])

  const fetchPolls = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      const { data, error } = await supabase
        .from('polls')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setPolls(data || [])
    } catch (error) {
      console.error('Error fetching polls:', error)
      toast({
        title: 'Error',
        description: 'Failed to fetch your polls',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (pollId: string, fileUrl: string | null) => {
    try {
      // Delete file from storage if exists
      if (fileUrl) {
        const fileName = fileUrl.split('/').pop()
        if (fileName) {
          await supabase.storage
            .from('poll-files')
            .remove([fileName])
        }
      }

      // Delete poll
      const { error } = await supabase
        .from('polls')
        .delete()
        .eq('id', pollId)

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Poll deleted successfully',
      })

      fetchPolls()
    } catch (error) {
      console.error('Error deleting poll:', error)
      toast({
        title: 'Error',
        description: 'Failed to delete poll',
        variant: 'destructive',
      })
    }
  }

  const handleEdit = (poll: Poll) => {
    setEditingPoll(poll)
    form.reset({
      question: poll.question,
      option1: poll.option1,
      option2: poll.option2,
      option3: poll.option3,
      option4: poll.option4,
    })
    setIsEditDialogOpen(true)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return

    const selectedFile = e.target.files[0]
    const fileType = selectedFile.type

    // Clear old file preview and extracted text
    setFilePreview(null)
    setExtractedText('')

    // Validate file type
    const validTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
    ]

    if (!validTypes.includes(fileType)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a PDF, DOCX, or image file (JPEG/PNG)',
        variant: 'destructive',
      })
      e.target.value = ''
      return
    }

    // Validate file size (max 5MB)
    if (selectedFile.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload a file smaller than 5MB',
        variant: 'destructive',
      })
      e.target.value = ''
      return
    }

    setFile(selectedFile)

    if (fileType.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => setFilePreview(e.target?.result as string)
      reader.readAsDataURL(selectedFile)
    } else {
      try {
        let text = ''
        if (fileType === 'application/pdf') {
          try {
            text = await extractPdfText(selectedFile)
            if (!text || text === 'No text content found in the PDF.') {
              toast({
                title: 'Warning',
                description: 'No text content could be extracted from the PDF. The PDF might be scanned or contain only images.',
                variant: 'default',
              })
            } else {
              toast({
                title: 'Success',
                description: 'Text extracted successfully from PDF',
                variant: 'default',
              })
            }
          } catch (pdfError) {
            console.error('PDF extraction error:', pdfError)
            toast({
              title: 'PDF Extraction Warning',
              description: 'Could not extract text from PDF. The PDF might be scanned or contain only images. You can still upload it as an attachment.',
              variant: 'default',
            })
            text = ''
          }
        } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          text = await extractDocxText(selectedFile)
        }
        setExtractedText(text)
      } catch (error) {
        console.error('Text extraction error:', error)
        toast({
          title: 'Text extraction failed',
          description: 'Failed to extract text from the file. You can still upload it as an attachment.',
          variant: 'default',
        })
        setExtractedText('')
      }
    }
  }

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!editingPoll) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      let fileUrl = editingPoll.file_url
      let fileType = editingPoll.file_type

      // Upload new file if exists
      if (file) {
        // Delete old file if exists
        if (editingPoll.file_url) {
          const oldFileName = editingPoll.file_url.split('/').pop()
          if (oldFileName) {
            await supabase.storage
              .from('poll-files')
              .remove([oldFileName])
          }
        }

        const fileExt = file.name.split('.').pop()
        const fileName = `${user.id}/${Date.now()}.${fileExt}`.toLowerCase()

        const { error: uploadError } = await supabase.storage
          .from('poll-files')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
          })

        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage
          .from('poll-files')
          .getPublicUrl(fileName)

        fileUrl = publicUrl
        fileType = file.type
      }

      // Update poll
      const { error: pollError } = await supabase
        .from('polls')
        .update({
          question: values.question,
          option1: values.option1,
          option2: values.option2,
          option3: values.option3,
          option4: values.option4,
          file_url: fileUrl,
          file_type: fileType,
          extracted_text: extractedText,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingPoll.id)

      if (pollError) throw pollError

      toast({
        title: 'Success',
        description: 'Poll updated successfully',
      })

      setIsEditDialogOpen(false)
      fetchPolls()
    } catch (error) {
      console.error('Error updating poll:', error)
      toast({
        title: 'Error',
        description: 'Failed to update poll',
        variant: 'destructive',
      })
    }
  }

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <div className="space-y-6">
      {polls.map((poll) => (
        <Card key={poll.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-medium">
                {poll.question}
              </CardTitle>
              <div className="space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(poll)}
                >
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(poll.id, poll.file_url)}
                >
                  Delete
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* File Preview */}
            {poll.file_url && (
              <div className="mb-4">
                {poll.file_type?.startsWith('image/') ? (
                  <img
                    src={poll.file_url}
                    alt="Poll attachment"
                    className="w-full h-auto max-h-64 object-contain rounded-lg"
                  />
                ) : poll.file_type === 'application/pdf' ? (
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <span className="text-sm font-medium">PDF Document</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/poll-files/${poll.file_url}`, '_blank')}
                      >
                        Download
                      </Button>
                    </div>
                    {poll.extracted_text && (
                      <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                        {poll.extracted_text}
                      </p>
                    )}
                  </div>
                ) : poll.file_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? (
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="text-sm font-medium">Word Document</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/poll-files/${poll.file_url}`, '_blank')}
                      >
                        Download
                      </Button>
                    </div>
                    {poll.extracted_text && (
                      <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                        {poll.extracted_text}
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Edit Poll</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="question"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">Question</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your question" {...field} className="text-base" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* File Upload */}
                <div className="space-y-2">
                  <FormLabel className="text-base">Change Attachment (Optional)</FormLabel>
                  <Input
                    type="file"
                    accept=".pdf,.docx,.jpg,.jpeg,.png"
                    onChange={handleFileChange}
                    className="text-base"
                  />
                </div>

                {/* File Preview or Extracted Text */}
                {(filePreview || extractedText) && (
                  <div className="mt-4 space-y-4">
                    {filePreview && (
                      <div className="border rounded-lg p-4">
                        <img
                          src={filePreview}
                          alt="Preview"
                          className="max-w-full h-auto max-h-64 rounded-lg mx-auto"
                        />
                      </div>
                    )}
                    {extractedText && (
                      <div className="border rounded-lg p-4">
                        <Textarea
                          value={extractedText}
                          readOnly
                          className="h-32 text-base"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Options */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {['option1', 'option2', 'option3', 'option4'].map((option, index) => (
                    <FormField
                      key={option}
                      control={form.control}
                      name={option as keyof z.infer<typeof formSchema>}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base">Option {index + 1}</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder={`Enter option ${index + 1}`} 
                              {...field} 
                              className="text-base"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Save Changes</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
} 