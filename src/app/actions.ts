// src/app/actions.ts
'use server';

import * as XLSX from 'xlsx';
import { processDataFrames } from '@/lib/excel-processor';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

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
    const keysInTxt = new Set(allSpedKeys);
    if (processedData['Chaves Válidas']) {
        const spreadsheetKeysArray = processedData['Chaves Válidas'].map(row => String(row['Chave de acesso']).trim()).filter(key => key);
        const spreadsheetKeys = new Set(spreadsheetKeysArray);
        
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
      const allProcessedKeys = processedData['Chaves Válidas']?.map(row => row['Chave de acesso']) || [];
      const keysNotFoundInSpedSet = new Set((keyCheckResults as any)?.keysNotFoundInTxt || []);

      const verificationKeys = allProcessedKeys.map(key => ({
        key: key,
        foundInSped: !keysNotFoundInSpedSet.has(key),
        comment: ''
      }));

      const verificationData = {
        ...spedInfo,
        keys: verificationKeys,
        verifiedAt: serverTimestamp(),
      };

      await setDoc(doc(db, "verifications", spedInfo.cnpj), verificationData, { merge: true });
    }

    return { data: processedData, keyCheckResults, spedInfo };
  } catch (error: any) {
    console.error('Error processing files:', error);
    return { error: error.message || 'An unexpected error occurred during file processing.' };
  }
}

export async function addOrUpdateKeyComment(cnpj: string, key: string, comment: string) {
    if (!cnpj || !key) {
        return { error: "CNPJ e Chave são obrigatórios." };
    }

    try {
        const verificationRef = doc(db, "verifications", cnpj);
        const docSnap = await getDoc(verificationRef);

        if (!docSnap.exists()) {
            return { error: "Verificação não encontrada para este CNPJ." };
        }

        const data = docSnap.data();
        const keys = data.keys || [];

        const keyIndex = keys.findIndex((k: any) => k.key === key);

        if (keyIndex === -1) {
             return { error: "Chave não encontrada no histórico de verificação." };
        }
        
        const updatedKeys = [...keys];
        updatedKeys[keyIndex] = { ...updatedKeys[keyIndex], comment: comment };
        
        await updateDoc(verificationRef, { keys: updatedKeys });
        
        return { success: true, message: "Comentário salvo com sucesso!" };

    } catch (error: any) {
        console.error("Erro ao salvar comentário:", error);
        return { error: error.message || "Ocorreu um erro ao salvar o comentário." };
    }
}

export async function mergeExcelFiles(formData: FormData) {
    try {
        const fileEntries = formData.getAll('files') as File[];
        const mergedWorkbook = XLSX.utils.book_new();
        let sheetCount = 0;

        for (const file of fileEntries) {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            
            for (const sheetName of workbook.SheetNames) {
                // To avoid sheet name conflicts, append a unique identifier
                const newSheetName = `${sheetName}_${sheetCount++}`;
                const worksheet = workbook.Sheets[sheetName];
                XLSX.utils.book_append_sheet(mergedWorkbook, worksheet, newSheetName);
            }
        }

        if (mergedWorkbook.SheetNames.length === 0) {
            return { error: "Nenhuma planilha encontrada nos arquivos carregados." };
        }

        const buffer = XLSX.write(mergedWorkbook, { bookType: 'xlsx', type: 'array' });
        
        // Convert buffer to base64 to send it to the client
        const base64 = Buffer.from(buffer).toString('base64');
        
        return { base64Data: base64 };

    } catch (error: any) {
        console.error("Erro ao agrupar planilhas:", error);
        return { error: error.message || "Ocorreu um erro ao agrupar as planilhas." };
    }
}
