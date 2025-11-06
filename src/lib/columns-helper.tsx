"use client"

import { ColumnDef } from "@tanstack/react-table"
import { ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"

export function getColumns<TData>(data: TData[]): ColumnDef<TData>[] {
  if (!data || data.length === 0) {
    return []
  }

  const firstRowKeys = Object.keys(data[0] as object) as (keyof TData)[]
  
  // Custom order: 'Número da NF' should be second.
  const customOrder = ['Número da NF'];
  
  const orderedKeys = [
      ...customOrder,
      ...firstRowKeys.filter(key => !customOrder.includes(String(key)))
  ];

  const finalKeys = orderedKeys.filter(key => firstRowKeys.includes(key as any));

  return finalKeys.map((key) => ({
    accessorKey: key,
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          {String(key)}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
        const value = row.getValue(key as string);
        if (value === null || typeof value === 'undefined' || value === 'N/A') {
          return <span className="text-muted-foreground italic">N/A</span>;
        }
        // Format number values to Brazilian currency format
        if (typeof value === 'number') {
             return <div>{value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>;
        }
        return <div>{String(value)}</div>;
    },
  }))
}
