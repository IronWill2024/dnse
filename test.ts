import { buildSignature, formatDateHeader } from './src/dnse/utils/common.utils';
import axios from 'axios';
import * as crypto from 'crypto';

async function test() {
  const accountNo = "0003732509";
  const apiKey = "eyJvcmciOiJkbnNlIiwiaWQiOiI2MTliMDI1ZGQwNzc0Yzc3OWY5ZGVjY2M2MDZjOWU4MyIsImgiOiJtdXJtdXIxMjgifQ==";
  const apiSecret = "KM_EkxJjp4K-l0-lJ-j05Awzy6Ok3XFG9LGZRpaEc7H78hNDlQvWNUE2hMPPcKO-0RDeNz4ru0sqI-OqJem1mg";
  const otpType = "smart_otp";
  const passcode = process.argv[2] || "229776";

  const method = 'POST';
  const path = '/registration/trading-token';
  const algorithm = 'hmac-sha256';
  const baseUrl = 'https://openapi.dnse.com.vn';

  const dateValue = formatDateHeader(new Date());
  const nonce = crypto.randomUUID().replace(/-/g, '');

  const { headers, signature } = buildSignature(
    apiSecret,
    method,
    path,
    dateValue,
    algorithm,
    nonce,
  );

  let signatureHeaderValue = `Signature keyId="${apiKey}",algorithm="${algorithm}",headers="${headers}",signature="${signature}",nonce="${nonce}"`;

  const requestHeaders = {
    'version': '2026-05-07',
    'Date': dateValue,
    'X-Signature': signatureHeaderValue,
    'x-api-key': apiKey,
    'Content-Type': 'application/json'
  };

  try {
    const response = await axios.post(`${baseUrl}${path}`, {
      otpType,
      passcode
    }, { headers: requestHeaders });
    console.log("SUCCESS:");
    console.log(response.data);
  } catch (error: any) {
    console.log("ERROR:");
    console.log(error.response?.data || error.message);
  }
}

test();
