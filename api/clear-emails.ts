import { dbClearEmails } from '../src/database-service';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed. Use POST.' });
  }

  try {
    await dbClearEmails();
    return res.status(200).json({
      success: true,
      message: 'Database cleared successfully.'
    });
  } catch (err: any) {
    console.error('API Error in /api/clear-emails:', err);
    return res.status(500).json({
      success: false,
      message: err.message || String(err)
    });
  }
}
