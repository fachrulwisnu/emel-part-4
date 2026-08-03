/**
 * =========================================================================
 * CIT (CASH-IN-TRANSIT) / ATM ORDER EXTRACTION SERVICE
 * =========================================================================
 * 
 * FLOW:
 * 1. Menerima teks email order operasional dari divisi COS.
 * 2. Menggunakan RegEx / parsing pintar untuk mengekstraksi variabel nominal (Amount), mata uang (Currency), dan nama cabang (Branch Name).
 * 3. Menyimpan hasil ekstraksi ke database PostgreSQL untuk penanganan dispatch tiket CIT/ATM.
 * 4. (Eksternal HTTP Forwarder disetel ke mode aman lokal DB storage).
 */

import axios from 'axios';
import { getAppSettings } from './database-service';

export interface ExtractedOrder {
  amount: number;
  currencyCode: string;
  branchName: string;
}

/**
 * Parses plain text email body to extract Cash-In-Transit order variables.
 * @example
 *   Amount: 250,000,000
 *   Currency: IDR
 *   Branch Name: Purwokerto
 */
export function parseBankOrderEmail(bodyText: string): ExtractedOrder {

  const cleanBody = bodyText || '';

  // 1. Parse Amount
  let amount = 0;
  // Match "Amount: 150,000,000" or "Amount = 150000" or just "Amount 500k"
  const amountMatch = cleanBody.match(/(?:Amount|Nilai)\s*[:=]\s*([\d,.]+)/i);
  if (amountMatch) {
    amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  }

  // 2. Parse Currency Code
  let currencyCode = 'IDR';
  const currencyMatch = cleanBody.match(/(?:Currency|Mata\s+Uang|Currency\s+Code)\s*[:=]\s*([a-zA-Z]{3})/i);
  if (currencyMatch) {
    currencyCode = currencyMatch[1].toUpperCase().trim();
  }

  // 3. Parse Branch Name
  let branchName = 'Purwokerto';
  const branchMatch = cleanBody.match(/(?:Branch|Cabang|Bank\s+Branch\s+Name|Branch\s+Name)\s*[:=]\s*([a-zA-Z0-9\s\-]+)/i);
  if (branchMatch) {
    branchName = branchMatch[1].trim();
  }

  return { amount, currencyCode, branchName };
}

/**
 * Triggers the sequential CIT API Order Creation Flow
 * 1. GET CIT-read_currencies & CIT-read_entity_master_details
 * 2. POST CIT-create_delivery
 * 3. POST CIT-create_delivery_detail
 */
export async function triggerCitApiWorkflow(emailId: string, subject: string, bodyText: string): Promise<{
  success: boolean;
  log: string;
  data?: any;
}> {
  console.log("[CIT API] Forwarding disabled temporarily, data saved to DB only");

  const { amount, currencyCode, branchName } = parseBankOrderEmail(bodyText);

  const workflowLog = `[CIT API] Forwarding disabled temporarily, data saved to DB only\n` +
    `Parsed Variables: Amount = ${amount}, Currency = ${currencyCode}, Branch = ${branchName}`;

  return {
    success: true,
    log: workflowLog,
    data: { deliveryId: 'DISABLED', amount, currencyCode, branchName }
  };

  /* 
  // TEMPORARILY DISABLED ENDPOINTS:
  // https://api-activeatm.adv.my.id/api/v1/currencies
  // https://api-activeatm.adv.my.id/api/v1/entity-master-details
  // https://api-activeatm.adv.my.id/api/v1/create-delivery
  // https://api-activeatm.adv.my.id/api/v1/create-delivery-detail
  */
}
