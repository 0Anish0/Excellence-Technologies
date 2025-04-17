# Exc-Tech Task 4

## Overview
Exc-Tech Task 4 is a modern web application that enables users to securely upload, manage, and extract text from PDF and DOCX files. Built with Next.js, Supabase, and a stylish React UI, it offers seamless authentication, robust file handling, and advanced text extraction capabilities, all wrapped in an intuitive and responsive interface.

---

## Features
- **User Authentication:** Secure sign-up, login, and email confirmation powered by Supabase Auth.
- **File Upload & Management:** Drag-and-drop or select PDF/DOCX files (max 5MB each), with real-time feedback and error handling.
- **Storage:** Files are uploaded to Supabase Storage and metadata is tracked in a PostgreSQL database.
- **File Listing:** View, download, and delete your uploaded files in a clean, organized list.
- **Text Extraction:** Instantly extract and view text from PDF and DOCX files using modern parsing libraries.
- **Responsive UI:** Mobile-first, accessible design with stylish components and smooth interactions.

---

## Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/0Anish0/exc-tech-task4.git
cd exc-tech-task4
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment
Create a `.env.local` file at the root with your Supabase credentials:
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 4. Run the Development Server
```bash
npm run dev
```
Visit [http://localhost:3000](http://localhost:3000) in your browser.

---

## Authentication Flow
- **Sign Up:** Register with your email and password. A confirmation email is sent for verification.
- **Login:** Enter your credentials to access the upload dashboard. Unconfirmed emails are prompted to resend confirmation.
- **Session Management:** Auth state is checked on protected routes; unauthenticated users are redirected to login.

---

## File Upload & Management
- **Upload:** Drag and drop or select PDF/DOCX files. Only valid types and files under 5MB are accepted.
- **Storage:** Files are uploaded to Supabase Storage under a user-specific path. Metadata (filename, type, size, storage path) is saved in the `uploaded_files` table.
- **List Files:** View all your uploaded files with details.
- **Download:** Retrieve files directly from Supabase Storage.
- **Delete:** Remove files from both storage and the database.

---

## Text Extraction
- **Supported Formats:** PDF and DOCX.
- **How it Works:**
  - Click "Convert to Text" on any uploaded file.
  - The file is downloaded from storage and parsed client-side using modern libraries.
  - Extracted text is displayed in a modal for easy viewing and copying.
- **Libraries Used:**
  - [pdfjs-dist](https://github.com/mozilla/pdfjs-dist) for PDFs
  - [mammoth.js](https://github.com/mwilliamson/mammoth.js) for DOCX

---

## UI/UX Highlights
- **Modern Design:** Built with Tailwind CSS and custom React components for a clean, professional look.
- **Accessibility:** Keyboard navigation, ARIA labels, and color contrast for inclusive use.
- **Feedback:** Real-time toasts, loading indicators, and error messages for smooth user experience.

---

## Troubleshooting
- **File Upload Fails:** Ensure your file is a PDF or DOCX and under 5MB.
- **Authentication Issues:** Check your email for confirmation or try resending the confirmation link.
- **Text Extraction Errors:** Only supported for PDF/DOCX; ensure the file is not corrupted.
- **Supabase Errors:** Verify your environment variables and Supabase project setup.

---

## Contributing
1. Fork the repository.
2. Create a new branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a pull request.

---

## Credits
- [Next.js](https://nextjs.org/)
- [Supabase](https://supabase.com/)
- [React Dropzone](https://react-dropzone.js.org/)
- [pdfjs-dist](https://github.com/mozilla/pdfjs-dist)
- [mammoth.js](https://github.com/mwilliamson/mammoth.js)
- [Tailwind CSS](https://tailwindcss.com/)

---

## License
MIT