'use server';

import * as XLSX from 'xlsx';
import { processDataFrames } from '@/lib/excel-processor';

// Type for the file data structure expected by the processor
type DataFrames = { [key: string]: any[] };

export async function processUploadedFiles(formData: FormData) {
  try {
    const dataFrames: DataFrames = {};
    const textFile = formData.get('textFile') as File | null;
    const fileEntries: { [key: string]: File[] } = {};

    for (const [key, value] of formData.entries()) {
        if (key === 'textFile') continue;
        if (!fileEntries[key]) {
            fileEntries[key] = [];
        }
        fileEntries[key].push(value as File);
    }

    for (const key in fileEntries) {
        const files = fileEntries[key];
        dataFrames[key] = [];
        for (const file of files) {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            dataFrames[key].push(...jsonData);
        }
    }

    const processedData = processDataFrames(dataFrames);
    
    let keyCheckResults = null;
    if (textFile && processedData['Chaves Válidas']) {
        const spreadsheetKeysArray = processedData['Chaves Válidas'].map(row => String(row['Chave de acesso']).trim()).filter(key => key);
        const spreadsheetKeys = new Set(spreadsheetKeysArray);

        const textContent = await textFile.text();
        const normalizedText = textContent.replace(/\\r\\n/g, '\\n').replace(/\\r/g, '');
        const keyPattern = /\\b\\d{44}\\b/g;
        const keysInTxt = new Set(normalizedText.match(keyPattern) || []);

        const keysNotFoundInTxt = [...spreadsheetKeys].filter(key => !keysInTxt.has(key));
        const keysInTxtNotInSheet = [...keysInTxt].filter(key => !spreadsheetKeys.has(key));
        
        keyCheckResults = { keysNotFoundInTxt, keysInTxtNotInSheet };
    }

    return { data: processedData, keyCheckResults };
  } catch (error: any) {
    console.error('Error processing files:', error);
    // Ensure we return a serializable error object
    return { error: error.message || 'An unexpected error occurred during file processing.' };
  }
}
