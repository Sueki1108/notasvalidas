/**
 * @fileOverview Enhances a spreadsheet with insights based on its data.
 *
 * - enhanceSpreadsheetWithInsights - A function that takes spreadsheet data and returns insights.
 * - EnhanceSpreadsheetWithInsightsInput - The input type for the enhanceSpreadsheetWithInsights function.
 * - EnhanceSpreadsheetWithInsightsOutput - The return type for the enhanceSpreadsheetWithInsights function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const EnhanceSpreadsheetWithInsightsInputSchema = z.object({
  spreadsheetData: z
    .string()
    .describe('The data from the spreadsheet in CSV format.'),
});
export type EnhanceSpreadsheetWithInsightsInput = z.infer<
  typeof EnhanceSpreadsheetWithInsightsInputSchema
>;

const EnhanceSpreadsheetWithInsightsOutputSchema = z.object({
  insights: z.string().describe('Insights derived from the spreadsheet data.'),
});
export type EnhanceSpreadsheetWithInsightsOutput = z.infer<
  typeof EnhanceSpreadsheetWithInsightsOutputSchema
>;

export async function enhanceSpreadsheetWithInsights(
  input: EnhanceSpreadsheetWithInsightsInput
): Promise<EnhanceSpreadsheetWithInsightsOutput> {
  return enhanceSpreadsheetWithInsightsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'spreadsheetInsightsPrompt',
  input: {schema: EnhanceSpreadsheetWithInsightsInputSchema},
  output: {schema: EnhanceSpreadsheetWithInsightsOutputSchema},
  prompt: `You are an expert data analyst. Analyze the following spreadsheet data and provide key insights:

Spreadsheet Data:
{{{spreadsheetData}}}

Focus on identifying trends, anomalies, and important facts.  Structure your response as a short paragraph.`,
});

const enhanceSpreadsheetWithInsightsFlow = ai.defineFlow(
  {
    name: 'enhanceSpreadsheetWithInsightsFlow',
    inputSchema: EnhanceSpreadsheetWithInsightsInputSchema,
    outputSchema: EnhanceSpreadsheetWithInsightsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
