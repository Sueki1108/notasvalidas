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
    
    const startDate = parts[4];
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

    const fileEntries = formData.getAll('files') as File[];

    for (const file of fileEntries) {
        const fieldName = file.name;
        
        if (fieldName === 'SPED TXT') {
             const fileContent = await file.text();
             const lines = fileContent.split('\n');
             const keyPattern = /\b\d{44}\b/g;
             let isFirstLine = true;
             
             for (const line of lines) {
                const trimmedLine = line.trim();
                if (isFirstLine && trimmedLine) {
                    spedInfo = parseSpedInfo(trimmedLine);
                    isFirstLine = false;
                }
                const matches = trimmedLine.match(keyPattern);
                if (matches) {
                    allSpedKeys.push(...matches);
                }
            }
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
    
    const processedData = processDataFrames(dataFrames);

    let keyCheckResults = null;
    if (allSpedKeys.length > 0 && processedData['Chaves Válidas']) {
        const spreadsheetKeysArray = processedData['Chaves Válidas'].map(row => String(row['Chave de acesso']).trim()).filter(key => key);
        const spreadsheetKeys = new Set(spreadsheetKeysArray);
        
        const keysInTxt = new Set(allSpedKeys);

        const keysNotFoundInTxt = [...spreadsheetKeys].filter(key => !keysInTxt.has(key));
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
        verifiedAt: serverTimestamp(),
      };
      await setDoc(doc(db, "verifications", spedInfo.cnpj), verificationData);
    }

    return { data: processedData, keyCheckResults };
  } catch (error: any) {
    console.error('Error processing files:', error);
    return { error: error.message || 'An unexpected error occurred during file processing.' };
  }
}
