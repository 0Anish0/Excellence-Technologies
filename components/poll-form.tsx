'use client'

import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { extractPdfText, extractDocxText } from '@/lib/extractText'
import { Button } from './ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './ui/form'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { useToast } from './ui/use-toast'
import { Card } from './ui/card'

const formSchema = z.object({
  question: z.string().min(1, 'Question is required'),
  option1: z.string().min(1, 'Option 1 is required'),
  option2: z.string().min(1, 'Option 2 is required'),
  option3: z.string().min(1, 'Option 3 is required'),
  option4: z.string().min(1, 'Option 4 is required'),
})

export function PollForm() {
  const [file, setFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [extractedText, setExtractedText] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClientComponentClient()
  const { toast } = useToast()

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return

    const selectedFile = e.target.files[0]
    const fileType = selectedFile.type

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
        description: 'Please upload a PDF, DOCX, or image file',
        variant: 'destructive',
      })
      return
    }

    setFile(selectedFile)

    // Handle image preview
    if (fileType.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => setFilePreview(e.target?.result as string)
      reader.readAsDataURL(selectedFile)
    }
    // Handle text extraction
    else {
      try {
        let text = ''
        if (fileType === 'application/pdf') {
          text = await extractPdfText(selectedFile)
        } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          text = await extractDocxText(selectedFile)
        }
        setExtractedText(text)
      } catch (error) {
        console.error('Text extraction error:', error)
        toast({
          title: 'Text extraction failed',
          description: 'Failed to extract text from the file',
          variant: 'destructive',
        })
      }
    }
  }

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setIsLoading(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      let fileUrl = null
      let fileType = null

      // Upload file if exists
      if (file) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${user.id}/${Date.now()}.${fileExt}`.toLowerCase()

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('poll-files')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
          })

        if (uploadError) {
          console.error('Upload error:', uploadError)
          throw new Error('Failed to upload file')
        }

        const { data: { publicUrl } } = supabase.storage
          .from('poll-files')
          .getPublicUrl(fileName)

        fileUrl = publicUrl
        fileType = file.type
      }

      // Create poll
      const { error: pollError } = await supabase
        .from('polls')
        .insert({
          user_id: user.id,
          question: values.question,
          option1: values.option1,
          option2: values.option2,
          option3: values.option3,
          option4: values.option4,
          file_url: fileUrl,
          file_type: fileType,
          extracted_text: extractedText,
        })

      if (pollError) throw pollError

      toast({
        title: 'Poll created successfully',
        variant: 'default',
      })

      // Reset form
      form.reset()
      setFile(null)
      setFilePreview(null)
      setExtractedText('')
    } catch (error) {
      console.error('Error creating poll:', error)
      toast({
        title: 'Failed to create poll',
        description: error instanceof Error ? error.message : 'Please try again later',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="p-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="question"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Question</FormLabel>
                <FormControl>
                  <Input placeholder="Enter your question" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* File Upload */}
          <div className="space-y-2">
            <FormLabel>Attachment (Optional)</FormLabel>
            <Input
              type="file"
              accept=".pdf,.docx,.jpg,.jpeg,.png"
              onChange={handleFileChange}
              disabled={isLoading}
            />
          </div>

          {/* File Preview or Extracted Text */}
          {(filePreview || extractedText) && (
            <div className="mt-4">
              {filePreview && (
                <img
                  src={filePreview}
                  alt="Preview"
                  className="max-w-full h-auto max-h-64 rounded"
                />
              )}
              {extractedText && (
                <Textarea
                  value={extractedText}
                  readOnly
                  className="h-32"
                />
              )}
            </div>
          )}

          {/* Options */}
          {['option1', 'option2', 'option3', 'option4'].map((option, index) => (
            <FormField
              key={option}
              control={form.control}
              name={option as keyof z.infer<typeof formSchema>}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Option {index + 1}</FormLabel>
                  <FormControl>
                    <Input placeholder={`Enter option ${index + 1}`} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}

          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Creating Poll...' : 'Create Poll'}
          </Button>
        </form>
      </Form>
    </Card>
  )
} 