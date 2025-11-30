"use server"

import { ActionState } from "@/lib/actions"
import { getCurrentUser } from "@/lib/auth"
import { EXPORT_AND_IMPORT_FIELD_MAP } from "@/models/export_and_import"
import { createTransaction, TransactionData } from "@/models/transactions"
import { Transaction } from "@/prisma/client"
import { parse } from "@fast-csv/parse"
import { revalidatePath } from "next/cache"
import { differenceInDays } from "date-fns"
import { findBestMatch, isAlreadyMatchedInBatch } from "@/lib/matching/finder"
import { mergeTransaction, validateMergeCompatibility } from "@/lib/matching/merger"
import { shouldAutoMerge } from "@/lib/matching/algorithm"
import { createImportBatch, updateImportBatch, incrementBatchCount } from "@/models/import-batches"
import { createImportRow, markRowProcessed, markRowError, markRowSkipped } from "@/models/import-rows"
import { createTransactionMatch } from "@/models/transaction-matches"
import { updateProgress, getOrCreateProgress } from "@/models/progress"
import { detectCSVFormat, CSVFormat } from "@/lib/csv/format-detector"
import { aggregateAmazonRows, AmazonRawRow, getAggregationStats } from "@/lib/csv/amazon-aggregator"
import { mapAmazonOrderToTransaction } from "@/lib/csv/amazon-mapper"

export async function parseCSVAction(
  _prevState: ActionState<{ rows: string[][], format: CSVFormat }> | null,
  formData: FormData
): Promise<ActionState<{ rows: string[][], format: CSVFormat }>> {
  const file = formData.get("file") as File
  if (!file) {
    return { success: false, error: "No file uploaded" }
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return { success: false, error: "Only CSV files are allowed" }
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const rows: string[][] = []

    const parser = parse()
      .on("data", (row) => rows.push(row))
      .on("error", (error) => {
        throw error
      })
    parser.write(buffer)
    parser.end()

    // Wait for parsing to complete
    await new Promise((resolve) => parser.on("end", resolve))

    // Detect CSV format from header row
    const format = rows.length > 0 ? detectCSVFormat(rows[0]) : 'generic'

    console.log(`CSV format detected: ${format} (${rows.length} rows)`)

    return { success: true, data: { rows, format } }
  } catch (error) {
    console.error("Error parsing CSV:", error)
    return { success: false, error: "Failed to parse CSV file" }
  }
}

export async function saveTransactionsAction(
  _prevState: ActionState<Transaction> | null,
  formData: FormData
): Promise<ActionState<Transaction>> {
  const user = await getCurrentUser()
  try {
    const rows = JSON.parse(formData.get("rows") as string) as Record<string, unknown>[]

    for (const row of rows) {
      const transactionData: Record<string, unknown> = {}
      for (const [fieldCode, value] of Object.entries(row)) {
        const fieldDef = EXPORT_AND_IMPORT_FIELD_MAP[fieldCode]
        if (fieldDef?.import) {
          transactionData[fieldCode] = await fieldDef.import(user.id, value as string)
        } else {
          transactionData[fieldCode] = value as string
        }
      }

      await createTransaction(user.id, transactionData)
    }

    revalidatePath("/import/csv")
    revalidatePath("/transactions")

    return { success: true }
  } catch (error) {
    console.error("Error saving transactions:", error)
    return { success: false, error: "Failed to save transactions: " + error }
  }
}

/**
 * Import CSV with automatic duplicate detection and matching
 */
export async function saveTransactionsWithMatchingAction(
  _prevState: ActionState<{ batchId: string }> | null,
  formData: FormData
): Promise<ActionState<{ batchId: string }>> {
  const user = await getCurrentUser()

  try {
    // Get configuration
    const matchingEnabled = process.env.RECEIPT_MATCH_ENABLED !== "false"
    const autoMergeThreshold = parseInt(process.env.RECEIPT_MATCH_AUTO_MERGE_THRESHOLD || "90")

    // Parse form data
    const rows = JSON.parse(formData.get("rows") as string) as Record<string, unknown>[]
    const filename = (formData.get("filename") as string) || "upload.csv"
    const columnMappings = JSON.parse(formData.get("columnMappings") as string) as Record<
      string,
      string
    >
    const progressId = formData.get("progressId") as string
    const format = (formData.get("format") as CSVFormat) || 'generic'

    console.log(`Processing ${rows.length} rows in ${format} format`)

    // Process rows based on format
    let processedTransactions: Array<{ data: Partial<TransactionData>, originalRow: Record<string, unknown> }>
    const originalRowCount = rows.length

    if (format === 'amazon') {
      // Amazon: Aggregate rows by Order ID, then map to transactions
      console.log('Amazon format detected - aggregating items by order...')

      // Convert raw rows to AmazonRawRow format (header mapping)
      const amazonRows: AmazonRawRow[] = rows.map(row => {
        const amazonRow: Record<string, string> = {}
        for (const [key, value] of Object.entries(row)) {
          amazonRow[key] = String(value || '')
        }
        return amazonRow as unknown as AmazonRawRow
      })

      // Aggregate rows into orders
      const aggregatedOrders = aggregateAmazonRows(amazonRows)
      const stats = getAggregationStats(amazonRows, aggregatedOrders)

      console.log(`Amazon aggregation: ${stats.totalRows} rows → ${stats.totalOrders} orders (${stats.reductionPercent}% reduction, avg ${stats.avgItemsPerOrder} items/order)`)

      // Map to transaction data
      processedTransactions = aggregatedOrders.map(order => ({
        data: mapAmazonOrderToTransaction(order),
        originalRow: { orderId: order.orderId, chargeIdentifier: order.chargeIdentifier }
      }))
    } else {
      // AmEx/Generic: Process row-by-row (existing logic)
      processedTransactions = await Promise.all(
        rows.map(async (row) => ({
          data: await parseCSVRowToTransaction(user.id, row),
          originalRow: row
        }))
      )
    }

    console.log(`Prepared ${processedTransactions.length} transactions for import`)

    // Create import batch
    const batch = await createImportBatch(user.id, {
      filename,
      totalRows: processedTransactions.length,
      metadata: {
        columnMappings: format === 'generic' ? columnMappings : {},
        format,
        originalRowCount, // Track original for audit (Amazon only)
      },
    })

    // Initialize progress tracking
    await getOrCreateProgress(user.id, progressId, "csv_import", {
      batchId: batch.id,
      matched: 0,
      created: 0,
      flagged: 0,
      errors: 0,
    }, processedTransactions.length)

    // Process each transaction
    const CHUNK_SIZE = 100
    for (let i = 0; i < processedTransactions.length; i += CHUNK_SIZE) {
      const chunk = processedTransactions.slice(i, i + CHUNK_SIZE)

      for (const [index, { data: parsedData, originalRow }] of chunk.entries()) {
        const rowNumber = i + index + 1

        try {
          // Create import row record
          const importRow = await createImportRow({
            batchId: batch.id,
            rowNumber,
            rawData: originalRow,
            parsedData: parsedData as Record<string, unknown>,
          })

          // Skip matching if disabled or no amount/date
          if (!matchingEnabled || !parsedData.total || !parsedData.issuedAt) {
            const transaction = await createTransaction(user.id, parsedData)
            await markRowProcessed(importRow.id, transaction.id, "created")
            await incrementBatchCount(batch.id, user.id, "createdCount")
            continue
          }

          // Find potential matches
          const bestMatch = await findBestMatch(user.id, {
            total: parsedData.total as number,
            issuedAt: parsedData.issuedAt as Date,
            importReference: parsedData.importReference as string | undefined,
          })

          if (bestMatch) {
            // Check if already matched in this batch (prevent duplicate matching)
            const alreadyMatched = await isAlreadyMatchedInBatch(
              bestMatch.transaction.id,
              batch.id
            )

            if (alreadyMatched) {
              await markRowSkipped(importRow.id, "Already matched in this batch")
              await incrementBatchCount(batch.id, user.id, "skippedCount")
              continue
            }

            // Calculate days difference for audit
            const daysDiff = Math.abs(
              differenceInDays(parsedData.issuedAt as Date, bestMatch.transaction.issuedAt!)
            )

            // Check if should auto-merge
            if (shouldAutoMerge(bestMatch.confidence) && bestMatch.confidence >= autoMergeThreshold) {
              // Auto-merge
              try {
                validateMergeCompatibility(bestMatch.transaction, parsedData)
                const { transaction, mergedFields } = await mergeTransaction(
                  bestMatch.transaction,
                  parsedData,
                  bestMatch.confidence
                )

                // Record the match
                await createTransactionMatch({
                  batchId: batch.id,
                  transactionId: transaction.id,
                  confidence: bestMatch.confidence,
                  matchedAmount: parsedData.total as number,
                  matchedDate: parsedData.issuedAt as Date,
                  existingDate: bestMatch.transaction.issuedAt!,
                  daysDifference: daysDiff,
                  status: "auto_merged",
                  csvData: originalRow,
                  mergedFields,
                })

                await markRowProcessed(importRow.id, transaction.id, "matched")
                await incrementBatchCount(batch.id, user.id, "matchedCount")
              } catch (mergeError) {
                // If merge fails, create new instead
                console.error("Merge failed:", mergeError)
                const transaction = await createTransaction(user.id, parsedData)
                await markRowError(importRow.id, `Merge failed: ${mergeError}`)
                await incrementBatchCount(batch.id, user.id, "errorCount")
              }
            } else {
              // Flag for manual review
              await createTransactionMatch({
                batchId: batch.id,
                transactionId: bestMatch.transaction.id,
                confidence: bestMatch.confidence,
                matchedAmount: parsedData.total as number,
                matchedDate: parsedData.issuedAt as Date,
                existingDate: bestMatch.transaction.issuedAt!,
                daysDifference: daysDiff,
                status: "flagged",
                csvData: originalRow,
              })

              await markRowSkipped(
                importRow.id,
                `Flagged for review (${bestMatch.confidence}% confidence)`
              )
              await incrementBatchCount(batch.id, user.id, "skippedCount")
            }
          } else {
            // No match found - create new transaction
            const transaction = await createTransaction(user.id, parsedData)
            await markRowProcessed(importRow.id, transaction.id, "created")
            await incrementBatchCount(batch.id, user.id, "createdCount")
          }
        } catch (error) {
          console.error(`Error processing row ${rowNumber}:`, error)
          await incrementBatchCount(batch.id, user.id, "errorCount")
        }
      }

      // Update progress after each chunk
      const stats = {
        batchId: batch.id,
        matched: (await getBatchStats(batch.id, user.id))?.matchedCount || 0,
        created: (await getBatchStats(batch.id, user.id))?.createdCount || 0,
        flagged: (await getBatchStats(batch.id, user.id))?.skippedCount || 0,
        errors: (await getBatchStats(batch.id, user.id))?.errorCount || 0,
      }

      await updateProgress(user.id, progressId, {
        current: Math.min(i + CHUNK_SIZE, processedTransactions.length),
        data: stats,
      })
    }

    // Mark batch as completed
    await updateImportBatch(batch.id, user.id, {
      status: "completed",
      completedAt: new Date(),
    })

    revalidatePath("/import/csv")
    revalidatePath("/import/history")
    revalidatePath("/transactions")

    return { success: true, data: { batchId: batch.id } }
  } catch (error) {
    console.error("Error importing with matching:", error)
    return { success: false, error: `Failed to import CSV: ${error}` }
  }
}

/**
 * Parse CSV row to transaction data with field transformations
 */
async function parseCSVRowToTransaction(
  userId: string,
  row: Record<string, unknown>
): Promise<TransactionData> {
  const transactionData: Record<string, unknown> = {}

  for (const [fieldCode, value] of Object.entries(row)) {
    const fieldDef = EXPORT_AND_IMPORT_FIELD_MAP[fieldCode]
    if (fieldDef?.import) {
      transactionData[fieldCode] = await fieldDef.import(userId, value as string)
    } else {
      transactionData[fieldCode] = value
    }
  }

  // Handle American Express negative amounts (normalize to positive)
  if (transactionData.total && typeof transactionData.total === "number") {
    transactionData.total = Math.abs(transactionData.total)
  }

  return transactionData as TransactionData
}

/**
 * Get batch statistics (helper to avoid circular dependency)
 */
async function getBatchStats(batchId: string, userId: string) {
  const { getBatchStats: getStats } = await import("@/models/import-batches")
  return await getStats(batchId, userId)
}
