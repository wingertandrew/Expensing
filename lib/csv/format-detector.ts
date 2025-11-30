/**
 * CSV Format Detection
 *
 * Detects the format of a CSV file by analyzing header columns.
 * Supports Amazon Business Order Reports, American Express statements, and generic CSVs.
 */

export type CSVFormat = 'amazon' | 'amex' | 'generic'

/**
 * Detect CSV format based on header row
 *
 * @param headers - Array of column headers from the first row
 * @returns Detected format: 'amazon', 'amex', or 'generic'
 *
 * Detection logic:
 * - Amazon: Requires 3+ signature columns (Order ID, ASIN, Charge Identifier, etc.)
 * - AmEx: Requires 3+ signature columns (Date, Description, Amount, Reference)
 * - Generic: Fallback when no specific format is detected
 */
export function detectCSVFormat(headers: string[]): CSVFormat {
  // Normalize headers (trim whitespace, case-insensitive comparison)
  const normalizedHeaders = headers.map(h => h.trim().toLowerCase())

  // Amazon Business Order Report signature columns
  const amazonSignatures = [
    'order id',
    'asin',
    'charge identifier',
    'payment instrument type',
    'item quantity'
  ]

  const amazonMatches = amazonSignatures.filter(sig =>
    normalizedHeaders.some(h => h === sig)
  ).length

  if (amazonMatches >= 3) {
    return 'amazon'
  }

  // American Express statement signature columns
  const amexSignatures = [
    'date',
    'description',
    'amount',
    'reference'
  ]

  const amexMatches = amexSignatures.filter(sig =>
    normalizedHeaders.some(h => h === sig)
  ).length

  if (amexMatches >= 3) {
    return 'amex'
  }

  // Default to generic format
  return 'generic'
}

/**
 * Get format-specific information for display
 */
export function getFormatInfo(format: CSVFormat): {
  name: string
  description: string
  features: string[]
} {
  switch (format) {
    case 'amazon':
      return {
        name: 'Amazon Business Order Report',
        description: 'Multiple items per order will be automatically grouped',
        features: [
          'Automatic order aggregation by Order ID',
          'Item-level detail preserved',
          'Business metadata (GL Code, Department, Cost Center)',
          'Matching uses Payment Amount and Payment Date'
        ]
      }
    case 'amex':
      return {
        name: 'American Express Statement',
        description: 'One transaction per row',
        features: [
          'Automatic duplicate detection',
          'Merchant and category tracking',
          'Reference number for exact matching'
        ]
      }
    case 'generic':
      return {
        name: 'Generic CSV',
        description: 'Manual column mapping required',
        features: [
          'Flexible column mapping',
          'Supports custom formats',
          'Optional duplicate detection'
        ]
      }
  }
}
