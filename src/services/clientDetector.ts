/**
 * Smart Client Parser: Detects Bank/Client automatically from email sender domain,
 * subject line, or body text.
 */
export function detectClientFromEmail(sender: string = '', subject: string = '', bodyText: string = ''): string {
  const combined = `${sender} ${subject} ${bodyText}`.toLowerCase();
  const senderLower = sender.toLowerCase();

  // 1. Domain-based strict matching
  if (senderLower.includes('@bca.co.id')) return 'BCA';
  if (senderLower.includes('@danamon.co.id')) return 'Danamon';
  if (senderLower.includes('@maybank.co.id')) return 'Maybank';
  if (senderLower.includes('@cimbniaga.co.id')) return 'CIMB Niaga';
  if (senderLower.includes('@bankmega.com')) return 'Bank Mega';
  if (senderLower.includes('@permatabank.co.id')) return 'Permata Bank';
  if (senderLower.includes('@banksinarmas.com')) return 'Sinarmas';
  if (senderLower.includes('@panin.co.id')) return 'Panin';
  if (senderLower.includes('@uob.co.id')) return 'UOB';
  if (senderLower.includes('@btpnsyariah.com') || senderLower.includes('@btpn.com')) return 'BTPN';
  if (senderLower.includes('@hanabank.co.id')) return 'Hana Bank';
  if (senderLower.includes('@ocbc.id') || senderLower.includes('@ocp.id')) return 'OCBC';
  if (senderLower.includes('@nobubank.com')) return 'Nobu Bank';
  if (senderLower.includes('@bankmas.co.id')) return 'Bank Mas';
  if (senderLower.includes('@bankbjb.co.id')) return 'Bank BJB';
  if (senderLower.includes('@bankjatim.co.id')) return 'Bank Jatim';
  if (senderLower.includes('@bni.co.id')) return 'BNI';
  if (senderLower.includes('@bankmandiri.co.id') || senderLower.includes('@mandiri.co.id')) return 'Mandiri';
  if (senderLower.includes('@bri.co.id')) return 'BRI';
  if (senderLower.includes('@adira.co.id')) return 'Adira';
  if (senderLower.includes('@starbucks.co.id')) return 'Starbucks';
  if (senderLower.includes('@smbci.com')) return 'SMBCI';

  // 2. Keyword & Subject/Body matching
  if (combined.includes('bca') || combined.includes('bank central asia')) return 'BCA';
  if (combined.includes('cimb niaga') || combined.includes('cimb')) return 'CIMB Niaga';
  if (combined.includes('danamon')) return 'Danamon';
  if (combined.includes('maybank')) return 'Maybank';
  if (combined.includes('bank mega') || combined.includes('bankmega')) return 'Bank Mega';
  if (combined.includes('permata') || combined.includes('permatabank')) return 'Permata Bank';
  if (combined.includes('sinarmas')) return 'Sinarmas';
  if (combined.includes('panin')) return 'Panin';
  if (combined.includes('uob')) return 'UOB';
  if (combined.includes('btpn')) return 'BTPN';
  if (combined.includes('hana bank') || combined.includes('hanabank')) return 'Hana Bank';
  if (combined.includes('ocbc')) return 'OCBC';
  if (combined.includes('nobu bank') || combined.includes('nobubank')) return 'Nobu Bank';
  if (combined.includes('bank mas') || combined.includes('bankmas')) return 'Bank Mas';
  if (combined.includes('bjb')) return 'Bank BJB';
  if (combined.includes('bank jatim')) return 'Bank Jatim';
  if (combined.includes('bni') || combined.includes('bank negara indonesia')) return 'BNI';
  if (combined.includes('mandiri')) return 'Mandiri';
  if (combined.includes('bri') || combined.includes('bank rakyat indonesia')) return 'BRI';
  if (combined.includes('adira')) return 'Adira';
  if (combined.includes('starbucks')) return 'Starbucks';
  if (combined.includes('smbci')) return 'SMBCI';
  if (combined.includes('hibank')) return 'hiBank';
  if (combined.includes('ganesha')) return 'Bank Ganesha';
  if (combined.includes('muamalat')) return 'Bank Muamalat';

  return '';
}
