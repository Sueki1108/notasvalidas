// src/app/actions.ts
'use server';

import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';

// Type for the file data structure expected by the processor
type DataFrames = { [key: string]: any[] };

export type SpedInfo = {
    cnpj: string;
    companyName: string;
    competence: string;
}

export type KeyCheckResult = {
    keysNotFoundInTxt: string[];
    keysInTxtNotInSheet: string[];
    duplicateKeysInSheet: string[];
    duplicateKeysInTxt: string[];
};

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

export async function validateWithSped(processedData: DataFrames, spedFileContent: string) {
    try {
        let spedInfo: SpedInfo | null = null;
        const allSpedKeys: string[] = [];

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
                    allSpedKeys.push(...matches.map(key => key.startsWith('NFe') ? key.substring(3) : (key.startsWith('CTe') ? key.substring(3) : key)));
                }
            }
        }
        
        let keyCheckResults: KeyCheckResult | null = null;
        const keysInTxt = new Set(allSpedKeys);
        
        if (processedData['Chaves Válidas']) {
            const spreadsheetKeysArray = processedData['Chaves Válidas'].map(row => {
                const key = String(row['Chave de acesso']).trim();
                return key.startsWith('NFe') ? key.substring(3) : (key.startsWith('CTe') ? key.substring(3) : key);
            }).filter(key => key);
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
        
        if (spedInfo && spedInfo.cnpj && keyCheckResults) {
            const keysFromSheet = (processedData['Chaves Válidas']?.map(row => row['Chave de acesso']) || [])
                .map((key: string) => ({
                    key: key,
                    origin: 'planilha',
                    foundInSped: !keyCheckResults!.keysNotFoundInTxt.includes(key.replace(/^NFe|^CTe/, '')),
                    comment: ''
                }));
            
            const keysOnlyInSped = (keyCheckResults.keysInTxtNotInSheet).map((key: string) => ({
                key: key,
                origin: 'sped',
                foundInSped: true, // It's from SPED, so it's found in SPED
                comment: ''
            }));

            const verificationKeys = [...keysFromSheet, ...keysOnlyInSped];

            const stats = {
                totalSheetKeys: keysFromSheet.length,
                totalSpedKeys: allSpedKeys.length,
                foundInBoth: keysFromSheet.filter(k => k.foundInSped).length,
                onlyInSheet: keysFromSheet.filter(k => !k.foundInSped).length,
                onlyInSped: keysOnlyInSped.length,
            };

            const verificationData = {
                ...spedInfo,
                keys: verificationKeys,
                stats: stats,
                verifiedAt: serverTimestamp(),
            };

            await setDoc(doc(db, "verifications", spedInfo.cnpj), verificationData, { merge: true });
        }

        return { keyCheckResults, spedInfo };
    } catch (error: any) {
        console.error('Error during SPED validation:', error);
        return { error: error.message || 'An unexpected error occurred during SPED validation.' };
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

        const keyIndex = keys.findIndex((k: any) => k.key.replace(/^NFe|^CTe/, '') === key.replace(/^NFe|^CTe/, ''));

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

export async function mergeExcelFiles(files: { name: string, content: ArrayBuffer }[]) {
    try {
        const mergedWorkbook = XLSX.utils.book_new();
        const sheetsData: { [sheetName: string]: any[] } = {};

        for (const file of files) {
            const workbook = XLSX.read(file.content, { type: 'buffer' });
            for (const sheetName of workbook.SheetNames) {
                if (!sheetsData[sheetName]) {
                    sheetsData[sheetName] = [];
                }
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);
                sheetsData[sheetName].push(...jsonData);
            }
        }
        
        if (Object.keys(sheetsData).length === 0) {
            return { error: "Nenhuma planilha encontrada nos arquivos carregados." };
        }

        for (const sheetName in sheetsData) {
            if (sheetsData[sheetName].length > 0) {
                const worksheet = XLSX.utils.json_to_sheet(sheetsData[sheetName]);
                XLSX.utils.book_append_sheet(mergedWorkbook, worksheet, sheetName);
            }
        }

        if (mergedWorkbook.SheetNames.length === 0) {
            return { error: "Nenhum dado válido encontrado para agrupar." };
        }
        
        const buffer = XLSX.write(mergedWorkbook, { bookType: 'xlsx', type: 'array' });
        
        // Convert ArrayBuffer to base64
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        
        return { base64Data: base64 };

    } catch (error: any) {
        console.error("Erro ao agrupar planilhas:", error);
        return { error: error.message || "Ocorreu um erro ao agrupar as planilhas." };
    }
}
