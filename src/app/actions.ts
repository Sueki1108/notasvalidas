'use server';

import * as XLSX from 'xlsx';
import { processDataFrames } from '@/lib/excel-processor';

// Type for the file data structure expected by the processor
type DataFrames = { [key: string]: any[] };

export async function processUploadedFiles(formData: FormData) {
  try {
    const files = formData.getAll('file') as File[];
    const fileNames = formData.getAll('fileName') as string[];

    const dataFrames: DataFrames = {};

    for (const [key, value] of formData.entries()) {
        const file = value as File;
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        dataFrames[key] = jsonData;
    }

    const processedData = processDataFrames(dataFrames);

    return { data: processedData };
  } catch (error: any) {
    console.error('Error processing files:', error);
    // Ensure we return a serializable error object
    return { error: error.message || 'An unexpected error occurred during file processing.' };
  }
}
