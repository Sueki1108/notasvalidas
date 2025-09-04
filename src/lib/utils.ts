import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatCnpj = (cnpj: string) => {
    if (!cnpj) return '';
    const digitsOnly = cnpj.replace(/\D/g, '');
    if (digitsOnly.length !== 14) return cnpj;
    return digitsOnly.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
};
    