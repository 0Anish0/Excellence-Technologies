import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import mammoth from 'mammoth'
import { Document, Packer, Paragraph, TextRun } from 'docx'

// Set the worker source
GlobalWorkerOptions.workerSrc = '//cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js'

export async function extractPdfText(file: File): Promise<string> {
    try {
        const arrayBuffer = await file.arrayBuffer()
        const pdf = await getDocument(arrayBuffer).promise
        let text = ''
        
        // Extract text from each page
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i)
            const content = await page.getTextContent()
            const pageText = content.items
                .map((item: any) => item.str)
                .join(' ')
            text += pageText + '\n'
        }
        
        return text.trim() || 'No text content found in the PDF.'
    } catch (error) {
        console.error('PDF extraction error:', error)
        throw new Error('Failed to extract text from PDF')
    }
}

export async function extractDocxText(file: File): Promise<string> {
    try {
        const arrayBuffer = await file.arrayBuffer()
        const result = await mammoth.extractRawText({ arrayBuffer })
        return result.value.trim() || 'No text content found in the DOCX.'
    } catch (error) {
        console.error('DOCX extraction error:', error)
        throw new Error('Failed to extract text from DOCX')
    }
}