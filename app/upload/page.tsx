"use client";
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { extractPdfText, extractDocxText } from '@/lib/extractText';
import Modal from '@/components/ui/modal';

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();
  const [extractedText, setExtractedText] = useState<string>('');
  const [showTextModal, setShowTextModal] = useState(false);
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
    console.log('Authenticated user:', user);
      if (!user) {
        router.push('/auth/login');
      }
    };
    checkAuth();
  }, [router]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const validFiles = acceptedFiles.filter(file => {
      const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      return validTypes.includes(file.type);
    });
    if (validFiles.length !== acceptedFiles.length) {
      toast.error('Only PDF and DOCX files are allowed');
    }
    setFiles(prevFiles => [...prevFiles, ...validFiles]);
    // No text extraction here
  }, []);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'image/jpeg': ['.jpg', '.jpeg']
    }
  });
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const validFiles = newFiles.filter(file => {
        const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        return validTypes.includes(file.type);
      });
      if (validFiles.length !== newFiles.length) {
        toast.error('Only PDF and DOCX files are allowed');
      }
      setFiles(prevFiles => [...prevFiles, ...validFiles]);
      // No text extraction here
    }
  };

  const handleRemoveFile = (index: number) => {
    const newFiles = [...files];
    newFiles.splice(index, 1);
    setFiles(newFiles);
  };

  const handleUpload = async () => {
    console.log('Starting file upload process');
    if (files.length === 0) {
      setError('Please select at least one file to upload');
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('Authenticated user:', user);
      
      if (!user) {
        router.push('/auth/login');
        return;
      }

      for (const file of files) {
        try {
          console.log('Processing file:', file.name);
          console.log('File size:', file.size);
          console.log('File type:', file.type);

          // Validate file size (max 5MB)
          if (file.size > 5 * 1024 * 1024) {
            throw new Error('File size exceeds 5MB limit');
          }

          const fileExt = file.name.split('.').pop();
          const fileName = `${Math.random()}.${fileExt}`.toLowerCase();
          const filePath = `${user.id}/${fileName}`.replace(/[^a-z0-9\/._-]/g, '');

          console.log('Uploading file to path:', filePath);
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('user-uploads')
            .upload(filePath, file, {
              cacheControl: '3600',
              contentType: file.type,
              upsert: true
            });

          if (uploadError) {
            console.error('Upload error:', uploadError);
            throw new Error(`File upload failed: ${uploadError.message}`);
          }
          console.log('Upload successful:', uploadData);

          console.log('Inserting file metadata into database');
          const { data: dbData, error: dbError } = await supabase
            .from('uploaded_files')
            .insert({
              user_id: user.id,
              filename: file.name,
              file_type: file.type,
              storage_path: filePath,
              file_size: file.size
            })
            .select();

          if (dbError) {
            console.error('Database error:', dbError);
            throw new Error(`Database insert failed: ${dbError.message}`);
          }
          console.log('Database insert successful:', dbData);
        } catch (fileError) {
          console.error('Error processing file:', file.name, fileError);
          throw fileError;
        }
      }

      setSuccess('Files uploaded successfully!');
      setFiles([]);
    } catch (err: any) {
      console.error('Upload process failed:', err);
      setError(err.message || 'Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    const fetchFiles = async () => {
      setLoadingFiles(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
    console.log('Authenticated user:', user);
        if (!user) return;

        const { data, error } = await supabase
          .from('uploaded_files')
          .select('*')
          .eq('user_id', user.id);

        if (error) throw error;
        setUploadedFiles(data || []);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch files');
      } finally {
        setLoadingFiles(false);
      }
    };

    fetchFiles();
  }, [success]);

  const handleDownload = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('user-uploads')
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Failed to download file');
    }
  };

  const handleDelete = async (filePath: string, id: string) => {
    try {
      const { error: storageError } = await supabase.storage
        .from('user-uploads')
        .remove([filePath]);

      if (storageError) throw storageError;

      console.log('Inserting file metadata into database');
    const { error: dbError } = await supabase
        .from('uploaded_files')
        .delete()
        .eq('id', id);

      if (dbError) throw dbError;

      setUploadedFiles(prev => prev.filter(file => file.id !== id));
      setSuccess('File deleted successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to delete file');
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">File Upload</h1>
      
      {error && (
        <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg">
          {error}
        </div>
      )}
      
      {success && (
        <div className="p-4 mb-4 text-sm text-green-700 bg-green-100 rounded-lg">
          {success}
        </div>
      )}
      
      <div className="mb-6">
        <div 
          {...getRootProps()} 
          className={`border-2 border-dashed rounded-lg p-8 text-center ${isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'}`}
        >
          <input {...getInputProps()} />
          {isDragActive ? (
            <p className="text-indigo-600">Drop the files here...</p>
          ) : (
            <div>
              <p className="text-sm text-gray-600 mb-2">Drag & drop files here, or click to select</p>
              <p className="text-xs text-gray-500 mb-4">(PDF, DOCX files only)</p>
              <button 
                type="button" 
                className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-md hover:bg-indigo-100"
              >
                Select Files
              </button>
            </div>
          )}
        </div>
      </div>
      
      {files.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-medium mb-2">Selected Files</h2>
          <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
            {files.map((file, index) => (
              <li key={index} className="flex items-center justify-between p-3">
                <div>
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-gray-500">
                    {file.type} - {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(index)}
                  className="text-red-600 hover:text-red-800 text-sm font-medium"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      <button
        onClick={handleUpload}
        disabled={uploading || files.length === 0}
        className={`px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${uploading || files.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {uploading ? 'Uploading...' : 'Upload Files'}
      </button>

      {uploadedFiles.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-bold mb-4">Your Uploaded Files</h2>
          <div className="divide-y divide-gray-200 border border-gray-200 rounded-md">
            {uploadedFiles.map((file) => (
              <div key={file.id} className="flex items-center justify-between p-3">
                <div>
                  <p className="text-sm font-medium">{file.filename}</p>
                  <p className="text-xs text-gray-500">
                    {file.file_type} - {(file.file_size / 1024).toFixed(2)} KB
                  </p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleDownload(file.storage_path, file.filename)}
                    className="px-3 py-1 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-md hover:bg-indigo-100"
                  >
                    Download
                  </button>
                  <button
                    onClick={() => handleDelete(file.storage_path, file.id)}
                    className="px-3 py-1 text-sm font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100"
                  >
                    Delete
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        let text = '';
                        // Download the file from storage
                        const { data, error } = await supabase.storage
                          .from('user-uploads')
                          .download(file.storage_path);
                        if (error) throw error;
                        const blob = data;
                        const fileObj = new File([blob], file.filename, { type: file.file_type });
                        if (file.file_type === 'application/pdf') {
                          text = await extractPdfText(fileObj);
                        } else if (file.file_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                          text = await extractDocxText(fileObj);
                        } else {
                          text = 'Unsupported file type for text extraction.';
                        }
                        setExtractedText(text);
                        setShowTextModal(true);
                      } catch (err) {
                        setExtractedText('Failed to extract text: ' + (err.message || err));
                        setShowTextModal(true);
                      }
                    }}
                    className="px-3 py-1 text-sm font-medium text-green-600 bg-green-50 rounded-md hover:bg-green-100"
                  >
                    Convert to Text
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loadingFiles && (
        <div className="mt-8 text-center">
          <p>Loading your files...</p>
        </div>
      )}
      <Modal open={showTextModal} onClose={() => setShowTextModal(false)}>
        <div className="p-4">
          <h2 className="text-lg font-bold mb-2">Extracted Text</h2>
          <textarea className="w-full h-64 border rounded p-2 text-sm" value={extractedText} readOnly />
          <button className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded" onClick={() => setShowTextModal(false)}>Close</button>
        </div>
      </Modal>
    </div>
  );
}