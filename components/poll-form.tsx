'use client'

import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
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
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Calendar } from './ui/calendar'
import { format } from 'date-fns'
import { CalendarIcon, Download } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { cn } from '@/lib/utils'
import { useToast } from './ui/use-toast'
import { extractPdfText, extractDocxText } from '@/lib/extractText'
import { Progress } from './ui/progress'

// Step 1: Basic Details Schema
const basicDetailsSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be less than 200 characters'),
  category: z.enum(['Politics', 'Technology', 'Entertainment', 'Other']),
  endDate: z.date(),
})

// Step 2: Options Schema
const optionSchema = z.object({
  text: z.string().min(1, 'Option text is required').max(100, 'Option text must be less than 100 characters'),
  image: z.any().optional(),
})

// Add unique option validation
const optionsSchema = z.array(optionSchema)
  .min(2, 'At least 2 options are required')
  .refine((options) => {
    const texts = options.map(option => option.text.toLowerCase())
    return new Set(texts).size === texts.length
  }, {
    message: 'Option texts must be unique',
    path: ['options'],
  })

// Step 3: Description Schema
const descriptionSchema = z.object({
  file: z.any().optional(),
  extractedText: z.string().optional(),
})

const formSchema = z.object({
  basicDetails: basicDetailsSchema,
  options: optionsSchema,
  description: descriptionSchema,
})

type FormValues = z.infer<typeof formSchema>

export function PollForm() {
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [extractedText, setExtractedText] = useState<string>('')
  const [fileName, setFileName] = useState<string>('')
  const supabase = createClientComponentClient()
  const { toast } = useToast()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      basicDetails: {
        title: '',
        category: 'Politics',
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      },
      options: [
        { text: '', image: null },
        { text: '', image: null },
      ],
      description: {
        file: null,
        extractedText: '',
      },
    },
  })

  const handleDescriptionFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return

    const file = e.target.files[0]
    const fileType = file.type

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
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload a file smaller than 5MB',
        variant: 'destructive',
      })
      return
    }

    setFileName(file.name)

    // Handle image preview
    if (fileType.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => setFilePreview(e.target?.result as string)
      reader.readAsDataURL(file)
    }

    // Handle text extraction
    if (fileType === 'application/pdf' || fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      try {
        let text = ''
        if (fileType === 'application/pdf') {
          text = await extractPdfText(file)
        } else {
          text = await extractDocxText(file)
        }
        
        if (!text) {
          toast({
            title: 'Warning',
            description: 'No text content could be extracted from the file.',
            variant: 'default',
          })
        } else {
          setExtractedText(text)
          form.setValue('description.extractedText', text)
          toast({
            title: 'Success',
            description: 'Text extracted successfully',
            variant: 'default',
          })
        }
      } catch (error) {
        console.error('Text extraction error:', error)
        toast({
          title: 'Text Extraction Warning',
          description: 'Could not extract text from the file. The file might be scanned or contain only images.',
          variant: 'default',
        })
      }
    }

    form.setValue('description.file', file)
  }

  const addOption = () => {
    const currentOptions = form.getValues('options')
    form.setValue('options', [...currentOptions, { text: '', image: null }])
  }

  const removeOption = (index: number) => {
    const currentOptions = form.getValues('options')
    if (currentOptions.length > 2) {
      form.setValue('options', currentOptions.filter((_, i) => i !== index))
    }
  }

  const handleImageUpload = async (file: File, index: number) => {
    if (!file) return

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg']
    if (!validTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a JPG, JPEG, or PNG file',
        variant: 'destructive',
      })
      return
    }

    // Validate file size (max 2MB)
    const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB in bytes
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: 'File too large',
        description: 'Please upload a file smaller than 2MB',
        variant: 'destructive',
      })
      return
    }

    const currentOptions = form.getValues('options')
    currentOptions[index].image = file
    form.setValue('options', currentOptions)
  }

  const onSubmit = async (values: FormValues) => {
    try {
      setIsLoading(true)
      console.log('Starting poll creation with values:', values)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.error('User not authenticated')
        throw new Error('Not authenticated')
      }
      console.log('User authenticated:', user.id)

      // Upload description file if exists
      let descriptionFileUrl = null
      let descriptionFileType = null
      if (values.description.file) {
        console.log('Processing description file:', values.description.file.name)
        const fileExt = values.description.file.name.split('.').pop()
        const fileName = `${user.id}/description/${Date.now()}.${fileExt}`.toLowerCase()

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('poll-files')
          .upload(fileName, values.description.file)

        if (uploadError) {
          console.error('Description file upload error:', uploadError)
          throw uploadError
        }

        const { data: { publicUrl } } = supabase.storage
          .from('poll-files')
          .getPublicUrl(fileName)

        descriptionFileUrl = publicUrl
        descriptionFileType = values.description.file.type
        console.log('Description file uploaded successfully:', publicUrl)
      }

      // Upload option images if any
      console.log('Processing option images...')
      const imageUrls = await Promise.all(
        values.options.map(async (option, index) => {
          if (option.image) {
            console.log(`Processing image for option ${index + 1}:`, option.image.name)
            const fileExt = option.image.name.split('.').pop()
            const fileName = `${user.id}/options/${Date.now()}-${index}.${fileExt}`.toLowerCase()

            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('poll-images')
              .upload(fileName, option.image)

            if (uploadError) {
              console.error(`Error uploading image for option ${index + 1}:`, uploadError)
              throw uploadError
            }

            const { data: { publicUrl } } = supabase.storage
              .from('poll-images')
              .getPublicUrl(fileName)

            console.log(`Image uploaded successfully for option ${index + 1}:`, publicUrl)
            return publicUrl
          }
          return null
        })
      )

      // Create poll
      const pollDataToInsert = {
        user_id: user.id,
        title: values.basicDetails.title,
        question: values.basicDetails.title,
        category: values.basicDetails.category,
        end_date: values.basicDetails.endDate,
        description_file_url: descriptionFileUrl,
        description_file_type: descriptionFileType,
        description_text: values.description.extractedText,
        status: 'active',
      }
      
      console.log('Creating poll with data:', pollDataToInsert)

      const { data: pollData, error: pollError } = await supabase
        .from('polls')
        .insert(pollDataToInsert)
        .select('*')
        .single()

      if (pollError) {
        console.error('Error creating poll:', {
          error: pollError,
          message: pollError.message,
          details: pollError.details,
          hint: pollError.hint,
          code: pollError.code
        })
        throw pollError
      }
      console.log('Poll created successfully. Response data:', pollData)

      // Create poll options
      const optionsToInsert = values.options.map((option, index) => ({
        poll_id: pollData.id,
        text: option.text,
        image_url: imageUrls[index],
        position: index + 1,  // Store the order of options
      }))
      
      console.log('Creating poll options:', optionsToInsert)

      const { data: insertedOptions, error: optionsError } = await supabase
        .from('poll_options')
        .insert(optionsToInsert)
        .select('*')

      if (optionsError) {
        console.error('Error creating poll options:', {
          error: optionsError,
          message: optionsError.message,
          details: optionsError.details,
          hint: optionsError.hint,
          code: optionsError.code
        })
        // If options creation fails, delete the poll to maintain consistency
        await supabase.from('polls').delete().eq('id', pollData.id)
        throw optionsError
      }
      console.log('Poll options created successfully. Response data:', insertedOptions)

      toast({
        title: 'Poll created successfully',
        variant: 'default',
      })

      // Reset form
      form.reset()
      setStep(1)
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

  const nextStep = async () => {
    if (step === 1) {
      const result = await form.trigger('basicDetails')
      if (result) setStep(2)
    } else if (step === 2) {
      const result = await form.trigger('options')
      if (result) setStep(3)
    }
  }

  const prevStep = () => {
    setStep(step - 1)
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Create New Poll</CardTitle>
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Step {step} of 3</span>
            <span>{Math.round((step / 3) * 100)}% Complete</span>
          </div>
          <Progress value={(step / 3) * 100} className="h-2" />
          <div className="flex justify-between text-sm">
            <span className={cn(step >= 1 && "text-primary font-medium")}>Basic Details</span>
            <span className={cn(step >= 2 && "text-primary font-medium")}>Options</span>
            <span className={cn(step >= 3 && "text-primary font-medium")}>Review</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {step === 1 && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="basicDetails.title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Poll Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter poll title" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="basicDetails.category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Politics">Politics</SelectItem>
                          <SelectItem value="Technology">Technology</SelectItem>
                          <SelectItem value="Entertainment">Entertainment</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="basicDetails.endDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>End Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date: Date) =>
                              date < new Date()
                            }
                            initialFocus
                            fromDate={new Date()}
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                {form.watch('options').map((_, index) => (
                  <div key={index} className="space-y-4 border p-4 rounded-lg">
                    <FormField
                      control={form.control}
                      name={`options.${index}.text`}
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

                    <FormItem>
                      <FormLabel>Image (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleImageUpload(file, index)
                          }}
                        />
                      </FormControl>
                    </FormItem>

                    {form.watch('options').length > 2 && (
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => removeOption(index)}
                      >
                        Remove Option
                      </Button>
                    )}
                  </div>
                ))}

                <Button type="button" onClick={addOption}>
                  Add Option
                </Button>

                <div className="space-y-4 border p-4 rounded-lg mt-4">
                  <h4 className="font-medium">Description File (Optional)</h4>
                  <FormItem>
                    <FormLabel>Upload Description File</FormLabel>
                    <FormControl>
                      <Input
                        type="file"
                        accept=".pdf,.docx,.jpg,.jpeg,.png"
                        onChange={handleDescriptionFileChange}
                      />
                    </FormControl>
                    <p className="text-sm text-muted-foreground mt-1">
                      Supported formats: PDF, DOCX, JPG, JPEG, PNG (max 5MB)
                    </p>
                  </FormItem>

                  {filePreview && (
                    <div className="mt-4">
                      <img
                        src={filePreview}
                        alt="Preview"
                        className="max-w-full h-auto max-h-64 rounded"
                      />
                    </div>
                  )}

                  {extractedText && (
                    <div className="mt-4">
                      <FormLabel>Extracted Text</FormLabel>
                      <Textarea
                        value={extractedText}
                        readOnly
                        className="h-32"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold">Review Your Poll</h3>
                
                <div className="space-y-4 border rounded-lg p-4">
                  <h4 className="font-medium">Basic Details</h4>
                  <div className="space-y-2">
                    <p><strong>Title:</strong> {form.watch('basicDetails.title')}</p>
                    <p><strong>Category:</strong> {form.watch('basicDetails.category')}</p>
                    <p><strong>End Date:</strong> {format(form.watch('basicDetails.endDate'), 'PPP')}</p>
                  </div>
                </div>

                <div className="space-y-4 border rounded-lg p-4">
                  <h4 className="font-medium">Options</h4>
                  <div className="grid gap-4">
                    {form.watch('options').map((option, index) => (
                      <div key={index} className="border rounded p-4">
                        <p className="font-medium">Option {index + 1}</p>
                        <p className="text-muted-foreground">{option.text}</p>
                        {option.image && (
                          <div className="mt-2">
                            <p className="text-sm text-muted-foreground">Image attached</p>
                            <img
                              src={URL.createObjectURL(option.image)}
                              alt={`Option ${index + 1} preview`}
                              className="mt-2 max-w-[200px] rounded"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 border rounded-lg p-4">
                  <h4 className="font-medium">Description</h4>
                  {form.watch('description.file') ? (
                    <div className="space-y-4">
                      <p><strong>File Name:</strong> {fileName}</p>
                      {form.watch('description.file').type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            const url = URL.createObjectURL(form.watch('description.file'))
                            window.open(url, '_blank')
                          }}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download DOCX
                        </Button>
                      )}
                      {filePreview && (
                        <div className="mt-4">
                          <img
                            src={filePreview}
                            alt="Preview"
                            className="max-w-full h-auto max-h-64 rounded"
                          />
                        </div>
                      )}
                      {extractedText && (
                        <div className="mt-4">
                          <FormLabel>Extracted Text</FormLabel>
                          <Textarea
                            value={extractedText}
                            readOnly
                            className="h-32"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No description file attached</p>
                  )}
                </div>
              </div>
            )}
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex justify-between">
        {step > 1 && (
          <Button
            type="button"
            variant="outline"
            onClick={prevStep}
            disabled={isLoading}
          >
            Back
          </Button>
        )}
        {step < 3 ? (
          <Button
            type="button"
            onClick={nextStep}
            disabled={isLoading}
          >
            Next
          </Button>
        ) : (
          <Button
            type="submit"
            onClick={form.handleSubmit(onSubmit)}
            disabled={isLoading}
          >
            {isLoading ? 'Creating...' : 'Create Poll'}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
} 