import mammoth from 'mammoth';
import * as PDFJS from 'pdfjs-dist';

// Initialize PDF.js
if (typeof window !== 'undefined') {
    // Use a more reliable way to load the worker
    const pdfjsWorker = require('pdfjs-dist/build/pdf.worker.entry');
    PDFJS.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

export async function extractPdfText(file: File): Promise<string> {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await PDFJS.getDocument({ 
            data: arrayBuffer,
            cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
            cMapPacked: true
        }).promise;
        
        let fullText = '';
        const numPages = pdf.numPages;

        for (let i = 1; i <= numPages; i++) {
            try {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items
                    .map((item: any) => item.str)
                    .join(' ');
                fullText += pageText + '\n';
            } catch (pageError) {
                console.error(`Error extracting text from page ${i}:`, pageError);
                // Continue with next page even if one page fails
                continue;
            }
        }

        return fullText.trim() || 'No text content found in the PDF.';
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