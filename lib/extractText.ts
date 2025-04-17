import mammoth from 'mammoth';
import * as PDFJS from 'pdfjs-dist';

// Initialize PDF.js
if (typeof window !== 'undefined') {
    PDFJS.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

export async function extractPdfText(file: File): Promise<string> {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await PDFJS.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
                .map((item: any) => item.str)
                .join(' ');
            fullText += pageText + '\n';
        }

        return fullText || 'No text content found in the PDF.';
    } catch (error: any) {
        console.error('PDF extraction error:', error);
        throw new Error(`Failed to extract text: ${error.message || 'Unknown error'}`);
    }
}

export async function extractDocxText(file: File): Promise<string> {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const { value } = await mammoth.extractRawText({ arrayBuffer });
        return value;
    } catch (error: any) {
        console.error('DOCX extraction error:', error);
        throw new Error(`Failed to extract text: ${error.message || 'Unknown error'}`);
    }
}