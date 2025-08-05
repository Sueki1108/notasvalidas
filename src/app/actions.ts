
'use server';

import * as XLSX from 'xlsx';
import { processDataFrames } from '@/lib/excel-processor';

// Type for the file data structure expected by the processor
type DataFrames = { [key: string]: any[] };

const findDuplicates = (arr: string[]): string[] => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const item of arr) {
        if (seen.has(item)) {
            duplicates.add(item);
        } else {
            seen.add(item);
        }
    }
    return Array.from(duplicates);
};


export async function processUploadedFiles(formData: FormData) {
  try {
    const dataFrames: DataFrames = {};
    const fileEntries = formData.getAll('files');
    const textFileContents: string[] = [];

    // Process all file entries from formData
    for (const entry of formData.entries()) {
        const key = entry[0];
        const value = entry[1];

        if (value instanceof File) {
            // This is how files are sent from the client
            const fieldName = value.name; // The original field name is stored in the file name
            if (!dataFrames[fieldName]) {
                dataFrames[fieldName] = [];
            }
            const buffer = await value.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            dataFrames[fieldName].push(...jsonData);
        } else if (key === 'SPED TXT' && typeof value === 'string') {
             // This handles text file content
             textFileContents.push(value);
        }
    }
    
    const combinedTextContent = textFileContents.join('\n');
    
    const processedData = processDataFrames(dataFrames);

    let keyCheckResults = null;
    if (combinedTextContent && processedData['Chaves Válidas']) {
        const spreadsheetKeysArray = processedData['Chaves Válidas'].map(row => String(row['Chave de acesso']).trim()).filter(key => key);
        const spreadsheetKeys = new Set(spreadsheetKeysArray);
        
        const normalizedText = combinedTextContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const keyPattern = /\b\d{44}\b/g;
        const allKeysInTxt = normalizedText.match(keyPattern) || [];
        const keysInTxt = new Set(allKeysInTxt);

        const keysNotFoundInTxt = [...spreadsheetKeys].filter(key => !keysInTxt.has(key));
        const keysInTxtNotInSheet = [...keysInTxt].filter(key => !spreadsheetKeys.has(key));
        
        const duplicateKeysInSheet = findDuplicates(spreadsheetKeysArray);
        const duplicateKeysInTxt = findDuplicates(allKeysInTxt);

        keyCheckResults = { 
            keysNotFoundInTxt, 
            keysInTxtNotInSheet,
            duplicateKeysInSheet,
            duplicateKeysInTxt,
        };
    }

    return { data: processedData, keyCheckResults };
  } catch (error: any) {
    console.error('Error processing files:', error);
    // Ensure we return a serializable error object
    return { error: error.message || 'An unexpected error occurred during file processing.' };
  }
}

