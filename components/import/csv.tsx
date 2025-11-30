"use client"

import {
  parseCSVAction,
  saveTransactionsAction,
  saveTransactionsWithMatchingAction,
} from "@/app/(app)/import/csv/actions"
import { FormError } from "@/components/forms/error"
import { Button } from "@/components/ui/button"
import { Field } from "@/prisma/client"
import { Loader2, Play, Upload, CheckCircle2, AlertCircle, PlusCircle, Flag } from "lucide-react"
import { useRouter } from "next/navigation"
import { startTransition, useActionState, useEffect, useState } from "react"
import { generateUUID } from "@/lib/utils"
import { CSVFormat, getFormatInfo } from "@/lib/csv/format-detector"

const MAX_PREVIEW_ROWS = 100

export function ImportCSVTable({ fields }: { fields: Field[] }) {
  const router = useRouter()
  const [parseState, parseAction, isParsing] = useActionState(parseCSVAction, null)
  const [saveState, saveAction, isSaving] = useActionState(saveTransactionsAction, null)
  const [saveMatchingState, saveMatchingAction, isSavingWithMatching] = useActionState(
    saveTransactionsWithMatchingAction,
    null
  )

  const [csvSettings, setCSVSettings] = useState({
    skipHeader: true,
    enableMatching: true, // Enable matching by default
  })
  const [csvData, setCSVData] = useState<string[][]>([])
  const [csvFormat, setCSVFormat] = useState<CSVFormat>('generic')
  const [columnMappings, setColumnMappings] = useState<string[]>([])
  const [uploadedFilename, setUploadedFilename] = useState<string>("")
  const [importStats, setImportStats] = useState<{
    matched: number
    created: number
    flagged: number
    errors: number
  } | null>(null)

  useEffect(() => {
    if (parseState?.success && parseState.data) {
      const { rows, format } = parseState.data
      setCSVData(rows)
      setCSVFormat(format)

      if (rows.length > 0) {
        if (format === 'amazon') {
          // Amazon: No user mapping needed (auto-detected columns)
          setColumnMappings([])
        } else {
          // Generic/AmEx: Auto-detect column mappings
          setColumnMappings(
            rows[0].map((value) => {
              const field = fields.find((field) => field.code === value || field.name === value)
              return field?.code || ""
            })
          )
        }
      } else {
        setColumnMappings([])
      }
    }
  }, [parseState, fields])

  useEffect(() => {
    if (saveState?.success) {
      router.push("/transactions")
    }
  }, [saveState, router])

  useEffect(() => {
    if (saveMatchingState?.success && saveMatchingState.data?.batchId) {
      // Redirect to import history to see results
      router.push(`/import/history/${saveMatchingState.data.batchId}`)
    }
  }, [saveMatchingState, router])

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadedFilename(file.name)
    const formData = new FormData()
    formData.append("file", file)

    startTransition(async () => {
      await parseAction(formData)
    })
  }

  const handleMappingChange = (columnIndex: number, fieldCode: string) => {
    setColumnMappings((prev) => {
      const state = [...prev]
      state[columnIndex] = fieldCode
      return state
    })
  }

  const handleSave = async () => {
    if (csvData.length === 0) return

    // Skip validation for Amazon format (no mapping needed)
    if (csvFormat !== 'amazon' && !isAtLeastOneFieldMapped(columnMappings)) {
      alert("Please map at least one column to a field")
      return
    }

    const formData = new FormData()

    if (csvFormat === 'amazon') {
      // Amazon: Send raw rows (already in correct format, skip header)
      const startIndex = csvSettings.skipHeader ? 1 : 0
      const amazonRows = csvData.slice(startIndex).map((row) => {
        const amazonRow: Record<string, unknown> = {}
        // Create object with column headers as keys
        csvData[0].forEach((header, index) => {
          amazonRow[header] = row[index] || ''
        })
        return amazonRow
      })

      formData.append("rows", JSON.stringify(amazonRows))
    } else {
      // Generic/AmEx: Map columns to fields (existing logic)
      const startIndex = csvSettings.skipHeader ? 1 : 0
      const processedRows = csvData.slice(startIndex).map((row) => {
        const processedRow: Record<string, unknown> = {}

        columnMappings.forEach((fieldCode, columnIndex) => {
          if (!fieldCode || !row[columnIndex]) return
          processedRow[fieldCode] = row[columnIndex]
        })

        return processedRow
      })

      formData.append("rows", JSON.stringify(processedRows))
    }

    formData.append("format", csvFormat)

    // Use matching action if enabled
    if (csvSettings.enableMatching) {
      const progressId = generateUUID()
      formData.append("filename", uploadedFilename || "upload.csv")
      formData.append("columnMappings", JSON.stringify(Object.fromEntries(
        columnMappings.map((code, idx) => [idx, code]).filter(([_, code]) => code)
      )))
      formData.append("progressId", progressId)

      startTransition(async () => {
        await saveMatchingAction(formData)
      })
    } else {
      // Use simple import without matching
      startTransition(async () => {
        await saveAction(formData)
      })
    }
  }

  return (
    <>
      {csvData.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 h-full min-h-[400px]">
          <p className="text-muted-foreground">Upload your CSV file to import transactions</p>
          <div className="flex flex-row gap-5 mt-8">
            <div>
              <input type="file" accept=".csv" className="hidden" id="csv-file" onChange={handleFileChange} />
              <Button type="button" onClick={() => document.getElementById("csv-file")?.click()}>
                {isParsing ? "Parsing..." : <Upload className="mr-2" />} Import from CSV
              </Button>
            </div>
          </div>
          {parseState?.error && <FormError>{parseState.error}</FormError>}
        </div>
      )}

      {csvData.length > 0 && (
        <div>
          <header className="flex flex-wrap items-center justify-between gap-2 mb-8">
            <h2 className="flex flex-row gap-3 md:gap-5">
              <span className="text-3xl font-bold tracking-tight">Import {csvData.length} items from CSV</span>
            </h2>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={isSaving || isSavingWithMatching}>
                {isSaving || isSavingWithMatching ? (
                  <>
                    <Loader2 className="animate-spin" />
                    {csvSettings.enableMatching ? "Importing with matching..." : "Importing..."}
                  </>
                ) : (
                  <>
                    <Play />
                    {csvSettings.enableMatching
                      ? `Import & Match ${csvData.length} transactions`
                      : `Import ${csvData.length} transactions`}
                  </>
                )}
              </Button>
            </div>
          </header>

          {/* Format detection indicator */}
          {csvFormat !== 'generic' && (
            <div className="mb-4 p-4 bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/40 border border-blue-200/50 rounded-md">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-blue-900">{getFormatInfo(csvFormat).name} detected</p>
                  <p className="text-sm text-blue-700 mt-1">{getFormatInfo(csvFormat).description}</p>
                  <ul className="mt-2 space-y-1">
                    {getFormatInfo(csvFormat).features.map((feature, idx) => (
                      <li key={idx} className="text-xs text-blue-600 flex items-start gap-2">
                        <span className="text-blue-400 mt-0.5">•</span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4 mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4"
                id="skip-header"
                defaultChecked={csvSettings.skipHeader}
                onChange={(e) => setCSVSettings({ ...csvSettings, skipHeader: e.target.checked })}
              />
              <span>First row is a header</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4"
                id="enable-matching"
                checked={csvSettings.enableMatching}
                onChange={(e) =>
                  setCSVSettings({ ...csvSettings, enableMatching: e.target.checked })
                }
              />
              <span className="flex items-center gap-2">
                Enable duplicate detection & auto-merge
                <span className="text-xs text-muted-foreground">
                  (Matches by exact amount + date within ±3 days)
                </span>
              </span>
            </label>

            {csvSettings.enableMatching && (
              <div className="ml-6 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md text-sm">
                <p className="font-medium mb-1">How matching works:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
                    <span>
                      ≥90% confidence (same day or ±1 day) → <strong>Auto-merged</strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Flag className="h-4 w-4 mt-0.5 text-yellow-600" />
                    <span>
                      70-89% confidence (±2-3 days) → <strong>Flagged for review</strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <PlusCircle className="h-4 w-4 mt-0.5 text-blue-600" />
                    <span>
                      No match found → <strong>Created as new</strong>
                    </span>
                  </li>
                </ul>
              </div>
            )}
          </div>

          {(saveMatchingState?.error || saveState?.error) && (
            <FormError>{saveMatchingState?.error || saveState?.error}</FormError>
          )}

          {/* Column mapping table (hidden for Amazon format) */}
          {csvFormat !== 'amazon' && (
          <div className="rounded-md border">
            <div className="relative w-full overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="[&_tr]:border-b">
                  <tr className="border-b transition-colors hover:bg-muted/50">
                    {csvData[0].map((_, index) => (
                      <th key={index} className="h-12 min-w-[200px] px-4 text-left align-middle font-medium">
                        <select
                          className="w-full p-2 border rounded-md"
                          value={columnMappings[index] || ""}
                          onChange={(e) => handleMappingChange(index, e.target.value)}
                        >
                          <option value="">Skip column</option>
                          {fields.map((field) => (
                            <option key={field.code} value={field.code}>
                              {field.name}
                            </option>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {csvData.slice(0, MAX_PREVIEW_ROWS).map((row, rowIndex) => (
                    <tr
                      key={rowIndex}
                      className={`border-b transition-colors hover:bg-muted/50 ${
                        rowIndex === 0 && csvSettings.skipHeader ? "line-through text-muted-foreground" : ""
                      }`}
                    >
                      {csvData[0].map((_, colIndex) => (
                        <td key={colIndex} className="p-4 align-middle">
                          {(row[colIndex] || "").toString().slice(0, 256)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {csvData.length > MAX_PREVIEW_ROWS && (
            <p className="text-muted-foreground mt-4">and {csvData.length - MAX_PREVIEW_ROWS} more entries...</p>
          )}
        </div>
      )}
    </>
  )
}

function isAtLeastOneFieldMapped(columnMappings: string[]) {
  return columnMappings.some((mapping) => mapping !== "")
}
