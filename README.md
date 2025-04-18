# Excellence Technologies - Task 5: Advanced Polling System

## Project Overview
This project is an advanced polling system developed as Task 5 for Excellence Technologies. It's a full-stack web application that allows users to create, manage, and participate in polls with rich media attachments and real-time results visualization.

## Tech Stack

### Frontend
- **Next.js 13+** - React framework with App Router
- **TypeScript** - For type-safe code
- **Tailwind CSS** - For styling
- **shadcn/ui** - For UI components
- **React Hook Form** - For form handling
- **Zod** - For form validation
- **Lucide React** - For icons

### Backend & Database
- **Supabase**
  - Authentication
  - PostgreSQL Database
  - Storage Bucket
  - Row Level Security (RLS)
- **Edge Functions** - For serverless functionality

### Key Libraries
- `@supabase/auth-helpers-nextjs` - Supabase authentication helpers
- `@supabase/supabase-js` - Supabase client
- `@radix-ui` - Headless UI components
- `@hookform/resolvers` - Form validation resolvers
- `class-variance-authority` - For component styling variants

## Features

### Authentication
- Email/Password authentication
- Protected routes using middleware
- Role-based access control (User/Admin)
- Secure session management

### User Management
- User registration with email
- Profile management
- Role-based permissions
  - Admin users: Full access to create and manage polls
  - Regular users: Can view and vote on polls

### Polling System
1. **Poll Creation (Admin)**
   - Create polls with questions and options
   - Add descriptions
   - Upload attachments (Images/PDF/DOCX)
   - Text extraction from documents
   - Real-time file preview

2. **Poll Management (Admin)**
   - Edit existing polls
   - Delete polls
   - View poll statistics
   - Manage poll attachments

3. **Voting System**
   - One vote per user per poll
   - Real-time vote counting
   - Percentage calculations
   - Visual results with progress bars

4. **File Handling**
   - Support for multiple file types:
     - Images (preview in polls)
     - PDF (with text extraction)
     - DOCX (with text extraction)
   - Secure file storage
   - File download functionality

### UI/UX Features
- Responsive design
- Dark/Light mode support
- Loading states
- Toast notifications
- Error handling
- Form validation
- Interactive components
- Smooth animations

## Database Structure

### Tables
1. **profiles**
   - User profile information
   - Role management (user/admin)

2. **polls**
   - Poll questions and options
   - File attachments
   - Metadata

3. **votes**
   - Vote tracking
   - User selections
   - Timestamps

4. **Storage**
   - `poll-files` bucket for attachments
   - Secure file access

## Security Features
- Row Level Security (RLS)
- Protected API routes
- Secure file uploads
- Role-based access control
- Input validation
- Error handling
- Content Security Policy

## Getting Started

### Prerequisites
- Node.js 16.8 or later
- Supabase account
- npm or yarn

### Environment Variables
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Installation
1. Clone the repository
```bash
git clone [repository-url]
cd [project-directory]
```

2. Install dependencies
```bash
npm install
# or
yarn install
```

3. Run the development server
```bash
npm run dev
# or
yarn dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Project Structure
```
├── app/
│   ├── auth/
│   │   ├── login/
│   │   ├── register/
│   │   └── callback/
│   ├── dashboard/
│   └── layout.tsx
├── components/
│   ├── ui/
│   ├── poll-form.tsx
│   ├── poll-list.tsx
│   └── my-polls.tsx
├── lib/
│   ├── utils.ts
│   └── supabase.ts
└── public/
```

## Key Features Implementation

### Poll Creation
- Form validation using Zod
- File upload handling
- Text extraction from documents
- Real-time preview

### Vote System
- Real-time vote tracking
- Vote count aggregation
- Percentage calculations
- Visual representation

### Admin Features
- Poll management interface
- File management
- User role management

## Future Enhancements
1. Advanced analytics
2. Poll categories
3. Poll scheduling
4. Email notifications
5. Social sharing
6. Comment system
7. Poll templates

## Contributing
1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License
This project is licensed under the MIT License

## Acknowledgments
- Excellence Technologies for the project opportunity
- Supabase for the backend infrastructure
- shadcn/ui for the component library
