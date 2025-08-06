'use server';

import * as XLSX from 'xlsx';
import { processDataFrames } from '@/lib/excel-processor';
import * as fs from 'fs/promises';
import * as path from 'path';

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
    const textFileContents: string[] = [];
    const fileEntries = formData.getAll('files');

    // Process all file entries from formData
    for (const entry of fileEntries) {
        if (entry instanceof File) {
            const fieldName = entry.name; // The original field name is stored in the file name
            if (!dataFrames[fieldName]) {
                dataFrames[fieldName] = [];
            }
            const buffer = await entry.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            // Process all sheets in the workbook
            for (const sheetName of workbook.SheetNames) {
              const worksheet = workbook.Sheets[sheetName];
              const jsonData = XLSX.utils.sheet_to_json(worksheet);
              dataFrames[fieldName].push(...jsonData);
            }
        }
    }

    const spedTxtFiles = formData.getAll('SPED TXT');
    for(const spedFile of spedTxtFiles) {
        if(typeof spedFile === 'string') {
            textFileContents.push(spedFile);
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

async function getAllFilePaths(dir: string): Promise<string[]> {
    const dirents = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
        dirents.map((dirent) => {
            const res = path.resolve(dir, dirent.name);
            // Exclude node_modules and .next directories
            if (dirent.isDirectory() && dirent.name !== 'node_modules' && dirent.name !== '.next') {
                return getAllFilePaths(res);
            }
            // Exclude lock files and binary files that might cause issues
            if (!res.endsWith('package-lock.json') && !res.endsWith('.DS_Store')) {
                 return Promise.resolve(res);
            }
            return Promise.resolve([]);
        })
    );
    return Array.prototype.concat(...files);
}

export async function getProjectFilesAsText(): Promise<string> {
    try {
        const projectRoot = path.join(process.cwd());
        const allPaths = await getAllFilePaths(projectRoot);
        
        let combinedContent = "";

        for (const filePath of allPaths) {
            try {
                // Ensure we only read files
                 const stats = await fs.stat(filePath);
                 if (stats.isFile()) {
                    const relativePath = path.relative(projectRoot, filePath);
                     // Skip files that might be problematic or very large
                    if (relativePath.startsWith('public/') || relativePath.startsWith('app/') || relativePath.startsWith('components/') || relativePath.startsWith('lib/') || relativePath.startsWith('hooks/') || relativePath.startsWith('ai/') || !/[\\/]/.test(relativePath)) {
                        const content = await fs.readFile(filePath, 'utf-8');
                        combinedContent += `--- FILE: ${relativePath} ---\n\n`;
                        combinedContent += content;
                        combinedContent += "\n\n\n";
                    }
                 }
            } catch (readError) {
                 // Ignore errors for single files (e.g., permission denied)
                 console.warn(`Could not read file: ${filePath}`, readError);
            }
        }
        
        return combinedContent;
    } catch (error: any) {
        console.error('Error reading project files:', error);
        return `Error reading project files: ${error.message}`;
    }
}
