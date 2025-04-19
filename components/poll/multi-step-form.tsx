'use client'

import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { Plus, Trash2 } from 'lucide-react'

const formSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be less than 200 characters'),
  category: z.string().min(1, 'Category is required'),
  endDate: z.date(),
  options: z.array(z.object({
    text: z.string().min(1, 'Option text is required').max(100, 'Option text must be less than 100 characters'),
    image: z.any().optional(),
  })).min(2, 'At least 2 options are required'),
  descriptionFile: z.any().optional(),
})

type FormData = z.infer<typeof formSchema>

export function MultiStepPollForm() {
  const [currentStep, setCurrentStep] = useState(1)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClientComponentClient()
  const { toast } = useToast()

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      category: '',
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      options: [{ text: '', image: null }, { text: '', image: null }],
      descriptionFile: null,
    },
  })

  const handleOptionImageChange = async (index: number, file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Image must be less than 2MB',
        variant: 'destructive',
      })
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const options = form.getValues('options')
      options[index].image = file
      form.setValue('options', options)
    }
    reader.readAsDataURL(file)
  }

  const handleDescriptionFileChange = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'File must be less than 5MB',
        variant: 'destructive',
      })
      return
    }

    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => setFilePreview(e.target?.result as string)
      reader.readAsDataURL(file)
    }

    form.setValue('descriptionFile', file)
  }

  const addOption = () => {
    const options = form.getValues('options')
    form.setValue('options', [...options, { text: '', image: null }])
  }

  const removeOption = (index: number) => {
    const options = form.getValues('options')
    if (options.length > 2) {
      form.setValue('options', options.filter((_, i) => i !== index))
    }
  }

  const onSubmit = async (data: FormData) => {
    try {
      setIsLoading(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Upload option images
      const optionImageUrls = await Promise.all(
        data.options.map(async (option) => {
          if (option.image) {
            const fileExt = option.image.name.split('.').pop()
            const fileName = `${user.id}/options/${Date.now()}-${Math.random()}.${fileExt}`.toLowerCase()

            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('poll-option-images')
              .upload(fileName, option.image)

            if (uploadError) throw uploadError

            const { data: { publicUrl } } = supabase.storage
              .from('poll-option-images')
              .getPublicUrl(fileName)

            return publicUrl
          }
          return null
        })
      )

      // Upload description file
      let descriptionFileUrl = null
      if (data.descriptionFile) {
        const fileExt = data.descriptionFile.name.split('.').pop()
        const fileName = `${user.id}/descriptions/${Date.now()}.${fileExt}`.toLowerCase()

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('poll-description-files')
          .upload(fileName, data.descriptionFile)

        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage
          .from('poll-description-files')
          .getPublicUrl(fileName)

        descriptionFileUrl = publicUrl
      }

      // Create poll
      const { data: poll, error: pollError } = await supabase
        .from('polls')
        .insert({
          user_id: user.id,
          title: data.title,
          category: data.category,
          end_date: data.endDate,
          description_file_url: descriptionFileUrl,
          description_file_type: data.descriptionFile?.type || null,
        })
        .select()
        .single()

      if (pollError) throw pollError

      // Create options
      const { error: optionsError } = await supabase
        .from('poll_options')
        .insert(
          data.options.map((option, index) => ({
            poll_id: poll.id,
            text: option.text,
            image_url: optionImageUrls[index],
          }))
        )

      if (optionsError) throw optionsError

      toast({
        title: 'Poll created successfully',
        variant: 'default',
      })

      // Reset form
      form.reset()
      setFilePreview(null)
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

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="title"
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
              name="category"
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
                      <SelectItem value="politics">Politics</SelectItem>
                      <SelectItem value="technology">Technology</SelectItem>
                      <SelectItem value="entertainment">Entertainment</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="endDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>End Date</FormLabel>
                  <FormControl>
                    <DatePicker
                      date={field.value}
                      setDate={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )

      case 2:
        return (
          <div className="space-y-4">
            {form.getValues('options').map((_, index) => (
              <div key={index} className="space-y-2">
                <FormField
                  control={form.control}
                  name={`options.${index}.text`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Option {index + 1}</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input placeholder={`Enter option ${index + 1}`} {...field} />
                        </FormControl>
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(e) => e.target.files?.[0] && handleOptionImageChange(index, e.target.files[0])}
                          className="w-32"
                        />
                        {form.getValues('options').length > 2 && (
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            onClick={() => removeOption(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ))}
            <Button type="button" onClick={addOption} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Option
            </Button>
          </div>
        )

      case 3:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <FormLabel>Description File (Optional)</FormLabel>
              <Input
                type="file"
                accept=".pdf,.docx,.jpg,.jpeg,.png"
                onChange={(e) => e.target.files?.[0] && handleDescriptionFileChange(e.target.files[0])}
              />
            </div>

            {filePreview && (
              <img
                src={filePreview}
                alt="Preview"
                className="max-w-full h-auto max-h-64 rounded"
              />
            )}

            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Poll Preview</h3>
              <p className="font-medium">{form.getValues('title')}</p>
              <p className="text-sm text-muted-foreground">
                Category: {form.getValues('category')}
              </p>
              <p className="text-sm text-muted-foreground">
                Ends: {form.getValues('endDate').toLocaleDateString()}
              </p>
              <div className="space-y-2">
                {form.getValues('options').map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input type="radio" name="preview" disabled />
                    <span>{option.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <Card className="p-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {renderStep()}

          <div className="flex justify-between">
            {currentStep > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentStep(currentStep - 1)}
              >
                Back
              </Button>
            )}
            {currentStep < 3 ? (
              <Button
                type="button"
                onClick={() => setCurrentStep(currentStep + 1)}
                className="ml-auto"
              >
                Next
              </Button>
            ) : (
              <Button type="submit" disabled={isLoading} className="ml-auto">
                {isLoading ? 'Creating...' : 'Create Poll'}
              </Button>
            )}
          </div>
        </form>
      </Form>
    </Card>
  )
} 