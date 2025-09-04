// src/app/actions.ts
'use server';

import * as XLSX from 'xlsx';
import { processDataFrames } from '@/lib/excel-processor';
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

// Type for the file data structure expected by the processor
type DataFrames = { [key: string]: any[] };

type SpedInfo = {
    cnpj: string;
    companyName: string;
    competence: string;
}

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

const parseSpedInfo = (spedLine: string): SpedInfo | null => {    
    if (!spedLine || !spedLine.startsWith('|0000|')) {
        return null;
    }
    
    const parts = spedLine.split('|');
    if (parts.length < 10) {
        return null;
    }
    
    // Indices based on the provided pattern:
    // |0000|019|0|01082025|31082025|PNEUZAO COMERCIO LTDA|44591157000457||SP|...
    //   0    1  2    3        4             5                  6         7  8
    const startDate = parts[4]; // Using start date for competence
    const companyName = parts[6];
    const cnpj = parts[7];

    if (!startDate || !companyName || !cnpj || startDate.length !== 8) {
        return null;
    }

    const month = startDate.substring(2, 4);
    const year = startDate.substring(4, 8);
    const competence = `${month}/${year}`;

    return { cnpj, companyName, competence };
};


export async function processUploadedFiles(formData: FormData) {
  try {
    const dataFrames: DataFrames = {};
    let allSpedKeys: string[] = [];
    let spedInfo: SpedInfo | null = null;
    let spedFileContent = '';

    const fileEntries = formData.getAll('files') as File[];

    for (const file of fileEntries) {
        const fieldName = file.name; // Name assigned on client
        
        if (fieldName === 'SPED TXT') {
            spedFileContent = await file.text();
        } else {
             if (!dataFrames[fieldName]) {
                dataFrames[fieldName] = [];
            }
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            for (const sheetName of workbook.SheetNames) {
              const worksheet = workbook.Sheets[sheetName];
              const jsonData = XLSX.utils.sheet_to_json(worksheet);
              dataFrames[fieldName].push(...jsonData);
            }
        }
    }

    if (spedFileContent) {
        const lines = spedFileContent.split('\n');
        const keyPattern = /\b\d{44}\b/g;
        
        if (lines.length > 0 && lines[0]) {
            spedInfo = parseSpedInfo(lines[0].trim());
        }
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            const matches = trimmedLine.match(keyPattern);
            if (matches) {
                allSpedKeys.push(...matches);
            }
        }
    }
    
    const processedData = processDataFrames(dataFrames);

    let keyCheckResults = null;
    let keysNotFoundInTxt: string[] = [];
    if (allSpedKeys.length > 0 && processedData['Chaves Válidas']) {
        const spreadsheetKeysArray = processedData['Chaves Válidas'].map(row => String(row['Chave de acesso']).trim()).filter(key => key);
        const spreadsheetKeys = new Set(spreadsheetKeysArray);
        
        const keysInTxt = new Set(allSpedKeys);

        keysNotFoundInTxt = [...spreadsheetKeys].filter(key => !keysInTxt.has(key));
        const keysInTxtNotInSheet = [...keysInTxt].filter(key => !spreadsheetKeys.has(key));
        
        const duplicateKeysInSheet = findDuplicates(spreadsheetKeysArray);
        const duplicateKeysInTxt = findDuplicates(allSpedKeys);

        keyCheckResults = { 
            keysNotFoundInTxt, 
            keysInTxtNotInSheet,
            duplicateKeysInSheet,
            duplicateKeysInTxt,
        };
    }
    
    if (spedInfo && spedInfo.cnpj) {
      const validKeys = processedData['Chaves Válidas']?.map(row => row['Chave de acesso']) || [];
      const verificationData = {
        ...spedInfo,
        validKeys,
        keysNotFoundInSped: keysNotFoundInTxt, // Storing the missing keys
        verifiedAt: serverTimestamp(),
      };
      // Use the CNPJ as the document ID for easy updates (upsert)
      await setDoc(doc(db, "verifications", spedInfo.cnpj), verificationData, { merge: true });
    }

    return { data: processedData, keyCheckResults };
  } catch (error: any) {
    console.error('Error processing files:', error);
    return { error: error.message || 'An unexpected error occurred during file processing.' };
  }
}
