/**
 * Amazon Business Order Report CSV Aggregator
 *
 * Amazon CSVs have one row per item purchased. This module aggregates
 * multiple rows into single orders by grouping by Order ID + Charge Identifier.
 *
 * Example:
 * - CSV has 65 rows (one per item)
 * - Results in ~10-15 aggregated orders (one per unique order/charge combination)
 */

import { parse } from 'date-fns'

/**
 * Raw row structure from Amazon Business Order Report CSV
 * Note: Amazon uses Excel formula notation for some fields (e.g., ="6674")
 */
export type AmazonRawRow = {
  'Order Date': string
  'Order ID': string
  'Payment Date': string
  'Payment Amount': string
  'Charge Identifier': string
  'Payment Instrument Type': string
  'Invoice Number': string
  'Purchase Order Number': string
  'ASIN': string
  'Title': string
  'Brand': string
  'Manufacturer': string
  'Item Quantity': string
  'Item Subtotal': string
  'Item Shipping & Handling': string
  'Item Promotion': string
  'Item Tax': string
  'Item Net Total': string
  'GL Code': string
  'Department': string
  'Cost Center': string
  'Project Code': string
  'Location': string
  'Custom Field 1': string
  'Custom Field 2': string
  'Custom Field 3': string
}

/**
 * Individual item within an Amazon order
 */
export type AmazonOrderItem = {
  asin: string
  title: string
  brand: string
  manufacturer: string
  quantity: number
  subtotal: number // in cents
  shipping: number // in cents
  promotion: number // in cents (typically negative)
  tax: number // in cents
  netTotal: number // in cents
}

/**
 * Aggregated Amazon order (multiple CSV rows combined into one order)
 */
export type AmazonAggregatedOrder = {
  orderId: string
  chargeIdentifier: string
  orderDate: Date
  paymentDate: Date
  paymentAmount: number // in cents - this is what matches credit card statement
  paymentInstrumentType: string
  invoiceNumber?: string
  purchaseOrderNumber?: string
  items: AmazonOrderItem[]
  metadata: {
    glCode?: string
    department?: string
    costCenter?: string
    projectCode?: string
    location?: string
    customField1?: string
    customField2?: string
    customField3?: string
  }
}

/**
 * Clean Excel formula notation from Amazon CSV values
 * Amazon exports some fields with ="value" instead of "value"
 *
 * @example
 * cleanExcelFormula('="6674"') // Returns: "6674"
 * cleanExcelFormula('"6674"') // Returns: "6674"
 * cleanExcelFormula('6674') // Returns: "6674"
 */
function cleanExcelFormula(value: string): string {
  if (!value) return ''

  // Remove Excel formula notation: ="..." → ...
  const cleaned = value.replace(/^="(.+)"$/, '$1')

  // Also handle regular quoted strings
  return cleaned.replace(/^"(.+)"$/, '$1')
}

/**
 * Parse currency string to cents (integer)
 * Handles both regular and Excel formula notation
 *
 * @example
 * parseCurrency('123.45') // Returns: 12345
 * parseCurrency('="123.45"') // Returns: 12345
 * parseCurrency('-50.00') // Returns: -5000
 */
function parseCurrency(value: string): number {
  if (!value) return 0

  const cleaned = cleanExcelFormula(value)
  const num = parseFloat(cleaned)

  return isNaN(num) ? 0 : Math.round(num * 100)
}

/**
 * Parse date string in MM/DD/YYYY format
 *
 * @example
 * parseDate('08/02/2024') // Returns: Date object for August 2, 2024
 */
function parseAmazonDate(value: string): Date {
  if (!value) return new Date()

  const cleaned = cleanExcelFormula(value)

  // Try MM/DD/YYYY format (Amazon's standard format)
  const parsed = parse(cleaned, 'MM/dd/yyyy', new Date())

  if (isNaN(parsed.getTime())) {
    console.warn(`Failed to parse Amazon date: "${value}"`)
    return new Date()
  }

  return parsed
}

/**
 * Parse integer from string, handling Excel formula notation
 */
function parseInteger(value: string, defaultValue: number = 0): number {
  if (!value) return defaultValue

  const cleaned = cleanExcelFormula(value)
  const num = parseInt(cleaned, 10)

  return isNaN(num) ? defaultValue : num
}

/**
 * Aggregate Amazon CSV rows by Order ID + Charge Identifier
 *
 * Amazon CSVs have one row per item. Orders with multiple items will have
 * multiple rows with the same Order ID and Charge Identifier. This function
 * groups those rows together and creates a single aggregated order with
 * an items array.
 *
 * Key design decisions:
 * - Uses Payment Amount (not sum of items) for the transaction total
 * - Uses Payment Date (not Order Date) for matching against credit card statements
 * - Groups by Order ID + Charge Identifier composite key (handles split shipments)
 * - Preserves all item-level detail in items array
 * - Extracts business metadata from first row (GL Code, Department, etc.)
 *
 * @param rows - Array of raw Amazon CSV rows
 * @returns Array of aggregated orders
 */
export function aggregateAmazonRows(
  rows: AmazonRawRow[]
): AmazonAggregatedOrder[] {
  // Group rows by Order ID + Charge Identifier composite key
  const orderMap = new Map<string, AmazonRawRow[]>()

  for (const row of rows) {
    // Skip rows with missing critical fields
    if (!row['Order ID'] || !row['Charge Identifier']) {
      console.warn('Skipping row with missing Order ID or Charge Identifier:', row)
      continue
    }

    const key = `${row['Order ID']}:${row['Charge Identifier']}`

    if (!orderMap.has(key)) {
      orderMap.set(key, [])
    }

    orderMap.get(key)!.push(row)
  }

  // Convert grouped rows to aggregated orders
  const orders: AmazonAggregatedOrder[] = []

  for (const [key, rowGroup] of orderMap.entries()) {
    if (rowGroup.length === 0) continue

    // Use first row for order-level fields (same across all rows in group)
    const firstRow = rowGroup[0]

    const order: AmazonAggregatedOrder = {
      orderId: firstRow['Order ID'],
      chargeIdentifier: firstRow['Charge Identifier'],
      orderDate: parseAmazonDate(firstRow['Order Date']),
      paymentDate: parseAmazonDate(firstRow['Payment Date']),
      paymentAmount: parseCurrency(firstRow['Payment Amount']), // Critical: order total, not item sum
      paymentInstrumentType: firstRow['Payment Instrument Type'] || 'Unknown',
      invoiceNumber: firstRow['Invoice Number'] || undefined,
      purchaseOrderNumber: firstRow['Purchase Order Number'] || undefined,
      items: [],
      metadata: {
        glCode: firstRow['GL Code'] || undefined,
        department: firstRow['Department'] || undefined,
        costCenter: firstRow['Cost Center'] || undefined,
        projectCode: firstRow['Project Code'] || undefined,
        location: firstRow['Location'] || undefined,
        customField1: firstRow['Custom Field 1'] || undefined,
        customField2: firstRow['Custom Field 2'] || undefined,
        customField3: firstRow['Custom Field 3'] || undefined,
      }
    }

    // Collect all items from grouped rows
    for (const row of rowGroup) {
      // Skip rows without ASIN (likely not actual items)
      if (!row['ASIN']) {
        console.warn('Skipping item row without ASIN:', row)
        continue
      }

      order.items.push({
        asin: row['ASIN'],
        title: row['Title'] || 'Unknown Item',
        brand: row['Brand'] || '',
        manufacturer: row['Manufacturer'] || '',
        quantity: parseInteger(row['Item Quantity'], 1),
        subtotal: parseCurrency(row['Item Subtotal']),
        shipping: parseCurrency(row['Item Shipping & Handling']),
        promotion: parseCurrency(row['Item Promotion']), // Usually negative
        tax: parseCurrency(row['Item Tax']),
        netTotal: parseCurrency(row['Item Net Total']),
      })
    }

    // Only add orders that have at least one valid item
    if (order.items.length > 0) {
      orders.push(order)
    } else {
      console.warn('Skipping order with no valid items:', key)
    }
  }

  return orders
}

/**
 * Get aggregation statistics for logging/debugging
 */
export function getAggregationStats(
  rows: AmazonRawRow[],
  orders: AmazonAggregatedOrder[]
): {
  totalRows: number
  totalOrders: number
  reductionPercent: number
  avgItemsPerOrder: number
} {
  const totalRows = rows.length
  const totalOrders = orders.length
  const reductionPercent = totalOrders > 0
    ? Math.round(((totalRows - totalOrders) / totalRows) * 100)
    : 0

  const totalItems = orders.reduce((sum, order) => sum + order.items.length, 0)
  const avgItemsPerOrder = totalOrders > 0
    ? Math.round((totalItems / totalOrders) * 10) / 10
    : 0

  return {
    totalRows,
    totalOrders,
    reductionPercent,
    avgItemsPerOrder
  }
}
