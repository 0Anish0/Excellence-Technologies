import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { useDropzone } from "react-dropzone";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/lib/supabase/client";
import { Poll, PollOption } from "@/types/poll";

const pollSchema = z.object({
  title: z.string().max(200).min(1),
  category: z.enum(["Politics", "Technology", "Entertainment", "Other"]),
  endDate: z.date(),
  options: z.array(z.object({
    text: z.string().max(100).min(1),
    image: z.any().optional(),
  })).min(2),
  descriptionFile: z.any().optional(),
});

type PollFormData = z.infer<typeof pollSchema>;

interface CreatePollFormProps {
  initialData?: Poll & { poll_options: PollOption[] };
}

export function CreatePollForm({ initialData }: CreatePollFormProps) {
  const [step, setStep] = useState(1);
  const [options, setOptions] = useState<{ text: string; image?: File }[]>(
    initialData?.poll_options.map(opt => ({
      text: opt.text,
      image: opt.image_url ? new File([], opt.image_url) : undefined
    })) || []
  );
  const [descriptionFile, setDescriptionFile] = useState<File | null>(null);
  const { toast } = useToast();
  const supabase = createClient();

  const form = useForm<PollFormData>({
    resolver: zodResolver(pollSchema),
    defaultValues: {
      title: initialData?.title || "",
      category: (initialData?.category as any) || "Other",
      endDate: initialData?.end_date ? new Date(initialData.end_date) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      options: [],
    },
  });

  const { getRootProps, getInputProps } = useDropzone({
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxSize: 5 * 1024 * 1024, // 5MB
    onDrop: (acceptedFiles) => {
      setDescriptionFile(acceptedFiles[0]);
    },
  });

  const addOption = () => {
    setOptions([...options, { text: "" }]);
  };

  const removeOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleOptionChange = (index: number, field: "text" | "image", value: string | File | null) => {
    const newOptions = [...options]
    if (field === "image" && value === null) {
      newOptions[index] = { ...newOptions[index], image: undefined }
    } else if (field === "image" && value instanceof File) {
      newOptions[index] = { ...newOptions[index], image: value }
    } else if (field === "text" && typeof value === "string") {
      newOptions[index] = { ...newOptions[index], text: value }
    }
    setOptions(newOptions)
  };

  const onSubmit = async (data: PollFormData) => {
    try {
      // Upload description file if exists
      let fileUrl = null;
      if (descriptionFile) {
        const { data: fileData, error: fileError } = await supabase.storage
          .from("poll-files")
          .upload(`${Date.now()}-${descriptionFile.name}`, descriptionFile);
        
        if (fileError) throw fileError;
        fileUrl = fileData.path;
      }

      // Create or update poll in database
      const pollData = {
        title: data.title,
        category: data.category,
        end_date: data.endDate,
        description_file: fileUrl,
      };

      let pollId: string;

      if (initialData) {
        // Update existing poll
        const { error: updateError } = await supabase
          .from("polls")
          .update(pollData)
          .eq("id", initialData.id);

        if (updateError) throw updateError;
        pollId = initialData.id;

        // Delete existing options
        const { error: deleteError } = await supabase
          .from("poll_options")
          .delete()
          .eq("poll_id", initialData.id);

        if (deleteError) throw deleteError;
      } else {
        // Create new poll
        const { data: newPoll, error: createError } = await supabase
          .from("polls")
          .insert(pollData)
          .select()
          .single();

        if (createError) throw createError;
        pollId = newPoll.id;
      }

      // Create options
      const optionsData = options.map((option) => ({
        poll_id: pollId,
        text: option.text,
        image_url: option.image ? URL.createObjectURL(option.image) : null,
      }));

      const { error: optionsError } = await supabase
        .from("poll_options")
        .insert(optionsData);

      if (optionsError) throw optionsError;

      toast({
        title: "Success",
        description: initialData ? "Poll updated successfully" : "Poll created successfully",
      });

      window.location.href = "/admin";
    } catch (error) {
      toast({
        title: "Error",
        description: initialData ? "Failed to update poll" : "Failed to create poll",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>{initialData ? "Edit Poll" : "Create New Poll"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <Input {...form.register("title")} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <Select {...form.register("category")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Politics">Politics</SelectItem>
                    <SelectItem value="Technology">Technology</SelectItem>
                    <SelectItem value="Entertainment">Entertainment</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Date</label>
                <DatePicker {...form.register("endDate")} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {options.map((option, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={option.text}
                    onChange={(e) => handleOptionChange(index, "text", e.target.value)}
                    placeholder="Option text"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        handleOptionChange(index, "image", file)
                      } else {
                        handleOptionChange(index, "image", null)
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => removeOption(index)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button type="button" onClick={addOption}>
                Add Option
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div {...getRootProps()} className="border-2 border-dashed p-4 text-center">
                <input {...getInputProps()} />
                <p>Drag and drop description file here, or click to select</p>
                {descriptionFile && (
                  <p className="mt-2">Selected file: {descriptionFile.name}</p>
                )}
              </div>
              {descriptionFile && (
                <div className="mt-4">
                  <h3 className="font-medium mb-2">Preview</h3>
                  <div className="border p-4 rounded">
                    <h4 className="font-medium">{form.watch("title")}</h4>
                    <p className="text-sm text-gray-500">
                      Category: {form.watch("category")}
                    </p>
                    <p className="text-sm text-gray-500">
                      End Date: {form.watch("endDate")?.toLocaleDateString()}
                    </p>
                    <div className="mt-4">
                      {options.map((option, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input type="radio" disabled />
                          <span>{option.text}</span>
                          {option.image && (
                            <img
                              src={URL.createObjectURL(option.image)}
                              alt="Option"
                              className="w-10 h-10 object-cover"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between">
            {step > 1 && (
              <Button type="button" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            {step < 3 ? (
              <Button type="button" onClick={() => setStep(step + 1)}>
                Next
              </Button>
            ) : (
              <Button type="submit">Submit</Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
} 